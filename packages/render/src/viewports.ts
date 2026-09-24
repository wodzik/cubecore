/**
 * Back view — a second camera on the opposite side of the cube, showing the
 * three faces the main view hides (like cubing.js `backView`). Pure layout
 * maths, shared by the renderer and its tests.
 *
 *   "none"         — main view only
 *   "side-by-side" — main view left, back view right, each half the canvas
 *   "top-right"    — main view full size, back view as an inset in the corner
 */

export type BackView = "none" | "side-by-side" | "top-right";

/** Pixel rectangle, WebGL convention: origin bottom-left. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Inset size relative to the canvas' shorter side. */
export const INSET = 0.36;

export function viewports(mode: BackView, w: number, h: number): { main: Rect; back: Rect | null } {
  if (mode === "side-by-side") {
    const half = Math.floor(w / 2);
    return { main: { x: 0, y: 0, w: half, h }, back: { x: half, y: 0, w: w - half, h } };
  }
  if (mode === "top-right") {
    const s = Math.max(1, Math.round(Math.min(w, h) * INSET));
    return { main: { x: 0, y: 0, w, h }, back: { x: w - s, y: h - s, w: s, h: s } };
  }
  return { main: { x: 0, y: 0, w, h }, back: null };
}

/** The back camera sits opposite the main one (through the cube's centre): it sees exactly the hidden faces. */
export function backPosition(main: readonly [number, number, number]): [number, number, number] {
  return [-main[0], -main[1], -main[2]];
}
