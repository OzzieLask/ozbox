import type { ReactNode, SVGProps } from "react";

// 20px line icons drawn on a 24-unit grid, stroked in the current text colour.
function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    />
  );
}

export function NotesIcon() {
  return (
    <Icon>
      <rect x="4.5" y="3.5" width="15" height="17" rx="3" />
      <path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4" />
    </Icon>
  );
}

export function ChecklistIcon() {
  return (
    <Icon width="18" height="18">
      <rect x="3.5" y="4.5" width="5" height="5" rx="1.2" />
      <path d="M4.8 15.5l1.4 1.4 2.6-2.8M12 7h8.5M12 15.5h8.5" />
    </Icon>
  );
}

export function FolderIcon() {
  return (
    <Icon width="18" height="18">
      <path d="M3.5 7.5a2 2 0 0 1 2-2h3.6l2 2.2h7.4a2 2 0 0 1 2 2v7.8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
    </Icon>
  );
}

export function MusicIcon() {
  return (
    <Icon>
      <path d="M9 17.5V5.5l11-2v12" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="15.5" r="2.5" />
    </Icon>
  );
}

/** Speaker with 0–2 sound waves by level, or a slash when muted. */
export function SpeakerIcon({ muted, level }: { muted: boolean; level: number }) {
  return (
    <Icon width="16" height="16">
      <path d="M4 9.5h3l4.5-4v13L7 14.5H4z" />
      {muted || level === 0 ? (
        <path d="M16 9.5l5 5M21 9.5l-5 5" />
      ) : (
        <>
          <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
          {level > 0.5 && <path d="M18 7a7 7 0 0 1 0 10" />}
        </>
      )}
    </Icon>
  );
}

// Filled transport icons for the media controls.
function Solid(props: { children: ReactNode; size?: number }) {
  const size = props.size ?? 18;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      {props.children}
    </svg>
  );
}

export function PlayIcon() {
  return (
    <Solid size={20}>
      <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
    </Solid>
  );
}

export function PauseIcon() {
  return (
    <Solid size={20}>
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </Solid>
  );
}

export function NextIcon() {
  return (
    <Solid>
      <path d="M5 6.2v11.6a.9.9 0 0 0 1.4.75L15 12.75a.9.9 0 0 0 0-1.5L6.4 5.45A.9.9 0 0 0 5 6.2z" />
      <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
    </Solid>
  );
}

export function PreviousIcon() {
  return (
    <Solid>
      <path d="M19 6.2v11.6a.9.9 0 0 1-1.4.75L9 12.75a.9.9 0 0 1 0-1.5l8.6-5.8A.9.9 0 0 1 19 6.2z" />
      <rect x="5" y="5" width="2.5" height="14" rx="1" />
    </Solid>
  );
}

export function WhiteboardIcon() {
  return (
    <Icon>
      <path d="M4.5 19.5l1.2-4.3L16 4.9a2.1 2.1 0 0 1 3 3L8.8 18.3z" />
      <path d="M14.5 6.5l3 3M13 20h7" />
    </Icon>
  );
}

export function PinIcon() {
  return (
    <Icon>
      <rect x="3.5" y="5" width="17" height="13" rx="2.5" />
      <path d="M3.5 9h17M12 18v3M9 21h6" />
    </Icon>
  );
}

export function TimerIcon() {
  return (
    <Icon>
      <circle cx="12" cy="13.5" r="7" />
      <path d="M12 13.5V10M10 3h4M18.5 6.5l-1.3 1.3" />
    </Icon>
  );
}
