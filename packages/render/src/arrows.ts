/**
 * Turn arrows in 3D: for each turning layer, a flat arrow on a circle around
 * the cube (an outer layer's just beyond its face — U's floats above the
 * cube, D's below; a middle layer's through the middle), flat side to the
 * viewer, placed where most of it is beside the cube (bestAngle).
 *
 *   single turn  one arrowhead
 *   double turn  two arrowheads, one behind the other (and a longer arc)
 *
 * Angles are about +axis, counter-clockwise from e1 (PLANE) — the same sense
 * as TurnArrow.quarters.
 */

import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { Axis, TurnArrow } from "@cubecore/core";

export interface ArrowStyle {
  /** Arrow colour. Default a clear blue. */
  color?: string;
  /** 0..1. Default 0.92. */
  opacity?: number;
  /** Size factor (ribbon width, heads). Default 1. */
  scale?: number;
}

/** Circle radius — clear of the corners (1.5·√2 ≈ 2.12). */
export const ARROW_RADIUS = 2.36;
const WIDTH = 0.2;
const HEAD_WIDTH = 0.56;
const HEAD_LENGTH = 0.46;
/** Second head of a double: this many head lengths behind the first. */
const HEAD_GAP = 0.95;
/** Arc length in radians: single, double. */
const SPAN = { single: (100 * Math.PI) / 180, double: (170 * Math.PI) / 180 };
/** Where the arrow is centred snaps to this step, so small gyro wobbles don't rebuild it. */
const SNAP = Math.PI / 12;

