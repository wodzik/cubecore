/**
 * <cube-player> — a cube that plays an algorithm or a recorded solve, with
 * optional controls and progress bar. Three levels of customisation:
 *
 *   1. use it as is:           <cube-player alg="R U R' U'" progress></cube-player>
 *   2. restyle it:             CSS variables (--cc-accent…) and ::part(button-play)… — see styles.ts
 *   3. bring your own controls: <cube-player controls="none"> or a child with slot="controls",
 *                               driven by play() / pause() / seek() / stepForward()… and events.
 *
 * Attributes: alg, setup, anchor ("start": play the algorithm from the
 * (set-up) cube — default; "end": the algorithm SOLVES it, so the cube
 * starts at setup + inverse of the algorithm), tempo (moves per second,
 * default 2), skin (preset name), theme ("light" | "dark" | "auto" — the
 * skin's adjustments for the page; auto follows the system), back-view, visualization ("3d" | "net" |
 * "top" — the 2D views are SVG pictures from @cubecore/image), controls
 * ("default" | "none"), max-pause (ms: recorded pauses longer than this are
 * shortened in the replay), progress (show the bar), markers (ticks at section
 * ends), segment-labels (section names under the bar — click one to jump to
 * it), tooltips ("off" to hide the section popup).
 *
 * Sections: `segments` (any [{ start, end, label, id?, detail?, split?,
 * moves?, color? }] — see @cubecore/timeline Segment), or `method`, which
 * computes them from the recording (stageSegments: any Method, colour
 * neutral). The bar colours each section (palette --cc-segment-1…8 or the
 * segment's colour), hatches the recognition part (before `split`), and
 * shows a popup over the section under the pointer / at the playhead
 * (`formatSegment` for your own text). PageUp / PageDown jump between sections.
 * Properties: recording (a timed solve — plays in real time), alg, setup,
 * skin, mask, method (sections from it), segments, formatSegment, markers, speeds, rate,
 * currentTime, duration, playing, renderer.
 * Events: timeupdate {time, duration, applied}, play, pause, ended,
 * error {message} (e.g. an algorithm that doesn't parse — the cube then shows the setup),
 * segmentchange {index, segment} (the playhead entered another section),
 * load (what plays changed — alg, setup, recording…).
 *
 * Live: `attach(session)` follows a smart cube (a @cubecore/bluetooth
 * SmartCubeSession, or anything with the same events) — its moves animate,
 * resyncs jump, the gyro turns the cube; replay controls hide (`live`
 * attribute). `detach()` goes back to playback.
 */

/** What `attach` needs — SmartCubeSession fits; so does anything shaped like it. */
export interface LiveSource {
  readonly state: State;
  /** A skin for this cube (SmartCubeSession has one); used with attach(…, { autoSkin: true }). */
  readonly suggestedSkin?: Skin;
  on(type: "move", listener: (e: { move: Move }) => void): () => void;
  on(type: "state", listener: (e: { state: State; reason: string }) => void): () => void;
  on(type: "orientation", listener: (q: { x: number; y: number; z: number; w: number }) => void): () => void;
}

import { type Mask, type Method, type Move, type State, type TurnArrow, applyMoves, parseAlg, solvedState, spinsAfter } from "@cubecore/core";
import { renderSvg } from "@cubecore/image";
import { type ArrowStyle, type BackView, CubeRenderer, showPosition } from "@cubecore/render";
import { SKINS, type Skin, type Theme } from "@cubecore/skin";
import { type Position, type Recording, ReplayClock, type Segment, compressPauses, segmentAt, segmentPlayed, stageSegments } from "@cubecore/timeline";
import { type Marker, formatTime, fraction, segmentText, startMoves, stepTime, tempoRecording } from "./model";
import { ICONS, STYLES } from "./styles";
import { ElementBase } from "./base";

