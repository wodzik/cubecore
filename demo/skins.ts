import "./nav";
import { applyMoves, parseAlg, solvedState } from "../packages/core/src/index";
import { renderSvg } from "../packages/image/src/index";
import { CubeRenderer, SKINS, type Skin } from "../packages/render/src/index";

// Skin editor: every control is a path into the skin object; optional parts (a domed centre, shaped pieces,
// reliefs, stickers on a black body) switch on with a default and off by removing them.

type Ctl =
  | { path: string; label: string; hint?: string; num: [min: number, max: number, step: number]; def: number }
  | { path: string; label: string; hint?: string; bool: true; def: boolean }
  | { path: string; label: string; hint?: string; options: [string, string][]; def: string }
  | { path: string; label: string; hint?: string; color: true; def: string };
interface Group {
  title: string;
  /** Optional part: present or not; switching it on sets `make(current skin)`. */
  optional?: { path: string; make: (s: Skin) => unknown; hint: string };
  controls: Ctl[];
}

const n = (path: string, label: string, min: number, max: number, step: number, def: number, hint?: string): Ctl => ({ path, label, num: [min, max, step], def, hint });
const b = (path: string, label: string, def: boolean, hint?: string): Ctl => ({ path, label, bool: true, def, hint });
const radii = (at: string): Ctl[] => [
  n(`${at}.corner.inner`, "corner, towards centre", 0, 0.5, 0.005, 0.1),
  n(`${at}.corner.outer`, "corner, other corners", 0, 0.5, 0.005, 0.05),
  n(`${at}.edge.inner`, "edge, towards centre", 0, 0.5, 0.005, 0.1),
  n(`${at}.edge.outer`, "edge, other corners", 0, 0.5, 0.005, 0.05),
  n(`${at}.center`, "centre", 0, 0.5, 0.005, 0.2, "0.5 = round"),
];
const currentShape = (s: Skin) =>
  structuredClone(s.stickers.shape ?? { corner: { inner: s.stickers.radius, outer: s.stickers.radius }, edge: { inner: s.stickers.radius, outer: s.stickers.radius }, center: s.stickers.radius });

