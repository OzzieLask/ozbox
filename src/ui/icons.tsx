import type { SVGProps } from "react";

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
