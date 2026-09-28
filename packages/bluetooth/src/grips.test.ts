import { describe, expect, it } from "bun:test";
import { ALL_GRIPS, GripTracker, IDENTITY_GRIP, gripOf, gripQuaternion, readGrip, rotateGrip, rotationBetween } from "./grips";

const axisAngle = (ax: [number, number, number], deg: number) => {
  const h = (deg * Math.PI) / 360;
  return { x: ax[0] * Math.sin(h), y: ax[1] * Math.sin(h), z: ax[2] * Math.sin(h), w: Math.cos(h) };
};

describe("grips", () => {
  it("reads every grip back from its own quaternion", () => {
    for (const g of ALL_GRIPS) expect(readGrip(gripQuaternion(g)).grip.id).toBe(g.id);
    expect(readGrip(gripQuaternion(IDENTITY_GRIP)).offDeg).toBeLessThan(0.01);
  });

  it("rotations move the faces the right way", () => {
    expect(rotateGrip(IDENTITY_GRIP, "x").face.U).toBe("F");
    expect(rotateGrip(IDENTITY_GRIP, "y").face.F).toBe("R");
    expect(rotateGrip(IDENTITY_GRIP, "y'").face.F).toBe("L");
    expect(rotateGrip(IDENTITY_GRIP, "z").face.U).toBe("L");
    expect(rotateGrip(IDENTITY_GRIP, "x2").face.U).toBe("D");
  });

  it("an x / y / z turn of the orientation is the x / y / z rotation", () => {
    expect(readGrip(axisAngle([1, 0, 0], -90)).grip.id).toBe(rotateGrip(IDENTITY_GRIP, "x").id);
    expect(readGrip(axisAngle([0, 1, 0], -90)).grip.id).toBe(rotateGrip(IDENTITY_GRIP, "y").id);
    expect(readGrip(axisAngle([0, 0, 1], -90)).grip.id).toBe(rotateGrip(IDENTITY_GRIP, "z").id);
  });

  it("a rotation of at most two between any two grips", () => {
    for (const a of ALL_GRIPS)
      for (const b of ALL_GRIPS) {
        const r = rotationBetween(a, b);
        expect(rotateGrip(a, r).id).toBe(b.id);
        expect(r.split(" ").filter(Boolean).length).toBeLessThanOrEqual(2);
      }
    expect(rotationBetween(IDENTITY_GRIP, gripOf("U", "L"))).toBe("y'");
  });

  it("changes need a dwell, timed (and marked) from the first reach", () => {
    const t = new GripTracker(35, 150);
    expect(t.update(axisAngle([0, 1, 0], 5), 0)).toBeNull();
    expect(t.grip?.id).toBe(IDENTITY_GRIP.id);
    t.update(axisAngle([0, 1, 0], -90), 100, 1);
    t.update(axisAngle([0, 1, 0], -135), 150, 1);
    t.update(axisAngle([0, 1, 0], -180), 200, 2);
    expect(t.update(axisAngle([0, 1, 0], -180), 300, 3)).toBeNull();
    const c = t.update(axisAngle([0, 1, 0], -178), 360, 4);
    expect(c?.rotation).toBe("y2");
    expect(c?.at).toBe(200);
    expect(c?.mark).toBe(2);
  });
});