const GROUPS: Group[] = [
  {
    title: "Body",
    controls: [
      { path: "body", label: "plastic colour", color: true, def: "#1f1f1f" },
      n("cubieSize", "cubie size", 0.9, 1, 0.001, 0.99, "1 = no gaps"),
      n("cubieRadius", "cubie rounding", 0, 0.4, 0.005, 0.05),
      n("bodyInset", "body inset", 0, 0.1, 0.001, 0.015, "how deep the tiles sit"),
    ],
  },
  {
    title: "Tiles",
    controls: [
      n("stickers.size", "size", 0.5, 1, 0.001, 0.97),
      n("stickers.thickness", "thickness", 0, 0.12, 0.001, 0.03),
      n("stickers.bevel", "edge round", 0, 0.1, 0.001, 0.012, "≤ thickness"),
      b("stickers.fillOuter", "wrap the cube's edges", true, "stickerless: colour runs round the edges"),
      n("stickers.edgeRadius", "cube edge round", 0, 0.3, 0.005, 0.05),
      n("stickers.cornerRound", "cube corner round", 0, 0.5, 0.005, 0, "rounder than the edges; 0 = off"),
      { path: "stickers.material", label: "material", options: [["plastic", "lit plastic"], ["flat", "flat colour"]], def: "plastic" },
      n("stickers.roughness", "roughness", 0, 1, 0.01, 0.4),
      { path: "stickers.finish", label: "finish", options: [["", "as set"], ["matte", "matte"], ["uv", "UV-coated"]], def: "" },
    ],
  },
  { title: "Tile corners (fractions of the tile)", controls: radii("stickers.shape") },
  {
    title: "Traced outlines",
    optional: { path: "stickers.paths", make: (s) => structuredClone(baseSkin().stickers.paths ?? {}), hint: "SVG outlines override the corner radii (QiYi SC)" },
    controls: [],
  },
  {
    title: "Centre tile",
    controls: [n("stickers.kinds.center.size", "size", 0.5, 1, 0.001, 0.97), n("stickers.kinds.center.thickness", "thickness", 0, 0.12, 0.001, 0.03), n("stickers.kinds.center.bevel", "edge round", 0, 0.1, 0.001, 0.012)],
  },
  {
    title: "Domed centre",
    optional: { path: "stickers.kinds.center.dome", make: () => ({ flat: 0.8, drop: 0.08 }), hint: "flat in a circle, sloping to the corners" },
    controls: [n("stickers.kinds.center.dome.flat", "flat circle", 0.3, 1, 0.005, 0.8, "× the tile's reach"), n("stickers.kinds.center.dome.drop", "drop at corners", 0, 0.15, 0.001, 0.08)],
  },
  {
    title: "Pieces",
    optional: {
      path: "pieces",
      make: () => ({ depth: 0.3, taper: 0.3, wall: 0.35, core: 0.5, mechanism: 1, colored: true, fill: "solid" }),
      hint: "the plastic under the tiles, following them",
    },
    controls: [
      b("pieces.colored", "moulded in colour", true),
      { path: "pieces.fill", label: "fill", options: [["solid", "solid, to the centre"], ["skirt", "a skirt only"]], def: "solid" },
      n("pieces.depth", "skirt depth", 0, 0.5, 0.005, 0.3, "fill: skirt"),
      n("pieces.wall", "straight wall", 0, 1, 0.005, 0.35, "then it narrows"),
      n("pieces.taper", "narrowing", 0, 0.45, 0.005, 0.3),
      n("pieces.core", "core", 0, 1, 0.01, 0.5),
      n("pieces.mechanism", "mechanism ball", 0.6, 1.4, 0.01, 1, "the insides are cut flat on it"),
    ],
  },
  {
    title: "Corner-cutting relief",
    optional: { path: "pieces.relief", make: () => ({ radius: 0.3, depth: 0.12, start: 0.16, tile: 0.01 }), hint: "cut behind the corner next to the centre" },
    controls: [
      n("pieces.relief.radius", "radius", 0, 0.5, 0.005, 0.3),
      n("pieces.relief.depth", "reached at depth", 0.02, 0.5, 0.005, 0.12),
      n("pieces.relief.start", "width at the tile", 0, 0.4, 0.005, 0.16),
      n("pieces.relief.tile", "up into the tile", -0.03, 0.05, 0.001, 0.01, "height above the face"),
      b("pieces.relief.edges", "edge pieces too", false),
    ],
  },
  {
    title: "Stickers on a black body",
    optional: {
      path: "stickers.overlay",
      make: (s) => ({ size: 0.84, margin: 0.08, shape: currentShape(s), thickness: 0.015, bevel: 0.005 }),
      hint: "tiles become plastic, a sticker lies on each (see withStickers)",
    },
    controls: [
      n("stickers.overlay.size", "size", 0.4, 1, 0.001, 0.84),
      n("stickers.overlay.centerSize", "centre size", 0.4, 1, 0.001, 0.84),
      n("stickers.overlay.margin", "margin from cube edge", 0, 0.3, 0.001, 0.08),
      n("stickers.overlay.cornerRadius", "radius at cube corner", 0, 0.5, 0.005, 0.05),
      n("stickers.overlay.thickness", "thickness", 0, 0.06, 0.001, 0.015),
      n("stickers.overlay.bevel", "edge round", 0, 0.03, 0.001, 0.005),
      b("stickers.overlay.pedestal", "black pedestal, flat print", false),
      ...radii("stickers.overlay.shape"),
    ],
  },
];

// ─── skin state ───

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const names = Object.keys(SKINS) as (keyof typeof SKINS)[];
const baseSkin = (): Skin => SKINS[$<HTMLSelectElement>("base").value as keyof typeof SKINS];
let skin: Skin = structuredClone(SKINS.default);

