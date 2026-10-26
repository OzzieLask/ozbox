import { useEffect, useState } from "react";

/**
 * The current time, re-rendering every `periodMs` while `active`. When inactive it
 * doesn't schedule anything, so idle widgets cost nothing.
 */
export function useTicker(active: boolean, periodMs: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), periodMs);
    return () => clearInterval(id);
  }, [active, periodMs]);

  return active ? now : Date.now();
}
