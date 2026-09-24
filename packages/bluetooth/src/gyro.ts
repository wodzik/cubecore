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

export class GyroCalibrator {
  private basis: Quat | null = null;
  private last: Quat | null = null;

  constructor(private readonly axes: AxisMap = GAN_AXES) {}

  /** A raw reading → the orientation to show (identity at calibration). The first reading calibrates. */
  orientation(raw: Quat): Quat {
    const q = normalize(this.axes(raw));
    this.last = q;
    this.basis ??= conjugate(q);
    return normalize(multiply(this.basis, q));
  }

  /** "Held as shown now": the latest reading becomes identity. */
  calibrate(): void {
    if (this.last) this.basis = conjugate(this.last);
  }

  reset(): void {
    this.basis = null;
    this.last = null;
  }
}