const get = (o: unknown, path: string): unknown => path.split(".").reduce<unknown>((a, k) => (a && typeof a === "object" ? (a as Record<string, unknown>)[k] : undefined), o);
function set(o: Record<string, unknown>, path: string, v: unknown): void {
  const keys = path.split(".");
  let cur = o;
  for (const k of keys.slice(0, -1)) {
    if (!cur[k] || typeof cur[k] !== "object") cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (v === undefined) delete cur[last];
  else cur[last] = v;
}

// ─── controls ───

const refreshers: (() => void)[] = [];
function buildControls(): void {
  const root = $("groups");
  root.replaceChildren();
  refreshers.length = 0;
  // Colours first.
  const colours = document.createElement("details");
  colours.open = true;
  colours.innerHTML = `<summary>Colours</summary><div class="colors"></div>`;
  const faces = ["U", "R", "F", "D", "L", "B"];
  faces.forEach((f, i) => {
    const l = document.createElement("label");
    const input = document.createElement("input");
    input.type = "color";
    input.oninput = () => {
      const cs = [...skin.stickers.colors] as unknown as string[];
      cs[i] = input.value;
      set(skin as unknown as Record<string, unknown>, "stickers.colors", cs);
      changed();
    };
    refreshers.push(() => (input.value = skin.stickers.colors[i]));
    l.append(input, f);
    colours.querySelector(".colors")!.append(l);
  });
  root.append(colours);

  for (const g of GROUPS) {
    const d = document.createElement("details");
    d.open = !g.optional;
    const sum = document.createElement("summary");
    sum.textContent = g.title;
    d.append(sum);
    const box = document.createElement("div");
    if (g.optional) {
      const opt = g.optional;
      const lab = document.createElement("label");
      lab.className = "opt";
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.onclick = (e) => e.stopPropagation();
      cb.onchange = () => {
        set(skin as unknown as Record<string, unknown>, opt.path, cb.checked ? opt.make(skin) : undefined);
        if (cb.checked) d.open = true;
        refreshAll();
        changed();
      };
      lab.append(cb, ` on — ${opt.hint}`);
      sum.append(lab);
      refreshers.push(() => {
        cb.checked = get(skin, opt.path) !== undefined;
        box.classList.toggle("off", !cb.checked);
      });
    }
    for (const c of g.controls) box.append(control(c));
    d.append(box);
    root.append(d);
  }
}

function control(c: Ctl): HTMLElement {
  const row = document.createElement("div");
  row.className = "ctl";
  row.innerHTML = `<span class="name">${c.label}${c.hint ? `<small>${c.hint}</small>` : ""}</span>`;
  const write = (v: unknown) => {
    set(skin as unknown as Record<string, unknown>, c.path, v);
    changed();
  };
  if ("num" in c) {
    const [min, max, step] = c.num;
    const r = Object.assign(document.createElement("input"), { type: "range", min, max, step });
    const box = Object.assign(document.createElement("input"), { type: "number", min, max, step });
    r.oninput = () => ((box.value = r.value), write(Number(r.value)));
    box.oninput = () => ((r.value = box.value), write(Number(box.value)));
    refreshers.push(() => {
      const v = get(skin, c.path);
      r.value = box.value = String(typeof v === "number" ? v : c.def);
    });
    row.append(r, box);
  } else if ("bool" in c) {
    const cb = Object.assign(document.createElement("input"), { type: "checkbox" });
    cb.onchange = () => write(cb.checked);
    refreshers.push(() => (cb.checked = Boolean(get(skin, c.path) ?? c.def)));
    row.append(cb, document.createElement("span"));
  } else if ("options" in c) {
    const sel = document.createElement("select");
    for (const [v, label] of c.options) sel.add(new Option(label, v));
    sel.onchange = () => write(sel.value || undefined);
    refreshers.push(() => (sel.value = String(get(skin, c.path) ?? c.def)));
    row.append(sel, document.createElement("span"));
  } else {
    const col = Object.assign(document.createElement("input"), { type: "color" });
    col.oninput = () => write(col.value);
    refreshers.push(() => (col.value = String(get(skin, c.path) ?? c.def)));
    row.append(col, document.createElement("span"));
  }
  return row;
}
const refreshAll = () => refreshers.forEach((f) => f());

// ─── preview ───

const renderer = new CubeRenderer($("view"), { skin, theme: "dark", camera: { latitude: 30, longitude: 35 } });
const SCRAMBLE = "R U R' F2 D L' B U2 R2 F";
const shown = () => ($<HTMLInputElement>("scrambled").checked ? applyMoves(solvedState(), SCRAMBLE) : solvedState());

function logoFor(name: string): Skin["decals"] {
  const centre = { stickers: [4] };
  if (/qiyi/i.test(name)) return [{ select: centre, image: "/assets/qiyi-logo.png", size: 0.56, rotate: 2 }];
  if (/moyu/i.test(name)) return [{ select: centre, image: "/assets/moyu-logo.png", size: 0.62 }];
  if (/gan/i.test(name)) return [{ select: centre, image: "/assets/gan-logo.png", size: 0.75, blend: "multiply" }];
  return undefined;
}

let pending = false;
function changed(): void {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    const t0 = performance.now();
    const shownSkin = $<HTMLInputElement>("logo").checked ? { ...skin, decals: logoFor($<HTMLSelectElement>("base").value) } : skin;
    renderer.setSkin(shownSkin);
    renderer.setExplode(Number($<HTMLInputElement>("explode").value) / 100);
    const p = Number($<HTMLInputElement>("partial").value) / 100;
    if (p > 0) renderer.showPartial(shown(), parseAlg("R")[0], p);
    else renderer.setState(shown());
    try {
      $("flat").innerHTML = renderSvg(shown(), { view: "iso", skin: shownSkin, size: 360 });
    } catch (e) {
      $("flat").textContent = `2D: ${e instanceof Error ? e.message : e}`;
    }
    $("status").textContent = `rebuilt in ${Math.round(performance.now() - t0)} ms`;
    writeCode();
  });
}

