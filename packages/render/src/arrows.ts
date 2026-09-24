/**
 * Turn arrows in 3D: for each turning layer, a flat ribbon on a circle
 * around the cube, lying in that layer's plane, with a flat arrowhead — the
 * way the layer is about to move. The circle clears the cube's corners, so
 * the arrow floats around it; the part behind the cube is hidden by it.
 *
 *   single turn  one arrowhead
 *   double turn  two arrowheads, one behind the other (and a longer arc)
 *
 * Angles are about +axis, counter-clockwise from e1 (PLANE) — the same sense
 * as TurnArrow.quarters. Arrows are centred on the side facing the camera.
 */

import { Color, DoubleSide, Group, Matrix4, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3 } from "three";
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
const WIDTH = 0.16;
const HEAD_WIDTH = 0.5;
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

/** Tail → tip of one arrow, in radians about the axis. */
export function arrowSpan(quarters: TurnArrow["quarters"], centre: number): { from: number; to: number } {
  const half = (Math.abs(quarters) === 2 ? SPAN.double : SPAN.single) / 2;
  return quarters > 0 ? { from: centre - half, to: centre + half } : { from: centre + half, to: centre - half };
}

/** The flat outline (plane coordinates) of one arrow: ribbon + heads. */
export function arrowShapes(quarters: TurnArrow["quarters"], centre: number, scale = 1): Shape[] {
  const { from, to } = arrowSpan(quarters, centre);
  const dir = Math.sign(to - from);
  const heads = Math.abs(quarters) === 2 ? 2 : 1;
  const r = ARROW_RADIUS;
  const w = (WIDTH * scale) / 2;
  const hw = (HEAD_WIDTH * scale) / 2;
  const hl = (HEAD_LENGTH * scale) / r; // head length as an angle
  const at = (a: number, radius: number): [number, number] => [radius * Math.cos(a), radius * Math.sin(a)];
  const shapes: Shape[] = [];

  // Ribbon: tail up to the base of the last head.
  const end = to - dir * hl * (1 + HEAD_GAP * (heads - 1));
  const steps = 48;
  const ribbon = new Shape();
  for (let i = 0; i <= steps; i++) {
    const a = from + ((end - from) * i) / steps;
    const [x, y] = at(a, r + w);
    if (i === 0) ribbon.moveTo(x, y);
    else ribbon.lineTo(x, y);
  }
  for (let i = steps; i >= 0; i--) ribbon.lineTo(...at(from + ((end - from) * i) / steps, r - w));
  ribbon.closePath();
  shapes.push(ribbon);

  // Heads: flat triangles, the tip on the circle, slightly curved sides.
  for (let h = 0; h < heads; h++) {
    const tip = to - dir * hl * HEAD_GAP * h;
    const base = tip - dir * hl;
    const head = new Shape();
    head.moveTo(...at(base, r + hw));
    head.lineTo(...at(tip, r));
    head.lineTo(...at(base, r - hw));
    head.closePath();
    shapes.push(head);
  }
  return shapes;
}

/** Meshes for `arrows`, centred on `centres` (radians, one per arrow). Dispose with disposeArrows. */
export function buildArrows(arrows: readonly TurnArrow[], centres: readonly number[], style: ArrowStyle = {}): Group {
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
    const geometry = new ShapeGeometry(arrowShapes(arrow.quarters, centres[i], style.scale ?? 1), 1);
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