const TEMPLATE = `
<style>${STYLES}</style>
<div class="stage" part="stage"><div class="flat" part="flat" hidden></div></div>
<div class="progress" part="progress" role="slider" tabindex="0" aria-label="Position" aria-valuemin="0">
  <div class="tooltip" part="tooltip" role="tooltip" hidden></div>
  <div class="track" part="progress-track">
    <div class="fill" part="progress-fill"></div>
    <div class="segments"></div>
    <div class="markers"></div>
    <div class="thumb" part="progress-thumb"></div>
  </div>
</div>
<div class="labels" part="segment-labels"></div>
<slot name="controls">
  <div class="controls" part="controls">
    <span class="time" part="time">0.00 / 0.00</span>
    <div class="buttons" part="buttons">
    <button class="start" part="button button-start" data-action="start" aria-label="To start" title="To start (Home)">${ICONS.start}</button>
    <button class="back" part="button button-back" data-action="back" aria-label="Previous move" title="Previous move (←)">${ICONS.back}</button>
    <button class="play" part="button button-play" data-action="toggle" aria-label="Play" title="Play / pause (Space)">${ICONS.play}</button>
    <button class="forward" part="button button-forward" data-action="forward" aria-label="Next move" title="Next move (→)">${ICONS.forward}</button>
    <button class="end" part="button button-end" data-action="end" aria-label="To end" title="To end (End)">${ICONS.end}</button>
    </div>
    <button class="speed" part="button button-speed" data-action="speed" aria-label="Speed" title="Playback speed">1×</button>
  </div>
</slot>`;

export class CubePlayer extends ElementBase {
  static observedAttributes = ["alg", "setup", "anchor", "tempo", "skin", "back-view", "visualization", "theme", "max-pause"];
  private readonly darkQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
  private readonly onScheme = () => this.applyTheme();

