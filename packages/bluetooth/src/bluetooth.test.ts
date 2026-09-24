import { describe, expect, it } from "bun:test";
import { applyMoves, formatAlg, isSolved, solvedState, statesEqual } from "@cubecore/core";
import { ClockSync, GyroCalibrator, type CubeMoveEvent, SimulatedCube, SmartCubeSession } from "./index";

function session() {
  const cube = new SimulatedCube();
  const s = new SmartCubeSession(cube);
  const moves: CubeMoveEvent[] = [];
  s.on("move", (e) => moves.push(e));
  return { cube, s, moves };
}

describe("smart cube session", () => {
  it("face turns as Moves with the state after each; a half turn arrives as two quarters", () => {
    const { cube, s, moves } = session();
    cube.turn("R U R2");
    expect(formatAlg(moves.map((m) => m.move))).toBe("R U R R");
    expect(statesEqual(s.state, applyMoves(solvedState(), "R U R2"))).toBe(true);
    expect(statesEqual(moves[1].state, applyMoves(solvedState(), "R U"))).toBe(true);
  });

  it("times come from the cube's clock: a burst after a backgrounded tab keeps the real times and is flagged late", () => {
    const { cube, moves } = session();
    cube.turn("R"); // calibrates the clock (20 ms latency)
    const before = performance.now();
    cube.turn("U", { delayMs: 5000 });
    expect(moves[1].time).toBeLessThan(before + 100); // not 5 s later
    expect(moves[1].late).toBe(true);
    expect(moves[0].late).toBe(false);
  });

  it("a resent move without a local time still gets its real time", () => {
    const { cube, moves } = session();
    cube.turn("R");
    cube.turn("F", { dropLocalTime: true });
    expect(Math.abs(moves[1].time - performance.now())).toBeLessThan(100);
  });

  it("a facelets report that disagrees resyncs the state (a missed move)", () => {
    const { cube, s } = session();
    const reasons: string[] = [];
    s.on("state", (e) => reasons.push(e.reason));
    cube.setStateSilently(applyMoves(solvedState(), "L"));
    s.requestState();
    expect(reasons.at(-1)).toBe("facelets");
    expect(statesEqual(s.state, applyMoves(solvedState(), "L"))).toBe(true);
    s.markSolved();
    expect(isSolved(s.state)).toBe(true);
  });

  it("battery, hardware and disconnect", async () => {
    const { s } = session();
    expect(s.battery).toBe(87);
    expect(s.hardware.name).toBe("Simulated");
    let gone = false;
    s.on("disconnect", () => (gone = true));
    await s.disconnect();
    expect(gone && !s.isConnected).toBe(true);
  });
});

describe("clock sync and gyro", () => {
  it("the offset is the least-delayed sample", () => {
    const c = new ClockSync();
    c.observe(1000, 5030);
    c.observe(2000, 6010);
    c.observe(3000, null);
    expect(c.offset).toBe(4010);
    expect(c.toLocal(3000)).toBe(7010);
  });

  it("the first reading (or calibrate) is identity; later readings are relative to it", () => {
    const g = new GyroCalibrator((q) => q);
    const tilted = { x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }; // 90° about y
    const o = g.orientation(tilted);
    expect(o.w).toBeCloseTo(1);
    const more = g.orientation({ x: 0, y: 1, z: 0, w: 0 }); // 180° about y
    expect(Math.abs(more.y)).toBeCloseTo(Math.SQRT1_2); // 90° further
    g.calibrate();
    expect(g.orientation({ x: 0, y: 1, z: 0, w: 0 }).w).toBeCloseTo(1);
  });
});

describe("skins for cubes", async () => {
  const { registerCubeSkin, skinForCube } = await import("./index");
  const { SKINS } = await import("@cubecore/skin");
  it("GAN i4 → ganI4, other GAN → gan, the rest → stickerless; app rules come first", () => {
    expect(skinForCube({ protocol: { id: "gan-gen4" }, name: "GAN i4 AB12" })).toBe(SKINS.ganI4);
    expect(skinForCube({ protocol: { id: "gan-gen3" }, name: "GAN356 i Carry" })).toBe(SKINS.gan);
    expect(skinForCube({ protocol: { id: "moyu32" }, name: "WCU_MY32_1234" })).toBe(SKINS.stickerless);
    registerCubeSkin({ protocol: "moyu", skin: "standard" });
    expect(skinForCube({ protocol: { id: "moyu32" } })).toBe(SKINS.standard);
    expect(session().s.suggestedSkin).toBe(SKINS.stickerless); // simulated
  });
});
