import { useState } from "react";
import { NextIcon, PauseIcon, PlayIcon, PreviousIcon } from "../../ui/icons";
import { useTicker } from "../useTicker";
import { mixerKeyFor, useMixer } from "./audio";
import { MixerView } from "./MixerView";
import { chooseSource, control, formatMs, livePosition, useNowPlaying } from "./model";
import { VolumeRow } from "./VolumeRow";

type Tab = "playing" | "mixer";

export function MediaPanel() {
  const [tab, setTab] = useState<Tab>("playing");
  return (
    <div className="media-panel">
      <div className="media-panel__tabs" role="tablist">
        {(["playing", "mixer"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            className={`media-panel__tab${tab === t ? " is-active" : ""}`}
            onClick={() => setTab(t)}
          >
            {t === "playing" ? "Playing" : "Mixer"}
          </button>
        ))}
      </div>
      {tab === "playing" ? <PlayingView /> : <MixerView />}
    </div>
  );
}

function PlayingView() {
  const { sources, track } = useNowPlaying();
  const [mixer] = useMixer(track !== null);
  const now = useTicker(track?.playing ?? false, 250);
  const [error, setError] = useState<string | null>(null);

  const run = (action: Parameters<typeof control>[0], positionMs?: number) => {
    setError(null);
    control(action, positionMs).catch((err) => setError(String(err)));
  };

  if (!track) {
    return (
      <div className="media media--empty">
        <p>Nothing is playing.</p>
        <p className="media__hint">Play something in Spotify, a browser or any media app.</p>
      </div>
    );
  }

  // This app's own volume, if Windows' mixer knows it (matched by app name).
  const appChannel = mixer?.apps.find((a) => a.key === mixerKeyFor(track.source.id));

  const position = livePosition(track, now);
  const hasTimeline = track.duration_ms > 0;
  const progress = hasTimeline ? position / track.duration_ms : 0;

  return (
    <div className="media">
      <div className="media__track">
        <div className="media__art">
          {track.art ? <img src={track.art} alt="" /> : <span className="media__art-blank">♪</span>}
        </div>
        <div className="media__text">
          <div className="media__title" title={track.title}>
            {track.title || "Unknown title"}
          </div>
          <div className="media__artist" title={track.artist}>
            {[track.artist, track.album].filter(Boolean).join(" · ") || track.source.app}
          </div>
          {sources.length > 1 ? (
            <div className="media__sources">
              {sources.map((s) => (
                <button
                  key={s.id}
                  className={`media__source${s.id === track.source.id ? " is-active" : ""}`}
                  onClick={() => chooseSource(s.id)}
                >
                  {s.app}
                </button>
              ))}
            </div>
          ) : (
            <div className="media__app">{track.source.app}</div>
          )}
        </div>
      </div>

      {hasTimeline && (
        <div className="media__timeline">
          <span>{formatMs(position)}</span>
          <div
            className={`media__bar${track.can_seek ? " can-seek" : ""}`}
            title={track.can_seek ? "Click to jump" : undefined}
            onClick={(e) => {
              if (!track.can_seek) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const fraction = (e.clientX - rect.left) / rect.width;
              run("seek", Math.round(fraction * track.duration_ms));
            }}
          >
            <div className="media__bar-fill" style={{ transform: `scaleX(${progress})` }} />
          </div>
          <span>{formatMs(track.duration_ms)}</span>
        </div>
      )}

      <div className="media__controls">
        <button aria-label="Previous" disabled={!track.can_previous} onClick={() => run("previous")}>
          <PreviousIcon />
        </button>
        <button className="media__play" aria-label={track.playing ? "Pause" : "Play"} onClick={() => run("toggle")}>
          {track.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button aria-label="Next" disabled={!track.can_next} onClick={() => run("next")}>
          <NextIcon />
        </button>
      </div>

      {appChannel && (
        <VolumeRow target={appChannel.key} volume={appChannel.volume} muted={appChannel.muted} />
      )}

      {error && <p className="media__error">{error}</p>}
    </div>
  );
}
