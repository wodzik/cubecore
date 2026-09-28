/**
 * Gyroscope → renderer orientation. A smart cube reports its rotation as a
 * quaternion in its own axes; the renderer (`CubeRenderer.setOrientation`)
 * wants one in ours (x right, y up, z towards you) where identity = the cube
 * as drawn. `calibrate` (or the first reading) says "the cube is held as
 * shown right now".
 */

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export const IDENTITY: Quat = { x: 0, y: 0, z: 0, w: 1 };

export function multiply(a: Quat, b: Quat): Quat {
  return {
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  };
}

export const conjugate = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });

export function normalize(q: Quat): Quat {
  const l = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / l, y: q.y / l, z: q.z / l, w: q.w / l };
}

/** A cube's gyro axes → ours. GAN cubes: (x, z, −y). */
export type AxisMap = (q: Quat) => Quat;
export const GAN_AXES: AxisMap = (q) => ({ x: q.x, y: q.z, z: -q.y, w: q.w });

/**
 * Other brands report their axes differently (MoYu…): a signed permutation
 * of the vector part after GAN's map. "x,y,z" = GAN's; "-y,z,x" = the new x
 * is the reading's −y, and so on — 48 in all (rotations and mirrorings).
 * Find a cube's with `detectAxes`.
 */
export const DEFAULT_AXES_SPEC = "x,y,z";

export const AXES_SPECS: readonly string[] = (() => {
  const perms = [
    ["x", "y", "z"],
    ["x", "z", "y"],
    ["y", "x", "z"],
    ["y", "z", "x"],
    ["z", "x", "y"],
    ["z", "y", "x"],
  ];
  const out: string[] = [];
  for (const p of perms) for (let s = 0; s < 8; s++) out.push(p.map((a, i) => ((s >> i) & 1 ? `-${a}` : a)).join(","));
  return out;
})();

const AXIS_INDEX = { x: 0, y: 1, z: 2 } as const;

/** A signed permutation of a quaternion's vector part. */
export function permuteAxes(spec: string, q: Quat): Quat {
  if (spec === DEFAULT_AXES_SPEC) return q;
  const v = [q.x, q.y, q.z];
  const [x, y, z] = spec.split(",").map((t) => {
    const value = v[AXIS_INDEX[t.replace("-", "") as "x" | "y" | "z"]];
    return t.startsWith("-") ? -value : value;
  });
  return { x, y, z, w: q.w };
}

/** GAN's map, then `spec`. */
export const axesFromSpec = (spec: string): AxisMap => (spec === DEFAULT_AXES_SPEC ? GAN_AXES : (q) => permuteAxes(spec, GAN_AXES(q)));

/** An odd signed permutation (a mirror): on a tie with a rotation, the rotation is the likelier. */
function isMirror(spec: string): boolean {
  const t = spec.split(",");
  const order = t.map((a) => AXIS_INDEX[a.replace("-", "") as "x" | "y" | "z"]);
  const inversions = (order[0] > order[1] ? 1 : 0) + (order[0] > order[2] ? 1 : 0) + (order[1] > order[2] ? 1 : 0);
  return (inversions + t.filter((a) => a.startsWith("-")).length) % 2 === 1;
}

const angleDeg = (a: Quat, b: Quat) => {
  const d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
};

/**
 * A cube's axes from raw readings (GyroCalibrator.raw): held as drawn, then
 * after turning the whole cube to `expectA`, then (back, and) to `expectB` —
 * the orientations those should read (e.g. grips.gripQuaternion of the grip
 * after an x, and after a y). Best first, with how far off (degrees) each is.
 */
export function detectAxes(start: Quat, afterA: Quat, afterB: Quat, expectA: Quat, expectB: Quat): { spec: string; errorDeg: number }[] {
  const rel = (spec: string, a: Quat, b: Quat) => {
    const map = axesFromSpec(spec);
    return normalize(multiply(conjugate(normalize(map(a))), normalize(map(b))));
  };
  return AXES_SPECS.map((spec) => ({ spec, errorDeg: Math.max(angleDeg(rel(spec, start, afterA), expectA), angleDeg(rel(spec, start, afterB), expectB)) })).sort(
    (a, b) => Math.round(a.errorDeg - b.errorDeg) || Number(isMirror(a.spec)) - Number(isMirror(b.spec))
  );
}

/**
 * Raw readings → the orientation to show. The first reading (or `calibrate`)
 * is "held as shown": identity by default, or the orientation of the view it
 * was shown in (`calibrate(shown)` — e.g. a view with yellow on top). The
 * calibration is kept as a raw reading, so new axes (`setAxes`) apply to it
 * too. `align` snaps out drift (the yaw of a gyro wanders): the reading now
 * is taken to be exactly `to`.
 */
export class GyroCalibrator {
  private basis: Quat | null = null;
  private raw: Quat | null = null;
  private shown: Quat = IDENTITY;
  private anchor: Quat = IDENTITY;

  constructor(private axes: AxisMap = GAN_AXES) {}

  /** A raw reading → the orientation to show. The first reading calibrates. */
  orientation(raw: Quat): Quat {
    this.raw = raw;
    this.basis ??= raw;
    return this.current!;
  }

  /** The orientation now (null before any reading). */
  get current(): Quat | null {
    if (!this.raw || !this.basis) return null;
    const rel = normalize(multiply(conjugate(normalize(this.axes(this.basis))), normalize(this.axes(this.raw))));
    // The turn since calibrating is in the cube's axes as it was held then
    // (`shown`): in ours it's shown·rel·shown⁻¹, applied to `shown`.
    return normalize(multiply(this.anchor, multiply(this.shown, rel)));
  }

  /** The latest raw reading, as the cube sent it. */
  get lastRaw(): Quat | null {
    return this.raw;
  }

  /** "Held as shown now" — as drawn (identity), or as `shown`. */
  calibrate(shown: Quat = IDENTITY): void {
    if (this.raw) this.basis = this.raw;
    this.shown = shown;
    this.anchor = IDENTITY;
  }

  /** The reading now is exactly `to` (drift out; the cube is held square). */
  align(to: Quat): void {
    const now = this.current;
    if (!now) return;
    this.anchor = normalize(multiply(multiply(to, conjugate(now)), this.anchor));
  }

  setAxes(axes: AxisMap): void {
    this.axes = axes;
  }

  reset(): void {
    this.basis = null;
    this.raw = null;
    this.shown = IDENTITY;
    this.anchor = IDENTITY;
  }
}
