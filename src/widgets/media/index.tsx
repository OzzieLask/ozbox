import { MusicIcon } from "../../ui/icons";
import type { WidgetDefinition } from "../types";
import { MediaPanel } from "./MediaPanel";
import { useNowPlaying } from "./model";
import "./media.css";

/** Little bouncing equalizer bars on the dock icon while something plays. */
function MediaGlance() {
  const { track } = useNowPlaying();
  if (!track?.playing) return null;
  return (
    <span className="glance-eq" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

export const mediaWidget: WidgetDefinition = {
  id: "media",
  label: "Now playing & volume",
  Icon: MusicIcon,
  panelSize: { width: 300, height: 236 },
  Panel: MediaPanel,
  Glance: MediaGlance,
};
