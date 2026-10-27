//! Per-app volume: the system volume plus one slider per app with sound (Zoom,
//! Chrome, Spotify…), with mute and live level meters. Uses Windows Core Audio,
//! the same source as Windows' own Volume Mixer.
//!
//! Windows tracks volume per audio *session*, and an app can have several (Chrome
//! has one per sound-playing process), so sessions are grouped by the app that owns
//! them. WebView2 helper processes are attributed to their host app, which gives
//! OzBox's pinned pages a slider of their own.
//!
//! COM objects here aren't thread-safe, so each command starts from scratch on its
//! own thread; that takes about a millisecond.

use std::collections::HashMap;

use serde::Serialize;

#[derive(Serialize)]
pub struct Channel {
    volume: f32,
    muted: bool,
}

#[derive(Serialize)]
pub struct AppChannel {
    /// Lowercase exe name, e.g. "spotify"; pass back to `set_volume`. Matches the
    /// Now Playing source key.
    key: String,
    name: String,
    volume: f32,
    muted: bool,
}

#[derive(Serialize)]
pub struct Mixer {
    master: Channel,
    apps: Vec<AppChannel>,
}

#[derive(Serialize)]
pub struct Peaks {
    master: f32,
    apps: HashMap<String, f32>,
}

#[tauri::command]
pub async fn audio_mixer() -> Result<Mixer, String> {
    #[cfg(windows)]
    return imp::mixer().map_err(|e| e.message());
    #[cfg(not(windows))]
    Err("Per-app volume is only supported on Windows.".into())
}

/// Current output levels (0–1), for the meters. Cheap enough to poll ~12x a second.
#[tauri::command]
pub async fn audio_peaks() -> Result<Peaks, String> {
    #[cfg(windows)]
    return imp::peaks().map_err(|e| e.message());
    #[cfg(not(windows))]
    Err("Per-app volume is only supported on Windows.".into())
}