  private readonly root: ShadowRoot;
  private _renderer: CubeRenderer | null = null;
  private turnArrows: { arrows: readonly TurnArrow[]; style: ArrowStyle; owner: unknown } | null = null;
  private clock: ReplayClock | null = null;
  private unsubscribe: (() => void) | null = null;
  private rec: Recording = { scramble: [], moves: [], totalMs: 0 };
  private start: State = solvedState();
  private startMoves: Move[] = [];
  private _recording: Recording | null = null;
  private _skin: Skin | null = null;
  private _mask: Mask | null = null;
  private _method: Method | null = null;
  private _markers: Marker[] | null = null;
  private _segments: Segment[] | null = null;
  private segs: Segment[] = [];
  private currentSegment = -1;
  private tooltipHide = 0;
  /** Tooltip text of a section (default: label · detail · time (recognition · execution) · moves). */
  formatSegment: (s: Segment) => string = segmentText;
  private _speeds = [0.5, 1, 2];
  private _rate = 1;
  private _setupState: State | null = null;
  private liveOff: (() => void) | null = null;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = TEMPLATE;
    this.root.addEventListener("click", (e) => this.onClick(e));
    this.addEventListener("keydown", (e) => this.onKey(e));
    this.wireProgress();
  }

  connectedCallback(): void {
    if (!this.hasAttribute("tabindex")) this.tabIndex = 0;
    if (!this._renderer) {
      this._renderer = new CubeRenderer(this.$(".stage"), { skin: this.resolveSkin(), theme: this.resolvedTheme() });
      this.darkQuery?.addEventListener("change", this.onScheme);
      const bv = this.getAttribute("back-view") as BackView | null;
      if (bv) this._renderer.setBackView(bv);
      if (this._mask) this._renderer.setMask(this._mask);
      if (this.turnArrows) this._renderer.setTurnArrows(this.turnArrows.arrows, this.turnArrows.style);
    }
    this.load();
  }

  disconnectedCallback(): void {
    this.darkQuery?.removeEventListener("change", this.onScheme);
    this.clock?.pause();
    this.unsubscribe?.();
    this._renderer?.dispose();
    this._renderer = null;
  }

  attributeChangedCallback(name: string): void {
    if (!this._renderer) return;
    if (name === "skin") {
      this._renderer.setSkin(this.resolveSkin());
      this.redraw();
    } else if (name === "visualization") this.redraw();
    else if (name === "theme") this.applyTheme();
    else if (name === "back-view") this._renderer.setBackView((this.getAttribute("back-view") as BackView) ?? "none");
    else this.load();
  }

  // ─── data ───

  /** A timed solve: plays in real time (pauses stay pauses). Takes precedence over `alg`. */
  get recording(): Recording | null {
    return this._recording;
  }
  set recording(r: Recording | null) {
    this._recording = r;
    this.load();
  }

  get alg(): string {
    return this.getAttribute("alg") ?? "";
  }
  set alg(v: string) {
    this.setAttribute("alg", v);
  }

  /** Moves (or a state) that set the cube up before it plays. */
  get setup(): string {
    return this.getAttribute("setup") ?? "";
  }
  set setup(v: string | State) {
    if (typeof v === "string") {
      this._setupState = null;
      this.setAttribute("setup", v);
    } else {
      this._setupState = new Uint8Array(v);
      this.removeAttribute("setup");
      this.load();
    }
  }

  get skin(): Skin {
    return this.resolveSkin();
  }
  set skin(s: Skin | string) {
    if (typeof s === "string") {
      this._skin = null;
      this.setAttribute("skin", s);
    } else {
      this._skin = s;
      this._renderer?.setSkin(s);
      this.redraw();
    }
  }

  get mask(): Mask | null {
    return this._mask;
  }
  set mask(m: Mask | null) {
    this._mask = m;
    this._renderer?.setMask(m);
    this.redraw();
  }

  /** Sections come from this method's analysis of the recording (colour neutral), unless `segments` are given. */
  get method(): Method | null {
    return this._method;
  }
  set method(m: Method | null) {
    this._method = m;
    this.renderSections();
  }

  /** Explicit sections of the bar (override `method`). */
  get segments(): Segment[] {
    return [...this.segs];
  }
  set segments(s: Segment[] | null) {
    this._segments = s;
    this.renderSections();
  }

  /** Explicit tick marks (default: the ends of the sections). */
  get markers(): Marker[] | null {
    return this._markers;
  }
  set markers(m: Marker[] | null) {
    this._markers = m;
    this.renderSections();
  }

  /** Speeds the speed button cycles through. */
  get speeds(): number[] {
    return [...this._speeds];
  }
  set speeds(v: number[]) {
    this._speeds = v.length ? [...v] : [1];
  }

  /** The underlying renderer, for anything the element doesn't expose. */
  get renderer(): CubeRenderer | null {
    return this._renderer;
  }

  // ─── playback API ───

  get playing(): boolean {
    return this.clock?.isPlaying ?? false;
  }
  get currentTime(): number {
    return this.clock?.currentTime ?? 0;
  }
  get duration(): number {
    return this.rec.totalMs;
  }
  get rate(): number {
    return this._rate;
  }
  set rate(r: number) {
    this._rate = r;
    if (this.clock) this.clock.rate = r;
    this.$(".speed").textContent = `${r}×`;
  }

  play(): void {
    if (!this.clock || this.playing) return;
    this.clock.play();
    this.dispatchEvent(new Event("play"));
    this.updateUi(this.currentTime);
  }
  pause(): void {
    if (!this.clock || !this.playing) return;
    this.clock.pause();
    this.dispatchEvent(new Event("pause"));
    this.updateUi(this.currentTime);
  }
  toggle(): void {
    if (this.playing) this.pause();
    else this.play();
  }
  seek(ms: number): void {
    this.clock?.seek(ms);
  }
  /** Jump to the moment `k` moves are done (0 = the start). */
  seekToMove(k: number): void {
    this.pause();
    this.seek(k <= 0 ? 0 : (this.rec.moves[Math.min(k, this.rec.moves.length) - 1]?.t ?? 0));
  }

  /** Moves done at the current time. */
  get applied(): number {
    return this.lastPos.applied;
  }

  /** The moves being played (the algorithm, or the recording's moves). */
  get moves(): Move[] {
    return this.rec.moves.map((m) => m.move);
  }

  stepForward(): void {
    this.pause();
    this.seek(stepTime(this.rec, this.currentTime, 1));
  }
  stepBack(): void {
    this.pause();
    this.seek(stepTime(this.rec, this.currentTime, -1));
  }
  toStart(): void {
    this.pause();
    this.seek(0);
  }
  toEnd(): void {
    this.pause();
    this.seek(this.duration);
  }

  // ─── live ───

  /** Follow a smart cube: its moves animate, resyncs jump, its gyro turns the cube. Returns detach. */
  attach(source: LiveSource, options: { gyro?: boolean; gyroSmoothing?: number; autoSkin?: boolean } = {}): () => void {
    this.detach();
    this.pause();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.setAttribute("live", "");
    if (options.autoSkin && source.suggestedSkin) this.skin = source.suggestedSkin;
    const r = () => this._renderer;
    r()?.setState(source.state);
    const offs = [
      source.on("move", (e) => void r()?.animate(e.move)),
      source.on("state", (e) => {
        if (e.reason !== "move") r()?.setState(e.state);
      }),
    ];
    if (options.gyro ?? true) offs.push(source.on("orientation", (q) => r()?.setOrientation(q, options.gyroSmoothing ?? 0.6)));
    this.liveOff = () => offs.forEach((off) => off());
    return () => this.detach();
  }

  /** Stop following a live cube and go back to playback. */
  detach(): void {
    if (!this.liveOff) return;
    this.liveOff();
    this.liveOff = null;
    this.removeAttribute("live");
    this._renderer?.setOrientation(null);
    this.load();
  }

  /**
   * Arrows for the next turn on the 3D cube (a tracker's `nextTurn().arrows`).
   * `owner` (e.g. the <cube-scramble> setting them): clearing with null only
   * works for the one that set them last, so two elements can share a player.
   */
  showTurnArrows(arrows: readonly TurnArrow[] | null, style: ArrowStyle = {}, owner: unknown = null): void {
    if (!arrows && this.turnArrows && owner !== null && this.turnArrows.owner !== owner) return;
    this.turnArrows = arrows?.length ? { arrows, style, owner } : null;
    this._renderer?.setTurnArrows(arrows, style);
  }

  /** Animate one move now (live input without a session). */
  pushMove(move: Move | string): void {
    for (const m of typeof move === "string" ? parseAlg(move) : [move]) void this._renderer?.animate(m);
  }

  // ─── internals ───

  private $<T extends HTMLElement = HTMLElement>(sel: string): T {
    return this.root.querySelector(sel) as T;
  }

  private resolveSkin(): Skin {
    if (this._skin) return this._skin;
    const name = this.getAttribute("skin") as keyof typeof SKINS | null;
    return (name && SKINS[name]) || SKINS.default;
  }

  private load(): void {
    if (!this._renderer || this.liveOff) return;
    const wasPlaying = this.playing;
    this.clock?.pause();
    this.unsubscribe?.();
    let maxAnimMs = 150;
    let solves: Move[] = [];
    try {
      if (this._recording) {
        // max-pause: long recognitions shortened (ms), so replays keep moving.
        const cap = Number(this.getAttribute("max-pause"));
        this.rec = cap > 0 ? compressPauses(this._recording, cap) : this._recording;
      } else {
        const tempo = Number(this.getAttribute("tempo") ?? 2) || 2;
        const t = tempoRecording(this.alg, tempo);
        this.rec = t.recording;
        maxAnimMs = t.interval * 0.8;
        // anchor="end": the algorithm solves the cube — start from its inverse.
        solves = startMoves([], t.recording.moves.map((m) => m.move), this.getAttribute("anchor") === "end" ? "end" : "start");
      }
      const setup = this._setupState ? [] : parseAlg(this.setup);
      this.startMoves = [...setup, ...solves, ...this.rec.scramble];
      this.start = this._setupState ? applyMoves(this._setupState, [...solves, ...this.rec.scramble]) : applyMoves(solvedState(), this.startMoves);
    } catch (err) {
      // Bad notation: show the cube as set up (or solved) and tell the page.
      this.rec = { scramble: [], moves: [], totalMs: 0 };
      this.startMoves = [];
      this.start = this._setupState ?? solvedState();
      this.dispatchEvent(new CustomEvent("error", { detail: { message: err instanceof Error ? err.message : String(err) } }));
    }
    this.clock = new ReplayClock(this.rec, { maxAnimMs });
    this.clock.rate = this._rate;
    this.unsubscribe = this.clock.onChange((time, pos) => this.onTime(time, pos));
    this.renderSections();
    this.clock.seek(0);
    this.dispatchEvent(new Event("load"));
    if (wasPlaying) this.play();
  }

  private lastPos: Position = { applied: 0 };
  /** Play / pause icon currently shown (null: not drawn yet). */
  private shownPlaying: boolean | null = null;

  private onTime(time: number, pos: Position): void {
    this.lastPos = pos;
    if (this._renderer) showPosition(this._renderer, this.start, this.rec.moves.map((m) => m.move), pos, spinsAfter(solvedState(), this.startMoves));
    this.redraw();
    this.updateUi(time);
    this.dispatchEvent(new CustomEvent("timeupdate", { detail: { time, duration: this.duration, applied: pos.applied } }));
    // The clock reports the final frame while still playing, then stops: that frame is the end.
    if (time >= this.duration && this.duration > 0 && this.playing) {
      queueMicrotask(() => {
        this.updateUi(time);
        this.dispatchEvent(new Event("ended"));
      });
    }
  }

  /** "light" / "dark" from the theme attribute; "auto" (default) follows the system setting. */
  private resolvedTheme(): Theme {
    const t = this.getAttribute("theme");
    if (t === "light" || t === "dark") return t;
    return this.darkQuery && !this.darkQuery.matches ? "light" : "dark";
  }

  private applyTheme(): void {
    this._renderer?.setTheme(this.resolvedTheme());
    this.redraw();
  }

  /** 2D visualizations: an SVG of the position (moves applied so far) with the same skin and mask. */
  private redraw(): void {
    const kind = this.getAttribute("visualization") ?? "3d";
    const flat = this.$(".flat");
    const canvas = this._renderer?.canvas;
    const is2d = kind === "net" || kind === "top" || kind === "iso";
    flat.hidden = !is2d;
    if (canvas) canvas.style.visibility = is2d ? "hidden" : "";
    if (!is2d) return;
    const played = this.rec.moves.slice(0, this.lastPos.applied).map((m) => m.move);
    const state = applyMoves(this.start, played);
    const spins = spinsAfter(solvedState(), [...this.startMoves, ...played]);
    flat.innerHTML = renderSvg(state, { view: kind, skin: this.resolveSkin(), theme: this.resolvedTheme(), spins, ...(this._mask ? { mask: this._mask } : {}) });
  }

  private updateUi(time: number): void {
    const f = fraction(time, this.duration);
    this.$(".fill").style.width = `${f * 100}%`;
    this.$(".thumb").style.left = `${f * 100}%`;
    const progress = this.$(".progress");
    progress.setAttribute("aria-valuemax", String(Math.round(this.duration)));
    progress.setAttribute("aria-valuenow", String(Math.round(time)));
    progress.setAttribute("aria-valuetext", `${formatTime(time)} of ${formatTime(this.duration)}`);
    this.$(".time").textContent = `${formatTime(time)} / ${formatTime(this.duration)}`;
    // Swap the icon only when the state changes: rewriting it every frame replaced the element under the
    // pointer mid-click, and the browser then drops the click (pause "sometimes didn't work").
    if (this.shownPlaying !== this.playing) {
      this.shownPlaying = this.playing;
      const play = this.$<HTMLButtonElement>(".play");
      play.innerHTML = this.playing ? ICONS.pause : ICONS.play;
      play.setAttribute("aria-label", this.playing ? "Pause" : "Play");
    }
    const atStart = time <= 0, atEnd = time >= this.duration;
    this.$<HTMLButtonElement>(".start").disabled = atStart;
    this.$<HTMLButtonElement>(".back").disabled = atStart;
    this.$<HTMLButtonElement>(".forward").disabled = atEnd;
    this.$<HTMLButtonElement>(".end").disabled = atEnd;
    this.updateSections(time);
  }

  // ─── sections ───

  private renderSections(): void {
    this.segs = this._segments ?? (this._method && this.rec.moves.length ? stageSegments(this._method, this.rec) : []);
    this.currentSegment = -1;
    const pct = (t: number) => fraction(t, this.duration) * 100;
    const partId = (s: Segment) => (s.id ? ` segment-${s.id.replace(/[^\w-]/g, "")}` : "");
    this.$(".progress").classList.toggle("has-segments", this.segs.length > 0);
    this.$(".segments").innerHTML = this.segs
      .map((s, i) => {
        const colour = s.color ?? `var(--cc-segment-${(i % 8) + 1})`;
        const rec = s.split !== undefined && s.end > s.start ? ((s.split - s.start) / (s.end - s.start)) * 100 : 0;
        return `<div class="segment" part="segment${partId(s)}" style="left:${pct(s.start)}%;width:${pct(s.end) - pct(s.start)}%;--seg:${colour}">
          <div class="played" part="segment-played"></div>
          ${rec > 0 ? `<div class="recognition" part="segment-recognition" style="width:${rec}%"></div>` : ""}
        </div>`;
      })
      .join("");
    this.$(".labels").innerHTML = this.segs
      .map(
        (s, i) =>
          `<button class="label" part="segment-label${s.id ? ` segment-label-${s.id.replace(/[^\w-]/g, "")}` : ""}" data-segment="${i}" style="left:${pct(s.start)}%;width:${pct(s.end) - pct(s.start)}%" title="${this.formatSegment(s).replace(/"/g, "&quot;")}">${s.label}</button>`,
      )
      .join("");
    // Ticks: explicit markers, else the ends of the sections.
    const marks = this._markers ?? this.segs.slice(0, -1).map((s) => ({ time: s.end, label: s.label }));
    this.$(".markers").innerHTML = marks
      .map((m) => `<div class="marker" part="progress-marker" title="${`${m.label} · ${formatTime(m.time)}`.replace(/"/g, "&quot;")}" style="left:${pct(m.time)}%"></div>`)
      .join("");
    this.updateSections(this.currentTime);
  }

  private updateSections(time: number): void {
    const els = this.root.querySelectorAll<HTMLElement>(".segment .played");
    this.segs.forEach((s, i) => els[i] && (els[i].style.width = `${segmentPlayed(s, time) * 100}%`));
    const index = segmentAt(this.segs, time);
    if (index === this.currentSegment) return;
    this.currentSegment = index;
    this.root.querySelectorAll(".label").forEach((el, i) => el.classList.toggle("current", i === index));
    if (index >= 0) this.dispatchEvent(new CustomEvent("segmentchange", { detail: { index, segment: this.segs[index] } }));
  }

  /** Show the popup of section `index` (−1 hides it). */
  private showTooltip(index: number, autoHideMs = 0): void {
    const tip = this.$(".tooltip");
    clearTimeout(this.tooltipHide);
    if (index < 0 || this.getAttribute("tooltips") === "off" || !this.segs[index]) {
      tip.hidden = true;
      return;
    }
    const s = this.segs[index];
    tip.innerHTML = "";
    const text = document.createElement("span");
    text.className = "tip";
    text.setAttribute("part", "tooltip-text");
    text.textContent = this.formatSegment(s);
    tip.appendChild(text);
    tip.hidden = false;
    const track = this.$(".track").getBoundingClientRect();
    const centre = ((s.start + s.end) / 2 / (this.duration || 1)) * track.width;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(centre, half), Math.max(half, track.width - half))}px`;
    if (autoHideMs) this.tooltipHide = window.setTimeout(() => (tip.hidden = true), autoHideMs);
  }

  /** Start of the next (+1) / this-or-previous (−1) section. */
  private jumpSection(direction: 1 | -1): void {
    if (!this.segs.length) return;
    const t = this.currentTime;
    const i = Math.max(0, segmentAt(this.segs, t));
    const target = direction > 0 ? (this.segs[i + 1]?.start ?? this.duration) : t - this.segs[i].start > 250 ? this.segs[i].start : (this.segs[i - 1]?.start ?? 0);
    this.pause();
    this.seek(target);
  }

  private onClick(e: Event): void {
    const action = (e.target as HTMLElement).closest("button")?.dataset.action;
    if (action === "toggle") this.toggle();
    else if (action === "back") this.stepBack();
    else if (action === "forward") this.stepForward();
    else if (action === "start") this.toStart();
    else if (action === "end") this.toEnd();
    else if (action === "speed") {
      const i = this._speeds.indexOf(this._rate);
      this.rate = this._speeds[(i + 1) % this._speeds.length];
    }
  }

  private onKey(e: KeyboardEvent): void {
    // Leave typing alone (inputs in custom controls).
    const target = e.composedPath()[0] as HTMLElement;
    if (target.closest?.("input, textarea, select, [contenteditable]")) return;
    const keys: Record<string, () => void> = {
      " ": () => this.toggle(),
      k: () => this.toggle(),
      ArrowRight: () => this.stepForward(),
      ArrowLeft: () => this.stepBack(),
      Home: () => this.toStart(),
      End: () => this.toEnd(),
      PageDown: () => this.jumpSection(1),
      PageUp: () => this.jumpSection(-1),
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    run();
  }

  private wireProgress(): void {
    const bar = this.$(".progress");
    const seekTo = (clientX: number) => {
      const r = this.$(".track").getBoundingClientRect();
      this.seek(fraction(clientX - r.left, r.width) * this.duration);
    };
    let resume = false;
    bar.addEventListener("pointerdown", (e) => {
      resume = this.playing;
      this.pause();
      bar.setPointerCapture(e.pointerId);
      bar.classList.add("dragging");
      seekTo(e.clientX);
    });
    const timeAt = (clientX: number) => {
      const r = this.$(".track").getBoundingClientRect();
      return fraction(clientX - r.left, r.width) * this.duration;
    };
    bar.addEventListener("pointermove", (e) => {
      if (bar.hasPointerCapture(e.pointerId)) seekTo(e.clientX);
      // Popup over the section under the pointer (mouse hover, or while dragging).
      if (e.pointerType === "mouse" || bar.hasPointerCapture(e.pointerId)) this.showTooltip(segmentAt(this.segs, timeAt(e.clientX)));
    });
    bar.addEventListener("pointerleave", (e) => {
      if (!bar.hasPointerCapture(e.pointerId) && this.shadowRoot?.activeElement !== bar) this.showTooltip(-1);
    });
    bar.addEventListener("focus", () => this.showTooltip(segmentAt(this.segs, this.currentTime)));
    bar.addEventListener("blur", () => this.showTooltip(-1));
    this.addEventListener("segmentchange", (e) => {
      if (this.shadowRoot?.activeElement === bar || bar.classList.contains("dragging")) this.showTooltip((e as CustomEvent<{ index: number }>).detail.index);
    });
    const end = (e: PointerEvent) => {
      if (!bar.hasPointerCapture(e.pointerId)) return;
      bar.releasePointerCapture(e.pointerId);
      bar.classList.remove("dragging");
      // Touch: keep the popup a moment after lifting the finger.
      if (e.pointerType !== "mouse") this.showTooltip(segmentAt(this.segs, this.currentTime), 1500);
      if (resume) this.play();
    };
    // Section names under the bar: jump to the start of that section.
    this.$(".labels").addEventListener("click", (e) => {
      const i = Number((e.target as HTMLElement).closest<HTMLElement>(".label")?.dataset.segment);
      if (!Number.isFinite(i) || !this.segs[i]) return;
      this.pause();
      this.seek(this.segs[i].start);
    });
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }
}

/** Register the element (idempotent). */
export function defineCubePlayer(tag = "cube-player"): void {
  if (!customElements.get(tag)) customElements.define(tag, class extends CubePlayer {});
}

declare global {
  interface HTMLElementTagNameMap {
    "cube-player": CubePlayer;
  }
}
