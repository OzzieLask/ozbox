import { useEffect, useState } from "react";
import { Orb } from "./orb/Orb";
import { placeOrbWindow } from "./window/position";

export default function App() {
  // Placeholder until Phase 2: clicking the orb just toggles its glow.
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const cleanup = placeOrbWindow();
    return () => {
      cleanup.then((unlisten) => unlisten());
    };
  }, []);

  return (
    <main className="stage">
      <Orb active={open} onClick={() => setOpen((o) => !o)} />
    </main>
  );
}
