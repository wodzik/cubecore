import { describe, expect, it } from "bun:test";
import { applyMoves, formatAlg, isSolved, solvedState, statesEqual } from "@cubecore/core";
import { GanGen2ProtocolDriver } from "./vendor/smartcube-web-bluetooth/gan-cube-protocol";
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

  it("mark solved on a cube that can't reset and reports its state with every move (QiYi)", () => {
    const cube = new SimulatedCube({ canReset: false, faceletsOnMove: true });
    const s = new SmartCubeSession(cube);
    cube.turn("R U F' D2"); // scrambled
    s.markSolved(); // the cube itself still thinks it's scrambled
    const reasons: string[] = [];
    s.on("state", (e) => reasons.push(e.reason));
    cube.turn("R");
    expect(statesEqual(s.state, applyMoves(solvedState(), "R"))).toBe(true); // not back to the cube's own state
    expect(reasons).not.toContain("facelets");
    // A missed move is still caught, relative to the mark.
    cube.setStateSilently(applyMoves(applyMoves(solvedState(), "R U F' D2"), "R L"));
    s.requestState();
    expect(reasons.at(-1)).toBe("facelets");
    expect(statesEqual(s.state, applyMoves(solvedState(), "R L"))).toBe(true);
  });

  it("the mark carries over to the next connection (base event → base option)", () => {
    const cube = new SimulatedCube({ canReset: false, faceletsOnMove: true });
    const first = new SmartCubeSession(cube);
    let kept: Uint8Array | null = null;
    first.on("base", (b) => (kept = b));
    cube.turn("R U F' D2");
    first.markSolved();
    expect(kept).not.toBeNull();
    cube.turn("R"); // made while connected…
    // …a new connection: the cube reports its own (never reset) state; with the kept base it reads right.
    const again = new SmartCubeSession(cube, { base: () => kept });
    expect(statesEqual(again.state, applyMoves(solvedState(), "R"))).toBe(true);
    const without = new SmartCubeSession(cube);
    expect(statesEqual(without.state, applyMoves(solvedState(), "R"))).toBe(false);
    // setBase later (the app found the cube's record after connecting) reads the state again.
    without.setBase(kept);
    expect(statesEqual(without.state, applyMoves(solvedState(), "R"))).toBe(true);
  });

  it("a cube that resets keeps no base", () => {
    const cube = new SimulatedCube({ canReset: true });
    const s = new SmartCubeSession(cube);
    const bases: unknown[] = [];
    s.on("base", (b) => bases.push(b));
    cube.turn("R U");
    s.markSolved();
    expect(bases).toEqual([null]);
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

  it("a cube clock that jumps back (a 16-bit interval rolled over) is followed; a late burst isn't", () => {
    const c = new ClockSync();
    for (let k = 0; k < 10; k++) c.observe(1000 * k, 5000 + 1000 * k + 20);
    expect(c.offset).toBe(5020);
    // The cube lost 65.5 s: from now on its clock reads 65 536 ms less for the same moment.
    for (let k = 10; k < 14; k++) c.observe(1000 * k - 65536, 5000 + 1000 * k + 20 + (k % 2) * 30);
    expect(c.offset).toBe(5020); // four samples: not sure yet
    c.observe(14000 - 65536, 19020);
    expect(c.offset).toBe(5020 + 65536);
    // A burst: moves 200 ms apart arriving together 3 s late — the offset stays.
    const b = new ClockSync();
    for (let k = 0; k < 10; k++) b.observe(1000 * k, 5000 + 1000 * k + 20);
    for (let k = 0; k < 6; k++) b.observe(10000 + 200 * k, 5000 + 10000 + 1200 + 3000);
    expect(b.offset).toBe(5020);
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
  it("GAN → gan, QiYi SC → qiyiSC, MoYu → moyu, the rest → default; app rules come first", () => {
    expect(skinForCube({ protocol: { id: "gan-gen4" }, name: "GAN i4 AB12" })).toBe(SKINS.gan);
    expect(skinForCube({ protocol: { id: "gan-gen3" }, name: "GAN356 i Carry" })).toBe(SKINS.gan);
    expect(skinForCube({ protocol: { id: "qiyi" }, name: "QY-QYSC-S-A812" })).toBe(SKINS.qiyiSC);
    expect(skinForCube({ protocol: { id: "qiyi" }, name: "XMD-TornadoV4-i-034C" })).toBe(SKINS.default);
    expect(skinForCube({ protocol: { id: "moyu32" }, name: "WCU_MY32_1234" })).toBe(SKINS.moyu);
    registerCubeSkin({ protocol: "moyu", skin: "qiyiSC" });
    expect(skinForCube({ protocol: { id: "moyu32" } })).toBe(SKINS.qiyiSC);
    expect(session().s.suggestedSkin).toBe(SKINS.default); // simulated
  });
});

describe("GAN gen2 move intervals", () => {
  /** A gen2 MOVE message: serial, then one move (face, direction) and its 16-bit interval (ms since the move before). */
  const moveMessage = (serial: number, face: number, elapsed: number) => {
    const bits = Array(160).fill("0");
    const put = (start: number, len: number, v: number) => v.toString(2).padStart(len, "0").split("").forEach((b, k) => (bits[start + k] = b));
    put(0, 4, 0x02);
    put(4, 8, serial);
    put(12, 4, face);
    put(47, 16, elapsed);
    return Uint8Array.from({ length: 20 }, (_, i) => parseInt(bits.slice(8 * i, 8 * i + 8).join(""), 2));
  };

  it("after more than ~65 s idle the interval rolls over: the local time since the last move is taken", async () => {
    const driver = new GanGen2ProtocolDriver() as unknown as { lastSerial: number; lastMoveTimestamp: number; handleStateEvent: (c: unknown, m: Uint8Array) => Promise<{ cubeTimestamp: number }[]> };
    driver.lastSerial = 0;
    const [a] = await driver.handleStateEvent(null, moveMessage(1, 0, 300));
    // The cube lay 90 s: its 16-bit interval says 90 000 − 65 536.
    driver.lastMoveTimestamp -= 90_000;
    const [b] = await driver.handleStateEvent(null, moveMessage(2, 1, 90_000 - 65_536));
    expect(b.cubeTimestamp - a.cubeTimestamp).toBeGreaterThanOrEqual(90_000);
    // A normal interval stays the cube's own.
    const [c] = await driver.handleStateEvent(null, moveMessage(3, 2, 250));
    expect(c.cubeTimestamp - b.cubeTimestamp).toBe(250);
  });
});