/** In-plane basis (e1, e2) with e1 × e2 = +axis. */
export const PLANE: Record<Axis, [Vector3, Vector3, Vector3]> = {
  0: [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
  1: [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
  2: [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
};

/** Angle (about the axis) facing a viewer at `eye` (cube coordinates), snapped. */
export function facingAngle(axis: Axis, eye: Vector3): number {
  const [e1, e2] = PLANE[axis];
  const u = eye.dot(e1), v = eye.dot(e2);
  if (Math.hypot(u, v) < 1e-3) return Math.PI / 4; // looking straight down the axis
  return Math.round(Math.atan2(v, u) / SNAP) * SNAP;
}

/** Where the segment eye → p meets the cube: "clear" (beside it), "front" (p covers it) or "hidden" (behind it). */
function sightOf(eye: Vector3, p: Vector3): "clear" | "front" | "hidden" {
  let t0 = -Infinity, t1 = Infinity;
  for (const k of ["x", "y", "z"] as const) {
    const d = p[k] - eye[k];
    if (Math.abs(d) < 1e-9) {
      if (Math.abs(eye[k]) > HALF) return "clear";
      continue;
    }
    const a = (-HALF - eye[k]) / d, b = (HALF - eye[k]) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  }
  if (t0 > t1 || t1 < 0) return "clear";
  return t0 < 1 ? "hidden" : "front";
}
const HALF = 1.5;
/** Outer layers' arrows float just beyond their face (U above the cube, D below); middle ones stay in the middle. */
const OUTER = 1.62;
/** How far arrows reach from the centre (for fitting the camera). */
export const ARROW_REACH = Math.hypot(2.36 + 0.3, 1.62);
export const ringHeight = (layer: number): number => (layer === 0 ? 0 : Math.sign(layer) * OUTER);

/**
 * Where to centre an arrow so it reads best from `eye`: most of it beside
 * the cube (not over it, not behind it) — like GAN's, the top layer's arrow
 * floats above the cube and the bottom one's below. Ties go to the side
 * that's up on screen (`up`, cube coordinates).
 */
export function bestAngle(arrow: TurnArrow, eye: Vector3, up: Vector3): number {
  const [e1, e2, n] = PLANE[arrow.axis];
  let best = facingAngle(arrow.axis, eye), bestScore = -Infinity;
  for (let k = 0; k < 24; k++) {
    const centre = k * SNAP;
    const { from, to } = arrowSpan(arrow.quarters, centre);
    let score = 0;
    for (const layer of arrow.layers) {
      for (let i = 0; i <= 8; i++) {
        const a = from + ((to - from) * i) / 8;
        const p = new Vector3().addScaledVector(e1, ARROW_RADIUS * Math.cos(a)).addScaledVector(e2, ARROW_RADIUS * Math.sin(a)).addScaledVector(n, ringHeight(layer));
        const sight = sightOf(eye, p);
        score += sight === "clear" ? 1 : sight === "front" ? 0.3 : -1.5; // a gap in the middle of an arrow reads worst
      }
    }
    const dir = new Vector3().addScaledVector(e1, Math.cos(centre)).addScaledVector(e2, Math.sin(centre));
    score += 0.3 * dir.dot(up) + 0.1 * dir.dot(eye.clone().normalize());
    if (score > bestScore + 1e-6) [best, bestScore] = [centre, score];
  }
  return best;
}

/** Tail → tip of one arrow, in radians about the axis. */
export function arrowSpan(quarters: TurnArrow["quarters"], centre: number): { from: number; to: number } {
  const half = (Math.abs(quarters) === 2 ? SPAN.double : SPAN.single) / 2;
  return quarters > 0 ? { from: centre - half, to: centre + half } : { from: centre + half, to: centre - half };
}

/** A strip along the circle: cross-sections [arc length, half width] from one end to the other. */
export type Strip = [number, number][];

/**
 * One arrow unrolled: the ribbon and each head as strips — x = arc length
 * along the circle (angle × radius), width along the axis. buildArrows wraps
 * them onto the cylinder (flat side to the cube and to you) in short
 * segments, so they bend with it.
 */
export function arrowStrips(quarters: TurnArrow["quarters"], centre: number, scale = 1): Strip[] {
  const r = ARROW_RADIUS;
  const { from, to } = arrowSpan(quarters, centre);
  const [a, b] = [from * r, to * r];
  const dir = Math.sign(b - a);
  const heads = Math.abs(quarters) === 2 ? 2 : 1;
  const w = (WIDTH * scale) / 2;
  const hw = (HEAD_WIDTH * scale) / 2;
  const hl = HEAD_LENGTH * scale;
  const strip = (s0: number, s1: number, w0: number, w1: number, n: number): Strip =>
    Array.from({ length: n + 1 }, (_, i) => [s0 + ((s1 - s0) * i) / n, w0 + ((w1 - w0) * i) / n]);

  // Ribbon: tail up to the base of the last head.
  const end = b - dir * hl * (1 + HEAD_GAP * (heads - 1));
  const strips = [strip(a, end, w, w, 64)];
  // Heads: full width at the base, a point at the tip; one behind the other for a double.
  for (let h = 0; h < heads; h++) {
    const tip = b - dir * hl * HEAD_GAP * h;
    strips.push(strip(tip - dir * hl, tip, hw, 0, 8));
  }
  return strips;
}

/**
 * The strips as a mesh on the circle (the layer's frame: axis = z, circle
 * at z = 0). With `eye` (same frame) the ribbon turns its flat side to the
 * viewer at every point — never seen edge-on; without it, it lies on the
 * cylinder (width along the axis).
 */
function wrap(strips: readonly Strip[], eye: Vector3 | null): BufferGeometry {
  const pos: number[] = [];
  const index: number[] = [];
  const p = new Vector3(), t = new Vector3(), w = new Vector3(), prev = new Vector3();
  for (const strip of strips) {
    prev.set(0, 0, 1);
    const first = pos.length / 3;
    for (const [s, half] of strip) {
      const angle = s / ARROW_RADIUS;
      p.set(ARROW_RADIUS * Math.cos(angle), ARROW_RADIUS * Math.sin(angle), 0);
      if (eye) {
        t.set(-Math.sin(angle), Math.cos(angle), 0);
        w.crossVectors(t, eye.clone().sub(p)).normalize();
        if (w.dot(prev) < 0) w.negate(); // no flip from one point to the next: the strip never twists
        prev.copy(w);
      } else w.set(0, 0, 1);
      pos.push(p.x + w.x * half, p.y + w.y * half, p.z + w.z * half, p.x - w.x * half, p.y - w.y * half, p.z - w.z * half);
    }
    for (let i = 0; i < strip.length - 1; i++) {
      const k = first + 2 * i;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/**
 * Meshes for `arrows`, centred on `centres` (radians, one per arrow), facing
 * a viewer at `eye` (cube coordinates; null: lying on the cylinder).
 * Dispose with disposeArrows.
 */
export function buildArrows(arrows: readonly TurnArrow[], centres: readonly number[], style: ArrowStyle = {}, eye: Vector3 | null = null): Group {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: new Color(style.color ?? "#2f8bff"),
    transparent: true,
    opacity: style.opacity ?? 0.92,
    side: DoubleSide,
    depthWrite: false,
  });
  arrows.forEach((arrow, i) => {
    const [e1, e2, n] = PLANE[arrow.axis];
    const strips = arrowStrips(arrow.quarters, centres[i], style.scale ?? 1);
    for (const layer of arrow.layers) {
      const h = ringHeight(layer);
      const local = eye ? new Vector3(eye.dot(e1), eye.dot(e2), eye.dot(n) - h) : null;
      const mesh = new Mesh(wrap(strips, local), material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(new Matrix4().makeBasis(e1, e2, n).setPosition(n.clone().multiplyScalar(ringHeight(layer))));
      mesh.renderOrder = 1; // after the cube, so the see-through ribbon blends over it
      group.add(mesh);
    }
  });
  return group;
}

export function disposeArrows(group: Group): void {
  const done = new Set<unknown>();
  group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    for (const r of [m.geometry, m.material]) {
      if (done.has(r)) continue;
      done.add(r);
      (r as { dispose(): void }).dispose();
    }
  });
  group.removeFromParent();
}
