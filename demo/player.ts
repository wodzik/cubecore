import "./nav";
import { formatMove, invert, parseAlg } from "../packages/core/src/index";
import { CFOP } from "../packages/cfop/src/index";
import { type CubePlayer, formatTime } from "../packages/element/src/index";
import { recording } from "../packages/timeline/src/index";

// A CFOP solve with a pause before each stage, as a smart cube would record it.
const SOLUTION = parseAlg("F2 R' D L2 R U R' L' U' L R' U' R L U L' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F' U");
const pauses = new Set([0, 4, 7, 10, 13, 16, 23, 37]);
let t = 0;
const solve = recording(
  invert(SOLUTION).map(formatMove).join(" "),
  SOLUTION.map((m, i) => [formatMove(m), (t += pauses.has(i) ? 650 : 140)] as [string, number]),
  t + 80,
);

for (const id of ["solve", "styled"]) {
  const p = document.getElementById(id) as CubePlayer;
  p.recording = solve;
  p.method = CFOP;
}

// 3 · custom controls driving the API.
const custom = document.getElementById("custom") as CubePlayer;
const bar = custom.querySelector(".mine")!;
const range = bar.querySelector("input")!;
const out = bar.querySelector("output")!;
const toggle = bar.querySelector<HTMLButtonElement>('[data-do="toggle"]')!;
bar.addEventListener("click", (e) => {
  const what = (e.target as HTMLElement).dataset.do;
  if (what === "toggle") custom.toggle();
  if (what === "restart") {
    custom.seek(0);
    custom.play();
  }
});
range.addEventListener("input", () => custom.seek((Number(range.value) / 1000) * custom.duration));
custom.addEventListener("timeupdate", (e) => {
  const { time, duration } = (e as CustomEvent<{ time: number; duration: number }>).detail;
  range.value = String(duration ? Math.round((time / duration) * 1000) : 0);
  out.textContent = formatTime(time);
});
for (const ev of ["play", "pause", "ended"]) custom.addEventListener(ev, () => (toggle.textContent = custom.playing ? "Pause" : "Play"));
