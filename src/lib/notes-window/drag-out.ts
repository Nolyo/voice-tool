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