// ─── export ───

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const lit = (v: unknown) => (v === undefined ? "undefined" : JSON.stringify(v));

/** Only what differs from the base, as nested spreads of it. */
function diffCode(cur: Record<string, unknown>, base: Record<string, unknown>, ref: string, pad: string): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(cur), ...Object.keys(base)])) {
    const a = cur[k], bv = base[k];
    if (same(a, bv)) continue;
    if (isObj(a) && isObj(bv)) {
      const inner = diffCode(a, bv, `${ref}.${k}`, `${pad}  `);
      out.push(`${pad}${k}: {\n${pad}  ...${ref}.${k},\n${inner.join("\n")}\n${pad}},`);
    } else out.push(`${pad}${k}: ${lit(a)},`);
  }
  return out;
}

function writeCode(): void {
  const name = $<HTMLSelectElement>("base").value;
  $<HTMLTextAreaElement>("code").value = $<HTMLInputElement>("onlyChanges").checked
    ? `const mySkin: Skin = {\n  ...SKINS.${name},\n${diffCode(skin as unknown as Record<string, unknown>, SKINS[name as keyof typeof SKINS] as unknown as Record<string, unknown>, `SKINS.${name}`, "  ").join("\n")}\n};`
    : JSON.stringify(skin, null, 2);
}

// ─── wiring ───

for (const name of names) $<HTMLSelectElement>("base").add(new Option(name, name));
const load = () => {
  skin = structuredClone(baseSkin());
  refreshAll();
  changed();
};
$("base").onchange = load;
$("reset").onclick = load;
for (const id of ["explode", "partial", "logo", "scrambled", "onlyChanges"]) $(id).addEventListener("input", changed);
$("copy").onclick = () => navigator.clipboard?.writeText($<HTMLTextAreaElement>("code").value);
buildControls();
load();
