/**
 * Turn arrows in 3D: a ribbon with an arrowhead hovering just above the
 * layer that is about to turn — centred on its row, flat side to the cube,
 * rounding the cube's edges — the way the layer moves.
 *
 * One length for every arrow; two per layer on opposite sides, travelling
 * round the layer the way they point (so one is always in view, and the
 * motion shows the direction); as many heads as quarter turns (1–3).
 * Shapes: "box" follows the faces at an even height, "circle" is an arc of
 * a circle over them (clear of the corners).
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
  /** "box": even height over the faces, round over the edges (default); "circle": an arc over them. */
  shape?: ArrowShape;
  /**
   * How fast the arrows travel round the layer the way they point, in
   * quarter turns per second (default 0.35); 0 keeps them still.
   */
  speed?: number;
}

/** Default travel speed of the arrows (quarter turns per second). */
export const ARROW_SPEED = 0.35;

export type ArrowShape = "box" | "circle";

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
/** Length of every arrow, in quarters of the way round. */
const SPAN = 1.3;
/** Arrows sit this far (quarters) from the best-seen face's middle towards the next face seen best. */
const LEAN = 0.25;
/** The circle clears the corners (1.5·√2 ≈ 2.12) by a little. */
const CIRCLE = HALF * Math.SQRT2 + 0.2;
const CIRCLE_QUARTER = (Math.PI / 2) * CIRCLE;

/** How far arrows reach from the centre (for fitting the camera). */
export const ARROW_REACH = Math.hypot(HALF * Math.SQRT2 + 0.3, 1 + HEAD_WIDTH / 2);

/** In-plane basis (e1, e2) with e1 × e2 = +axis. */
export const PLANE: Record<Axis, [Vector3, Vector3, Vector3]> = {
  0: [new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)],
  1: [new Vector3(0, 0, 1), new Vector3(1, 0, 0), new Vector3(0, 1, 0)],
  2: [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)],
};

/** Point of the path at `t` quarters, in plane coordinates (u along e1, v along e2). */
export function pathPoint(t: number, shape: ArrowShape = "box"): [number, number] {
  if (shape === "circle") return [CIRCLE * Math.cos((t * Math.PI) / 2), CIRCLE * Math.sin((t * Math.PI) / 2)];
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
 * Where an arrow goes for a viewer at `eye` (cube coordinates): over the
 * best-seen side, leaning towards its better-seen neighbour.
 */
export function arrowCentre(arrow: TurnArrow, eye: Vector3): number {
  const seen = [0, 1, 2, 3].map((k) => sideNormal(arrow.axis, k).dot(eye));
  const best = seen.indexOf(Math.max(...seen));
  return best + (seen[(best + 1) % 4] >= seen[(best + 3) % 4] ? LEAN : -LEAN);
}

/** Tail → tip in quarters along the path (the same length for every turn). */
export function arrowSpan(quarters: number, centre: number): { from: number; to: number } {
  const half = SPAN / 2;
  return quarters > 0 ? { from: centre - half, to: centre + half } : { from: centre + half, to: centre - half };
}

/** A strip along the path: cross-sections [t, half width] from one end to the other. */
export type Strip = [number, number][];

/** One arrow as strips: the ribbon, then one per head (as many heads as quarter turns, up to 3). */
export function arrowStrips(quarters: number, centre: number, scale = 1, shape: ArrowShape = "box"): Strip[] {
  const { from, to } = arrowSpan(quarters, centre);
  const dir = Math.sign(to - from);
  const heads = Math.min(3, Math.max(1, Math.abs(quarters)));
  const hl = (HEAD_LENGTH * scale) / (shape === "circle" ? CIRCLE_QUARTER : QUARTER);
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

/** Vertex positions of strips around the layer (layer frame: axis = z, the row's middle at z = 0); width along the axis. */
function positionsOf(strips: readonly Strip[], shape: ArrowShape): number[] {
  const pos: number[] = [];
  for (const strip of strips) {
    for (const [t, half] of strip) {
      const [u, v] = pathPoint(t, shape);
      pos.push(u, v, half, u, v, -half);
    }
  }
  return pos;
}

function wrap(strips: readonly Strip[], shape: ArrowShape): BufferGeometry {
  const index: number[] = [];
  let first = 0;
  for (const strip of strips) {
    for (let i = 0; i < strip.length - 1; i++) {
      const k = first + 2 * i;
      index.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
    first += 2 * strip.length;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(positionsOf(strips, shape), 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

interface ArrowMeshData {
  quarters: number;
  centre: number;
  scale: number;
  shape: ArrowShape;
}

/**
 * Meshes for `arrows`: for each turning layer two arrows on opposite sides,
 * the first at `centres[i]` (quarters along the path). Move them with
 * `moveArrows`; dispose with `disposeArrows`.
 */
export function buildArrows(arrows: readonly TurnArrow[], centres: readonly number[], style: ArrowStyle = {}): Group {
  const group = new Group();
  const material = new MeshBasicMaterial({
    color: new Color(style.color ?? "#2f8bff"),
    transparent: true,
    opacity: style.opacity ?? 0.95,
    side: DoubleSide,
    depthWrite: false,
  });
  const shape = style.shape ?? "box";
  const scale = style.scale ?? 1;
  arrows.forEach((arrow, i) => {
    const [e1, e2, n] = PLANE[arrow.axis];
    for (const centre of [centres[i], centres[i] + 2]) {
      for (const layer of arrow.layers) {
        // Own geometry per mesh: each is moved along the path separately.
        const mesh = new Mesh(wrap(arrowStrips(arrow.quarters, centre, scale, shape), shape), material);
        mesh.matrixAutoUpdate = false;
        mesh.matrix.copy(new Matrix4().makeBasis(e1, e2, n).setPosition(n.clone().multiplyScalar(layer)));
        mesh.renderOrder = 1; // after the cube, so the see-through ribbon blends over it
        mesh.userData.arrow = { quarters: arrow.quarters, centre, scale, shape } satisfies ArrowMeshData;
        mesh.frustumCulled = false; // it moves; its bounding sphere would go stale
        group.add(mesh);
      }
    }
  });
  return group;
}

/** Slide every arrow `travel` quarters along its layer, the way it points (a travelling arrow shows the direction). */
export function moveArrows(group: Group, travel: number): void {
  for (const o of group.children) {
    const m = o as Mesh;
    const d = m.userData.arrow as ArrowMeshData | undefined;
    if (!d) continue;
    const strips = arrowStrips(d.quarters, d.centre + Math.sign(d.quarters) * (travel % 4), d.scale, d.shape);
    const attr = m.geometry.getAttribute("position") as Float32BufferAttribute;
    (attr.array as Float32Array).set(positionsOf(strips, d.shape));
    attr.needsUpdate = true;
  }
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
