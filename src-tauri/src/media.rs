//! Now Playing: what's playing in Spotify, a browser, or any app that reports to
//! Windows' media controls (the same source as the volume-key media flyout), plus
//! play/pause, next, previous and seek. No logins or API keys involved.
//!
//! The frontend polls `now_playing` only while the widget is on screen.

use serde::Serialize;

#[derive(Serialize, Clone)]
pub struct Source {
    /// Windows' id for the app (its AppUserModelID); pass back to pick it.
    id: String,
    app: String,
}

#[derive(Serialize)]
pub struct Track {
    source: Source,
    title: String,
    artist: String,
    album: String,
    /// Album art as a data: URL, if the app provides one.
    art: Option<String>,
    playing: bool,
    /// Position and length in ms; length 0 when the app doesn't report a timeline.
    position_ms: i64,
    duration_ms: i64,
    /// When `position_ms` was measured (Unix ms), so the UI can advance it smoothly.
    measured_at_ms: i64,
    can_previous: bool,
    can_next: bool,
    can_seek: bool,
}

#[derive(Serialize)]
pub struct NowPlaying {
    sources: Vec<Source>,
    track: Option<Track>,
}

/// What's playing. `source` picks a specific app; otherwise Windows' current one.
#[tauri::command]
pub async fn now_playing(source: Option<String>) -> Result<NowPlaying, String> {
    #[cfg(windows)]
    return imp::now_playing(source.as_deref()).map_err(|e| e.message());
    #[cfg(not(windows))]
    {
        let _ = source;
        Ok(NowPlaying { sources: Vec::new(), track: None })
    }
}

/// `action` is "toggle", "next", "previous" or "seek" (with `position_ms`).
#[tauri::command]
pub async fn media_control(
    source: Option<String>,
    action: String,
    position_ms: Option<i64>,
) -> Result<(), String> {
    #[cfg(windows)]
    return imp::control(source.as_deref(), &action, position_ms).map_err(|e| e.message());
    #[cfg(not(windows))]
    {
        let _ = (source, action, position_ms);
        Err("Media controls are only supported on Windows.".into())
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::sync::Mutex;

    use base64::Engine;
    use windows::core::{Error, Interface, Result, HRESULT};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Storage::Streams::{DataReader, IInputStream};
    use windows_future::IAsyncOperation;

    /// Windows times are in 100ns ticks; DateTime counts from 1601.
    const TICKS_PER_MS: i64 = 10_000;
    const UNIX_EPOCH_TICKS: i64 = 116_444_736_000_000_000;

    static MANAGER: Mutex<Option<Manager>> = Mutex::new(None);
    /// Album art for the last track seen: (track key, data URL). Fetched once per track.
    static ART: Mutex<Option<(String, Option<String>)>> = Mutex::new(None);

    fn manager() -> Result<Manager> {
        let mut cached = MANAGER.lock().unwrap();
        if let Some(m) = cached.as_ref() {
            return Ok(m.clone());
        }
        let m = Manager::RequestAsync()?.join()?;
        *cached = Some(m.clone());
        Ok(m)
    }

    /// "Spotify.exe" -> "Spotify"; "SpotifyAB.SpotifyMusic_x!Spotify" -> "Spotify";
    /// "MSEdge" -> "Edge".
    fn app_name(id: &str) -> String {
        let name = id.rsplit('!').next().unwrap_or(id);
        let name = name.strip_suffix(".exe").unwrap_or(name);
        match name.to_ascii_lowercase().as_str() {
            "msedge" => "Edge".into(),
            "chrome" => "Chrome".into(),
            "firefox" => "Firefox".into(),
            _ => name.to_string(),
        }
    }

    fn source_of(session: &Session) -> Result<Source> {
        let id = session.SourceAppUserModelId()?.to_string();
        Ok(Source { app: app_name(&id), id })
    }

    /// The session for `source`, or Windows' current session.
    fn session(source: Option<&str>) -> Result<Option<Session>> {
        let manager = manager()?;
        if let Some(wanted) = source {
            for s in manager.GetSessions()? {
                if s.SourceAppUserModelId()?.to_string() == wanted {
                    return Ok(Some(s));
                }
            }
        }
        // GetCurrentSession fails (rather than returning None) when nothing is playing.
        Ok(manager.GetCurrentSession().ok())
    }

    pub fn now_playing(source: Option<&str>) -> Result<NowPlaying> {
        let sources = manager()?
            .GetSessions()?
            .into_iter()
            .filter_map(|s| source_of(&s).ok())
            .collect();
        let track = match session(source)? {
            Some(s) => Some(track(&s)?),
            None => None,
        };
        Ok(NowPlaying { sources, track })
    }

    fn track(session: &Session) -> Result<Track> {
        let props = session.TryGetMediaPropertiesAsync()?.join()?;
        let info = session.GetPlaybackInfo()?;
        let controls = info.Controls()?;
        let timeline = session.GetTimelineProperties()?;

        let title = props.Title()?.to_string();
        let artist = props.Artist()?.to_string();
        let album = props.AlbumTitle()?.to_string();
        let source = source_of(session)?;

        let key = format!("{}\u{1f}{title}\u{1f}{artist}\u{1f}{album}", source.id);
        let art = {
            let mut cached = ART.lock().unwrap();
            match cached.as_ref() {
                Some((k, art)) if *k == key => art.clone(),
                _ => {
                    let art = props.Thumbnail().ok().and_then(|t| read_art(&t).ok());
                    *cached = Some((key, art.clone()));
                    art
                }
            }
        };

        Ok(Track {
            source,
            title,
            artist,
            album,
            art,
            playing: info.PlaybackStatus()? == Status::Playing,
            position_ms: timeline.Position()?.Duration / TICKS_PER_MS,
            duration_ms: timeline.EndTime()?.Duration / TICKS_PER_MS,
            measured_at_ms: (timeline.LastUpdatedTime()?.UniversalTime - UNIX_EPOCH_TICKS)
                / TICKS_PER_MS,
            can_previous: controls.IsPreviousEnabled()?,
            can_next: controls.IsNextEnabled()?,
            can_seek: controls.IsPlaybackPositionEnabled()?,
        })
    }

    fn read_art(thumbnail: &windows::Storage::Streams::IRandomAccessStreamReference) -> Result<String> {
        let stream = thumbnail.OpenReadAsync()?.join()?;
        let size = stream.Size()? as u32;
        let reader = DataReader::CreateDataReader(&stream.cast::<IInputStream>()?)?;
        reader.LoadAsync(size)?.cast::<IAsyncOperation<u32>>()?.join()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes)?;
        let mime = stream.ContentType()?.to_string();
        let mime = if mime.is_empty() { "image/png".to_string() } else { mime };
        Ok(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    }

    pub fn control(source: Option<&str>, action: &str, position_ms: Option<i64>) -> Result<()> {
        let Some(s) = session(source)? else {
            return Err(Error::new(HRESULT(0x80004005u32 as i32), "Nothing is playing."));
        };
        let done = match action {
            "toggle" => s.TryTogglePlayPauseAsync()?.join()?,
            "next" => s.TrySkipNextAsync()?.join()?,
            "previous" => s.TrySkipPreviousAsync()?.join()?,
            "seek" => s
                .TryChangePlaybackPositionAsync(position_ms.unwrap_or(0) * TICKS_PER_MS)?
                .join()?,
            _ => false,
        };
        if done {
            Ok(())
        } else {
            Err(Error::new(HRESULT(0x80004005u32 as i32), "The app didn't accept that."))
        }
    }
}
