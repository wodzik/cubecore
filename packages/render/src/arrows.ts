/**
 * Turn arrows in 3D: for each turning layer, a tube with an arrowhead that
 * runs around the layer just above the stickers, on the side facing the
 * camera — the way the layer is about to move.
 *
 *   single turn  a quarter of the way round (corner to corner of one face… or
 *                across the corner facing you), one arrowhead
 *   double turn  half of the way round (both visible sides), two arrowheads
 *                one behind the other
 *
 * The loop around a layer is the square cross-section of the cube pushed out
 * by `CLEARANCE` (straight along the faces, round over the edges), measured
 * in quarters: t = 0 at the middle of the +e1 side, increasing
 * counter-clockwise about +axis — the same sense as TurnArrow.quarters.
 */

import {
  BackSide,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  TubeGeometry,
  Vector3,
} from "three";
import type { Axis, TurnArrow } from "@cubecore/core";

export interface ArrowStyle {
  /** Arrow colour. Default a hot pink no cube has. */
  color?: string;
  /** Thin dark edge so the arrow reads over any sticker; null for none. */
  outline?: string | null;
  /** Thickness factor. Default 1. */
  scale?: number;
}

const HALF = 1.5; // half the cube
const CLEARANCE = 0.22; // arrow above the faces
const CORNER = (Math.PI / 2) * CLEARANCE;
const QUARTER = 2 * HALF + CORNER; // length of a quarter of the loop

/** In-plane basis (e1, e2) with e1 × e2 = +axis. */
export const PLANE: Record<Axis, [Vector3, Vector3, Vector3]> = {
  0: [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
  1: [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
  2: [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
};

/** Point of the loop at `t` quarters, in plane coordinates (u along e1, v along e2). */
export function loopPoint(t: number): [number, number] {
  const k = Math.floor(t);
  const s = (t - k) * QUARTER;
  let u: number, v: number;
  if (s < HALF) [u, v] = [HALF + CLEARANCE, s];
  else if (s < HALF + CORNER) {
    const a = (s - HALF) / CLEARANCE;
    [u, v] = [HALF + CLEARANCE * Math.cos(a), HALF + CLEARANCE * Math.sin(a)];
  } else [u, v] = [HALF - (s - HALF - CORNER), HALF + CLEARANCE];
  // Rotate by k quarter turns (counter-clockwise).
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [u, v] = [-v, u];
  return [u, v];
}

/** Where on the loop to centre arrows so they face a viewer at `eye` (cube coordinates): a side middle or a corner. */
export function facingT(axis: Axis, eye: Vector3): number {
  const [e1, e2] = PLANE[axis];
  const u = eye.dot(e1), v = eye.dot(e2);
  if (Math.hypot(u, v) < 1e-3) return 0.5; // looking straight down the axis
  return Math.round((Math.atan2(v, u) / (Math.PI / 2)) * 2) / 2;
}

/** Tail → head of one arrow, in quarters along the loop. */
export function arrowSpan(quarters: TurnArrow["quarters"], centre: number): { from: number; to: number } {
  const half = Math.abs(quarters) === 2 ? 1 : 0.5;
  return quarters > 0 ? { from: centre - half, to: centre + half } : { from: centre + half, to: centre - half };
}

const HEAD_LENGTH = 0.46;
const HEAD_RADIUS = 0.2;
const SHAFT_RADIUS = 0.065;
/** Second head of a double: this many head lengths behind the first. */
const HEAD_GAP = 1.05;

/** Meshes for `arrows`, centred on `centres` (one per arrow). Dispose with disposeArrows. */
export function buildArrows(arrows: readonly TurnArrow[], centres: readonly number[], style: ArrowStyle = {}): Group {
  const group = new Group();
  const scale = style.scale ?? 1;
  const color = new Color(style.color ?? "#ff2d95");
  const body = new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.45, roughness: 0.45, metalness: 0 });
  const edge = style.outline === null ? null : new MeshBasicMaterial({ color: new Color(style.outline ?? "#0b0b0c"), side: BackSide });
  arrows.forEach((arrow, i) => {
    const [e1, e2, n] = PLANE[arrow.axis];
    const { from, to } = arrowSpan(arrow.quarters, centres[i]);
    const heads = Math.abs(arrow.quarters) === 2 ? 2 : 1;
    const dir = Math.sign(to - from);
    const headT = (HEAD_LENGTH * scale) / QUARTER; // one head's length in quarters
    for (const layer of arrow.layers) {
      const at = (t: number) => {
        const [u, v] = loopPoint(t);
        return new Vector3().addScaledVector(e1, u).addScaledVector(e2, v).addScaledVector(n, layer);
      };
      // Shaft: tail up to the base of the last head.
      const shaftEnd = to - dir * headT * (1 + HEAD_GAP * (heads - 1));
      const samples = 40;
      const pts = Array.from({ length: samples + 1 }, (_, j) => at(from + ((shaftEnd - from) * j) / samples));
      const curve = new CatmullRomCurve3(pts);
      const tube = new TubeGeometry(curve, 64, SHAFT_RADIUS * scale, 10, false);
      group.add(new Mesh(tube, body));
      if (edge) group.add(new Mesh(new TubeGeometry(curve, 64, (SHAFT_RADIUS + 0.022) * scale, 10, false), edge));
      // Heads: the tip at `to`; a second one just behind it for a double turn.
      for (let h = 0; h < heads; h++) {
        const tip = to - dir * headT * HEAD_GAP * h;
        const base = tip - dir * headT;
        const a = at(base), b = at(tip);
        const axisDir = b.clone().sub(a).normalize();
        const q = new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), axisDir);
        const cone = new ConeGeometry(HEAD_RADIUS * scale, a.distanceTo(b), 20);
        const mid = a.clone().add(b).multiplyScalar(0.5);
        const m = new Mesh(cone, body);
        m.position.copy(mid);
        m.quaternion.copy(q);
        group.add(m);
        if (edge) {
          const o = new Mesh(cone, edge);
          o.position.copy(mid);
          o.quaternion.copy(q);
          o.scale.setScalar(1.12);
          group.add(o);
        }
      }
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
