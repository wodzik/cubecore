/**
 * Turn arrows in 3D: a ribbon with an arrowhead hovering just above the
 * layer that is about to turn — centred on its row, flat side to the cube,
 * rounding the cube's edges — the way the layer moves.
 *
 *   single turn         over the face you see best, one head
 *   double / triple     over the two faces you see best, two / three heads
 *
 * The direction is the one written (R2' the other way than R2).
 *
 * The path around a layer is the cube's square cross-section pushed out by
 * HOVER (straight over the faces, round over the edges), measured in
 * quarters t: t = k at the middle of side k (side 0 faces +e1, side 1 +e2…),
 * t = k + 0.5 at the edge between sides k and k+1; increasing t is
 * counter-clockwise about +axis — the same sense as TurnArrow.quarters.
 */

import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Group, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from "three";
import type { Axis, TurnArrow } from "@cubecore/core";

export interface ArrowStyle {
  /** Arrow colour. Default a clear blue. */
  color?: string;
  /** 0..1. Default 0.95. */
  opacity?: number;
  /** Size factor (ribbon width, heads). Default 1. */
  scale?: number;
}

const HALF = 1.5; // half the cube
/** Height of the ribbon above the faces. */
const HOVER = 0.3;
const CORNER = (Math.PI / 2) * HOVER;
const QUARTER = 2 * HALF + CORNER; // path length of one quarter
const WIDTH = 0.34;
const HEAD_WIDTH = 0.7;
const HEAD_LENGTH = 0.5;
/** Each further head this many head lengths behind the one before. */
const HEAD_GAP = 0.9;
/** How far over a face an arrow reaches from its middle (quarters; 0.5 would be the edge). */
const OVER_FACE = 0.4;

/** How far arrows reach from the centre (for fitting the camera). */
export const ARROW_REACH = Math.hypot(HALF * Math.SQRT2 + HOVER, 1 + HEAD_WIDTH / 2);

/** In-plane basis (e1, e2) with e1 × e2 = +axis. */
export const PLANE: Record<Axis, [Vector3, Vector3, Vector3]> = {
  0: [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
  1: [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
  2: [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
};

/** Point of the path at `t` quarters, in plane coordinates (u along e1, v along e2). */
export function pathPoint(t: number): [number, number] {
  const k = Math.floor(t);
  const s = (t - k) * QUARTER;
  let u: number, v: number;
  if (s < HALF) [u, v] = [HALF + HOVER, s];
  else if (s < HALF + CORNER) {
    const a = (s - HALF) / HOVER;
    [u, v] = [HALF + HOVER * Math.cos(a), HALF + HOVER * Math.sin(a)];
  } else [u, v] = [HALF - (s - HALF - CORNER), HALF + HOVER];
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [u, v] = [-v, u]; // k quarter turns counter-clockwise
  return [u, v];
}

/** Outward normal of side k of the layer (cube coordinates). */
function sideNormal(axis: Axis, k: number): Vector3 {
  const [e1, e2] = PLANE[axis];
  const q = ((k % 4) + 4) % 4;
  return [e1, e2, e1.clone().negate(), e2.clone().negate()][q].clone();
}

/**
 * Where an arrow goes for a viewer at `eye` (cube coordinates): the middle
 * of the best-seen side for a single turn, the edge between the two
 * best-seen neighbouring sides for a double or triple.
 */
export function arrowCentre(arrow: TurnArrow, eye: Vector3): number {
  const seen = [0, 1, 2, 3].map((k) => sideNormal(arrow.axis, k).dot(eye));
  const best = seen.indexOf(Math.max(...seen));
  if (Math.abs(arrow.quarters) === 1) return best;
  const next = seen[(best + 1) % 4] >= seen[(best + 3) % 4] ? best + 1 : best - 1;
  return (best + next) / 2;
}

/** Tail → tip in quarters along the path. */
export function arrowSpan(quarters: number, centre: number): { from: number; to: number } {
  const half = Math.abs(quarters) === 1 ? OVER_FACE : 0.5 + OVER_FACE;
  return quarters > 0 ? { from: centre - half, to: centre + half } : { from: centre + half, to: centre - half };
}

/** A strip along the path: cross-sections [t, half width] from one end to the other. */
export type Strip = [number, number][];

/** One arrow as strips: the ribbon, then one per head (as many heads as quarter turns, up to 3). */
export function arrowStrips(quarters: number, centre: number, scale = 1): Strip[] {
  const { from, to } = arrowSpan(quarters, centre);
  const dir = Math.sign(to - from);
  const heads = Math.min(3, Math.max(1, Math.abs(quarters)));
  const hl = (HEAD_LENGTH * scale) / QUARTER;
  const strip = (t0: number, t1: number, w0: number, w1: number, n: number): Strip =>
    Array.from({ length: n + 1 }, (_, i) => [t0 + ((t1 - t0) * i) / n, w0 + ((w1 - w0) * i) / n]);
  const end = to - dir * hl * (1 + HEAD_GAP * (heads - 1));
  const strips = [strip(from, end, (WIDTH * scale) / 2, (WIDTH * scale) / 2, 64)];
  for (let h = 0; h < heads; h++) {
    const tip = to - dir * hl * HEAD_GAP * h;
    strips.push(strip(tip - dir * hl, tip, (HEAD_WIDTH * scale) / 2, 0, 6));
  }
  return strips;
}

/** Strips as a mesh around the layer (layer frame: axis = z, the row's middle at z = 0); width along the axis. */
function wrap(strips: readonly Strip[]): BufferGeometry {
  const pos: number[] = [];
  const index: number[] = [];
  for (const strip of strips) {
    const first = pos.length / 3;
    for (const [t, half] of strip) {
      const [u, v] = pathPoint(t);
      pos.push(u, v, half, u, v, -half);
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

/** Meshes for `arrows`, placed at `centres` (quarters along the path, one per arrow). Dispose with disposeArrows. */
export function buildArrows(arrows: readonly TurnArrow[], centres: readonly number[], style: ArrowStyle = {}): Group {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: new Color(style.color ?? "#2f8bff"),
    transparent: true,
    opacity: style.opacity ?? 0.95,
    side: DoubleSide,
    depthWrite: false,
  });
  arrows.forEach((arrow, i) => {
    const [e1, e2, n] = PLANE[arrow.axis];
    const geometry = wrap(arrowStrips(arrow.quarters, centres[i], style.scale ?? 1));
    for (const layer of arrow.layers) {
      const mesh = new Mesh(geometry, material);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.copy(new Matrix4().makeBasis(e1, e2, n).setPosition(n.clone().multiplyScalar(layer)));
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
