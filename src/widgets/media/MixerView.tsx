import { useMixer, usePeaks } from "./audio";
import { VolumeRow } from "./VolumeRow";

/** System volume plus one slider per app with sound, each with a live level meter. */
export function MixerView() {
  const [mixer] = useMixer();
  const peaks = usePeaks(true);

  if (!mixer) return <p className="media__hint media__loading">Loading…</p>;

  return (
    <div className="mixer">
      <VolumeRow
        target="master"
        label="System"
        volume={mixer.master.volume}
        muted={mixer.master.muted}
        peak={peaks?.master ?? 0}
      />
      <div className="mixer__apps">
        {mixer.apps.length === 0 && <p className="media__hint">No apps are using sound.</p>}
        {mixer.apps.map((app) => (
          <VolumeRow
            key={app.key}
            target={app.key}
            label={app.name}
            volume={app.volume}
            muted={app.muted}
            peak={peaks?.apps[app.key] ?? 0}
          />
        ))}
      </div>
    </div>
  );
}
