import type { Mode } from "./shared";

// Tiny 12px marks for the badges.
export function ModeMark({ mode }: { mode: Exclude<Mode, "off"> }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {mode === "draw" ? (
        <path d="M4 20l1.2-4.3L16 4.9a2.1 2.1 0 0 1 3 3L8.3 18.8z" />
      ) : (
        <>
          <path d="M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12s-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" />
          <circle cx="12" cy="12" r="2.8" />
        </>
      )}
    </svg>
  );
}
