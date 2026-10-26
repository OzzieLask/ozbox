import type { ReactNode } from "react";
import "./Glass.css";

type GlassProps = {
  className?: string;
  children?: ReactNode;
};

/**
 * A glass surface that fills its window. Windows draws the blur (Acrylic) behind
 * the page; this component layers the sheen, bevelled rim and colour fringe on top.
 * Everything glass-specific lives here so it can later be swapped for true
 * refraction without touching the widgets that use it.
 */
export function Glass({ className, children }: GlassProps) {
  return (
    <div className={`glass${className ? ` ${className}` : ""}`}>
      <div className="glass__fringe" aria-hidden />
      <div className="glass__content">{children}</div>
    </div>
  );
}
