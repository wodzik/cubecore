import { describe, expect, it } from "bun:test";
import { gripOf } from "./grips";
import { GripRecorder, heldMove, heldTokens, type TimedMove } from "./rotations";
import { SimulatedCube } from "./simulated";
import { SmartCubeSession } from "./session";

const at = (list: [string, number][]): TimedMove[] => list.map(([move, t]) => ({ move, t }));
const letters = (s: string, t0 = 0, dt = 100): TimedMove[] => s.split(" ").map((move, i) => ({ move, t: t0 + i * dt }));

describe("heldTokens", () => {
  it("re-letters moves for the grip", () => {
    const orangeFront = gripOf("U", "L");
    expect(heldMove("L", orangeFront)).toBe("F");
    expect(heldMove("F'", orangeFront)).toBe("R'");
    expect(heldMove("U2", orangeFront)).toBe("U2");
  });

  it("combines back-to-back rotations and letters after them", () => {
    const tokens = heldTokens(letters("L L R U"), "y'", [
      { after: 2, t: 150, move: "y" },
      { after: 2, t: 160, move: "y" },
    ]);
    expect(tokens.map((t) => t.move)).toEqual(["F", "F", "y2", "F", "U"]);
    expect(heldTokens(letters("R U"), "", [{ after: 1, t: 50, move: "y" }, { after: 1, t: 60, move: "y'" }]).map((t) => t.move)).toEqual(["R", "U"]);
  });

  it("slices and wide moves: S = F' B + z, r = L + x", () => {
    expect(heldTokens(at([["R", 0], ["F'", 500], ["B", 520], ["U", 900]]), "", [{ after: 2, t: 530, move: "z" }]).map((t) => t.move)).toEqual(["R", "S", "R"]);
    expect(heldTokens(at([["L", 0], ["U", 400]]), "", [{ after: 0, t: 20, move: "x" }]).map((t) => t.move)).toEqual(["r", "B"]);
    // Far from the moves, a rotation stays one.
    expect(heldTokens(at([["D", 0], ["R", 1500]]), "", [{ after: 1, t: 800, move: "y" }]).map((t) => t.move)).toEqual(["D", "y", "F"]);
  });

  it("a slice's rotation a couple of moves late is still the slice", () => {
    expect(heldTokens(at([["F'", 0], ["B", 20], ["U", 150], ["L", 300]]), "", [{ after: 4, t: 350, move: "z" }]).map((t) => t.move)).toEqual(["S", "R", "U"]);
    expect(heldTokens(at([["U'", 0], ["L", 300], ["R'", 340], ["F'", 1600], ["R'", 1800]]), "", [{ after: 4, t: 1700, move: "x" }]).map((t) => t.move)).toEqual([
      "U'",
      "M'",
      "U'",
      "R'",
    ]);
    // One face and a far rotation: a face turn and a real regrip.
    expect(heldTokens(at([["R'", 0], ["U", 1500]]), "", [{ after: 1, t: 1200, move: "x" }]).map((t) => t.move)).toEqual(["R'", "x", "B"]);
  });

  it("M2 as two quarters (R' L R' L + x2) is one M2", () => {
    const q: [string, number][] = [["R'", 0], ["L", 40], ["R'", 110], ["L", 150]];
    expect(heldTokens(at([...q, ["U", 800]]), "", [{ after: 4, t: 200, move: "x2" }]).map((t) => t.move)).toEqual(["M2", "D"]);
    expect(heldTokens(at([...q, ["U", 230], ["F", 300]]), "", [{ after: 6, t: 320, move: "x2" }]).map((t) => t.move)).toEqual(["M2", "D", "B"]);
  });
});

describe("a peek at the back and back after a slice", () => {
  it("x x' x at one place is one x, timed by the first — still the slice's", () => {
    // M' as R' L (one instant), then the cube tipped back and forth while recognising.
    const tokens = heldTokens(at([["U", 0], ["R'", 1000], ["L", 1000], ["D'", 2200]]), "", [
      { after: 2, t: 1070, move: "x" },
      { after: 2, t: 1550, move: "x'" },
      { after: 2, t: 1900, move: "x" },
    ]);
    expect(tokens.map((t) => t.move)).toEqual(["U", "M'", "F'"]);
  });
});

describe("u and d are a turn and a regrip", () => {
  it("D + y stays D and y by default; r / l / f / b and slices are still read", () => {
    // u = D + y (the core turns with E): by default a D turn and a y regrip.
    expect(heldTokens(at([["D", 0], ["R", 800]]), "", [{ after: 1, t: 30, move: "y" }]).map((t) => t.move)).toEqual(["D", "y", "F"]);
    expect(heldTokens(at([["D", 0], ["R", 800]]), "", [{ after: 1, t: 30, move: "y" }], { wide: ["u", "d", "r", "l", "f", "b"] }).map((t) => t.move)).toEqual(["u", "F"]);
    expect(heldTokens(at([["L", 0], ["U", 400]]), "", [{ after: 0, t: 20, move: "x" }]).map((t) => t.move)).toEqual(["r", "B"]);
    // E (U D' + y') is a slice: still read.
    expect(heldTokens(at([["U", 0], ["D'", 10], ["R", 800]]), "", [{ after: 2, t: 40, move: "y'" }]).map((t) => t.move)[0]).toBe("E");
  });
});

describe("GripRecorder", () => {
  // An orientation (our axes) → what the simulated cube sends (GAN's axes, inverted).
  const raw = (ax: [number, number, number], deg: number) => {
    const h = (deg * Math.PI) / 360;
    const q = { x: ax[0] * Math.sin(h), y: ax[1] * Math.sin(h), z: ax[2] * Math.sin(h), w: Math.cos(h) };
    return { x: q.x, y: -q.z, z: q.y, w: q.w };
  };
  const hold = async (cube: SimulatedCube, q: ReturnType<typeof raw>, ms = 220) => {
    for (let t = 0; t < ms; t += 40) {
      cube.tilt(q);
      await Bun.sleep(40);
    }
  };

  it("marks a rotation by the moves before it in the stream, and gives a stretch's start grip", async () => {
    const cube = new SimulatedCube();
    const session = new SmartCubeSession(cube);
    const rec = new GripRecorder(session);
    await hold(cube, raw([0, 1, 0], 0));
    await hold(cube, raw([0, 1, 0], 90)); // y' before the moves: orange in front
    const times: number[] = [];
    session.on("move", (e) => times.push(e.time));
    cube.turn("L");
    cube.turn("L");
    await hold(cube, raw([0, 1, 0], 0)); // y: green in front again
    cube.turn("R");
    cube.turn("U");
    const first = rec.moveNumberAt(times[0])!;
    const r = rec.forMoves(first, 4, times[0])!;
    expect(r.startRotation).toBe("y'");
    expect(r.rotations.map((x) => [x.after, x.move])).toEqual([[2, "y"]]);
    const tokens = heldTokens(times.map((t, i) => ({ move: ["L", "L", "R", "U"][i], t: t - times[0] })), r.startRotation, r.rotations);
    expect(tokens.map((t) => t.move)).toEqual(["F", "F", "y", "R", "U"]);
    rec.stop();
  });
});
