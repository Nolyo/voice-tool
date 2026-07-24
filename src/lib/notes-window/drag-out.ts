/** Pointer must travel this far (px) from pointerdown before a tab drag
 *  starts — below it, the gesture stays a plain click. */
export const DRAG_START_THRESHOLD_PX = 6;

export function exceedsDragThreshold(
  startX: number,
  startY: number,
  x: number,
  y: number,
): boolean {
  return Math.hypot(x - startX, y - startY) >= DRAG_START_THRESHOLD_PX;
}

/** Client coordinates are viewport-relative and DPI-free: outside the
 *  viewport ⇒ outside the OS window ⇒ this is a detach drop. The final
 *  window position is resolved by Rust from the OS cursor (`at_cursor`),
 *  so no CSS→physical conversion happens in JS (spec §6). */
export function isOutsideViewport(
  clientX: number,
  clientY: number,
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  return (
    clientX < 0 ||
    clientY < 0 ||
    clientX > viewportWidth ||
    clientY > viewportHeight
  );
}

/** Releases within this distance (px) of the tab bar still count as "on the
 *  bar" — a small forgiveness band so a sloppy release right at its edge
 *  doesn't detach. */
export const STRIP_EXIT_MARGIN_PX = 8;

export interface StripRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Notepad-style drop criterion (spec §6): releasing OUTSIDE the tab bar —
 *  even inside the app window — is a detach drop; releasing on the bar
 *  cancels. Unlike an outside-the-window criterion, this stays reachable
 *  when the window is maximized on a single monitor. */
export function isOutsideStrip(
  clientX: number,
  clientY: number,
  rect: StripRect,
  margin: number = STRIP_EXIT_MARGIN_PX,
): boolean {
  return (
    clientX < rect.left - margin ||
    clientX > rect.right + margin ||
    clientY < rect.top - margin ||
    clientY > rect.bottom + margin
  );
}
