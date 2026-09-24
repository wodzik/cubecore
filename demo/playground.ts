import "./nav";
import { type Method, NotationError, formatMove, invert, parseAlg } from "../packages/core/src/index";
import { MASK_NAMES, METHODS, maskByName } from "../packages/methods/src/index";
import "../packages/element/src/index"; // registers <cube-player>
import type { CubePlayer } from "../packages/element/src/index";
import { SKINS, type Skin } from "../packages/skin/src/index";
import { type Recording, decodeShare, encodeShare, recording } from "../packages/timeline/src/index";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const player = $<CubePlayer>("player");
const val = (id: string) => $<HTMLInputElement>(id).value;
const on = (id: string) => $<HTMLInputElement>(id).checked;

// A CFOP solve with pauses before each stage — what a smart cube would record.
const SOLUTION = parseAlg("F2 R' D L2 R U R' L' U' L R' U' R L U L' R U R' U R U2 R' R U R' U' R' F R2 U' R' U' R U R' F' U");
const pauses = new Set([0, 4, 7, 10, 13, 16, 23, 37]);
let t = 0;
const SOLVE: Recording = recording(
  invert(SOLUTION).map(formatMove).join(" "),
  SOLUTION.map((m, i) => [formatMove(m), (t += pauses.has(i) ? 650 : 140)] as [string, number]),
  t + 80,
);
$<HTMLTextAreaElement>("share").value = encodeShare({ recording: SOLVE, method: "cfop" });

for (const name of Object.keys(SKINS)) $<HTMLSelectElement>("skin").add(new Option(name, name));
$<HTMLSelectElement>("skin").value = "ganI4";
for (const name of MASK_NAMES) $<HTMLSelectElement>("mask").add(new Option(name, name));
for (const m of METHODS) $<HTMLSelectElement>("method").add(new Option(m.name, m.id));
$<HTMLSelectElement>("method").value = "cfop";

player.addEventListener("error", (e) => ($("error").textContent = (e as CustomEvent<{ message: string }>).detail.message));

function apply() {
  $("error").textContent = "";
  const timing = val("timing");
  $("algBox").hidden = timing !== "tempo";
  $("shareBox").hidden = timing !== "share";
  $("tempoOut").textContent = val("tempo");
  document.documentElement.dataset.theme = val("theme");
  player.setAttribute("theme", val("theme")); // the skin's light / dark adjustments (masked greys, back stickers)

  // Look
  const base = SKINS[val("skin") as keyof typeof SKINS] as Skin;
  player.skin = { ...base, hints: { ...base.hints, enabled: on("hints") } };
  player.setAttribute("visualization", val("viz"));
  player.setAttribute("back-view", val("back"));
  player.mask = val("mask") ? maskByName(val("mask")) : null;
  const method = METHODS.find((m) => m.id === val("method")) ?? null;
  player.method = method as Method | null;

  // Controls
  on("controls") ? player.removeAttribute("controls") : player.setAttribute("controls", "none");
  player.toggleAttribute("progress", on("progress"));
  player.toggleAttribute("markers", on("markers"));
  player.toggleAttribute("segment-labels", on("labels"));
  on("tooltips") ? player.removeAttribute("tooltips") : player.setAttribute("tooltips", "off");

  // What plays
  let rec: Recording | null = null;
  if (timing === "recorded") rec = SOLVE;
  if (timing === "share") {
    const shared = decodeShare(val("share").trim());
    if (!shared) $("error").textContent = "Not a valid share code.";
    rec = shared?.recording ?? null;
  }
  if (timing === "tempo") {
    // The algorithm first: every change below reloads the player, and with a stale (bad) algorithm each would report it again.
    player.alg = val("alg");
    player.recording = null;
    player.setAttribute("tempo", val("tempo"));
    player.setAttribute("anchor", on("solves") ? "end" : "start");
    player.setAttribute("setup", val("setup"));
    try {
      parseAlg(val("setup"));
    } catch (e) {
      if (e instanceof NotationError) $("error").textContent = `Setup: ${e.message}`;
    }
  } else player.recording = rec;

  $("code").textContent = snippet(timing, method);
}

function snippet(timing: string, method: Method | null): string {
  const attrs = [
    timing === "tempo" && `alg="${val("alg").trim()}"`,
    timing === "tempo" && val("setup").trim() && `setup="${val("setup").trim()}"`,
    timing === "tempo" && on("solves") && `anchor="end"`,
    timing === "tempo" && `tempo="${val("tempo")}"`,
    `skin="${val("skin")}"`,
    `theme="${val("theme")}"`,
    val("viz") !== "3d" && `visualization="${val("viz")}"`,
    val("back") !== "none" && `back-view="${val("back")}"`,
    !on("controls") && `controls="none"`,
    on("progress") && "progress",
    on("markers") && "markers",
    on("labels") && "segment-labels",
    !on("tooltips") && `tooltips="off"`,
  ].filter(Boolean);
  const js = [
    timing !== "tempo" && (timing === "share" ? `player.recording = decodeShare(code).recording;` : `player.recording = mySolve; // { scramble, moves: [{ move, t }], totalMs }`),
    method && `player.method = ${method.id.toUpperCase().replace("-", "_")}; // sections (or: player.segments = [{ start, end, label, split?, … }])`,
    val("mask") && `player.mask = maskByName("${val("mask")}");`,
    on("hints") && `player.skin = { ...SKINS.${val("skin")}, hints: { ...SKINS.${val("skin")}.hints, enabled: true } };`,
  ].filter(Boolean);
  return `<cube-player ${attrs.join(" ")}></cube-player>` + (js.length ? `\n\n<script type="module">\n  const player = document.querySelector("cube-player");\n  ${js.join("\n  ")}\n</script>` : "");
}

for (const el of document.querySelectorAll("input, select, textarea")) el.addEventListener(el.tagName === "SELECT" || (el as HTMLInputElement).type === "checkbox" ? "change" : "input", apply);
apply();