/// `target` is "master" or an app key. Sets whichever of `volume` (0–1) / `muted` is given.
#[tauri::command]
pub async fn set_volume(target: String, volume: Option<f32>, muted: Option<bool>) -> Result<(), String> {
    #[cfg(windows)]
    return imp::set(&target, volume, muted).map_err(|e| e.message());
    #[cfg(not(windows))]
    {
        let _ = (target, volume, muted);
        Err("Per-app volume is only supported on Windows.".into())
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ptr::null;

    use windows::core::{Interface, Result};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::Endpoints::{IAudioEndpointVolume, IAudioMeterInformation};
    use windows::Win32::Media::Audio::{
        eConsole, eRender, AudioSessionStateExpired, IAudioSessionControl2,
        IAudioSessionManager2, IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume,
        MMDeviceEnumerator,
    };
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };

    const SYSTEM_SOUNDS: &str = "system sounds";

    fn speakers() -> Result<IMMDevice> {
        unsafe {
            // Harmless if this thread already joined the multithreaded apartment.
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let devices: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            devices.GetDefaultAudioEndpoint(eRender, eConsole)
        }
    }

    struct Session {
        key: String,
        name: String,
        volume: ISimpleAudioVolume,
        meter: Option<IAudioMeterInformation>,
    }

    /// Every live audio session on the default speakers, labelled with its owning app.
    fn sessions(device: &IMMDevice) -> Result<Vec<Session>> {
        let processes = process_table();
        let mut out = Vec::new();
        unsafe {
            let manager: IAudioSessionManager2 = device.Activate(CLSCTX_ALL, None)?;
            let list = manager.GetSessionEnumerator()?;
            for i in 0..list.GetCount()? {
                let control = list.GetSession(i)?;
                if control.GetState()? == AudioSessionStateExpired {
                    continue;
                }
                let control2: IAudioSessionControl2 = control.cast()?;
                let (key, name) = if control2.IsSystemSoundsSession().is_ok()
                    && control2.IsSystemSoundsSession().0 == 0
                {
                    (SYSTEM_SOUNDS.to_string(), "System sounds".to_string())
                } else {
                    let Some(exe) = owning_app(&processes, control2.GetProcessId()?) else {
                        continue;
                    };
                    (exe.to_lowercase(), display_name(&exe))
                };
                out.push(Session {
                    key,
                    name,
                    volume: control.cast()?,
                    meter: control.cast().ok(),
                });
            }
        }
        Ok(out)
    }

    pub fn mixer() -> Result<Mixer> {
        let device = speakers()?;
        let master = unsafe {
            let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
            Channel {
                volume: endpoint.GetMasterVolumeLevelScalar()?,
                muted: endpoint.GetMute()?.as_bool(),
            }
        };
        // One entry per app, in first-seen order; an app reads as muted only if all its sessions are.
        let mut apps: Vec<AppChannel> = Vec::new();
        for s in sessions(&device)? {
            let (volume, muted) = unsafe { (s.volume.GetMasterVolume()?, s.volume.GetMute()?.as_bool()) };
            match apps.iter_mut().find(|a| a.key == s.key) {
                Some(app) => {
                    app.volume = app.volume.max(volume);
                    app.muted &= muted;
                }
                None => apps.push(AppChannel { key: s.key, name: s.name, volume, muted }),
            }
        }
        // System sounds last, like Windows' mixer keeps them out of the way.
        apps.sort_by_key(|a| a.key == SYSTEM_SOUNDS);
        Ok(Mixer { master, apps })
    }

    pub fn peaks() -> Result<Peaks> {
        let device = speakers()?;
        let master = unsafe {
            let meter: IAudioMeterInformation = device.Activate(CLSCTX_ALL, None)?;
            meter.GetPeakValue()?
        };
        let mut apps: HashMap<String, f32> = HashMap::new();
        for s in sessions(&device)? {
            let peak = s.meter.and_then(|m| unsafe { m.GetPeakValue() }.ok()).unwrap_or(0.0);
            let entry = apps.entry(s.key).or_default();
            *entry = entry.max(peak);
        }
        Ok(Peaks { master, apps })
    }

    pub fn set(target: &str, volume: Option<f32>, muted: Option<bool>) -> Result<()> {
        let device = speakers()?;
        unsafe {
            if target == "master" {
                let endpoint: IAudioEndpointVolume = device.Activate(CLSCTX_ALL, None)?;
                if let Some(v) = volume {
                    endpoint.SetMasterVolumeLevelScalar(v.clamp(0.0, 1.0), null())?;
                }
                if let Some(m) = muted {
                    endpoint.SetMute(m, null())?;
                }
                return Ok(());
            }
            for s in sessions(&device)?.into_iter().filter(|s| s.key == target) {
                if let Some(v) = volume {
                    s.volume.SetMasterVolume(v.clamp(0.0, 1.0), null())?;
                }
                if let Some(m) = muted {
                    s.volume.SetMute(m, null())?;
                }
            }
        }
        Ok(())
    }

    /// pid -> (parent pid, exe name without ".exe"), from one snapshot of all processes.
    fn process_table() -> HashMap<u32, (u32, String)> {
        let mut table = HashMap::new();
        unsafe {
            let Ok(snapshot) = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) else {
                return table;
            };
            let mut entry = PROCESSENTRY32W {
                dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
                ..Default::default()
            };
            let mut ok = Process32FirstW(snapshot, &mut entry).is_ok();
            while ok {
                let len = entry.szExeFile.iter().position(|&c| c == 0).unwrap_or(entry.szExeFile.len());
                let exe = String::from_utf16_lossy(&entry.szExeFile[..len]);
                let exe = exe.strip_suffix(".exe").or_else(|| exe.strip_suffix(".EXE")).unwrap_or(&exe).to_string();
                table.insert(entry.th32ProcessID, (entry.th32ParentProcessID, exe));
                ok = Process32NextW(snapshot, &mut entry).is_ok();
            }
            let _ = CloseHandle(snapshot);
        }
        table
    }

    /// The app a process belongs to. WebView2 runs in helper processes, so walk up to
    /// whichever app hosts it (OzBox for pinned pages, Teams for Teams, …).
    fn owning_app(table: &HashMap<u32, (u32, String)>, mut pid: u32) -> Option<String> {
        let mut exe = table.get(&pid)?.1.clone();
        for _ in 0..8 {
            if !exe.eq_ignore_ascii_case("msedgewebview2") {
                break;
            }
            let (parent, _) = table.get(&pid)?;
            pid = *parent;
            match table.get(&pid) {
                Some((_, parent_exe)) => exe = parent_exe.clone(),
                None => break,
            }
        }
        Some(exe)
    }

    fn display_name(exe: &str) -> String {
        match exe.to_lowercase().as_str() {
            "msedge" => "Edge".into(),
            "chrome" => "Chrome".into(),
            "firefox" => "Firefox".into(),
            "ozbox" => "OzBox pins".into(),
            "msedgewebview2" => "Web apps".into(),
            _ if exe.chars().all(|c| !c.is_uppercase()) => {
                let mut chars = exe.chars();
                chars.next().map(|c| c.to_uppercase().chain(chars).collect()).unwrap_or_default()
            }
            _ => exe.to_string(),
        }
    }
}
