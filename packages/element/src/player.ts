/**
 * <cube-player> — a cube that plays an algorithm or a recorded solve, with
 * optional controls and progress bar. Three levels of customisation:
 *
 *   1. use it as is:           <cube-player alg="R U R' U'" progress></cube-player>
 *   2. restyle it:             CSS variables (--cc-accent…) and ::part(button-play)… — see styles.ts
 *   3. bring your own controls: <cube-player controls="none"> or a child with slot="controls",
 *                               driven by play() / pause() / seek() / stepForward()… and events.
 *
 * Attributes: alg, setup, tempo (moves per second, default 2), skin (preset
 * name), back-view, controls ("default" | "none"), progress (show the bar),
 * markers (show stage markers on it).
 * Properties: recording (a timed solve — plays in real time), alg, setup,
 * skin, mask, method (stage markers from it), markers, speeds, rate,
 * currentTime, duration, playing, renderer.
 * Events: timeupdate {time, duration, applied}, play, pause, ended.
 *
 * Live: `attach(session)` follows a smart cube (a @cubecore/bluetooth
 * SmartCubeSession, or anything with the same events) — its moves animate,
 * resyncs jump, the gyro turns the cube; replay controls hide (`live`
 * attribute). `detach()` goes back to playback.
 */

/** What `attach` needs — SmartCubeSession fits; so does anything shaped like it. */
export interface LiveSource {
  readonly state: State;
  on(type: "move", listener: (e: { move: Move }) => void): () => void;
  on(type: "state", listener: (e: { state: State; reason: string }) => void): () => void;
  on(type: "orientation", listener: (q: { x: number; y: number; z: number; w: number }) => void): () => void;
}

import { type Mask, type Method, type Move, type State, applyMoves, parseAlg, solvedState, spinsAfter } from "@cubecore/core";
import { type BackView, CubeRenderer, showPosition } from "@cubecore/render";
import { SKINS, type Skin } from "@cubecore/skin";
import { type Position, type Recording, ReplayClock } from "@cubecore/timeline";
import { type Marker, formatTime, fraction, stageMarkers, stepTime, tempoRecording } from "./model";
import { ICONS, STYLES } from "./styles";

const TEMPLATE = `
<style>${STYLES}</style>
<div class="stage" part="stage"></div>
<div class="progress" part="progress" role="slider" tabindex="0" aria-label="Position" aria-valuemin="0">
  <div class="track" part="progress-track">
    <div class="fill" part="progress-fill"></div>
    <div class="markers"></div>
    <div class="thumb" part="progress-thumb"></div>
  </div>
</div>
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

export class CubePlayer extends HTMLElement {
  static observedAttributes = ["alg", "setup", "tempo", "skin", "back-view"];

  private readonly root: ShadowRoot;
  private _renderer: CubeRenderer | null = null;
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
      this._renderer = new CubeRenderer(this.$(".stage"), { skin: this.resolveSkin() });
      const bv = this.getAttribute("back-view") as BackView | null;
      if (bv) this._renderer.setBackView(bv);
      if (this._mask) this._renderer.setMask(this._mask);
    }
    this.load();
  }

  disconnectedCallback(): void {
    this.clock?.pause();
    this.unsubscribe?.();
    this._renderer?.dispose();
    this._renderer = null;
  }

  attributeChangedCallback(name: string): void {
    if (!this._renderer) return;
    if (name === "skin") this._renderer.setSkin(this.resolveSkin());
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
    }
  }

  get mask(): Mask | null {
    return this._mask;
  }
  set mask(m: Mask | null) {
    this._mask = m;
    this._renderer?.setMask(m);
  }

  /** Stage markers come from this method's analysis of the recording (colour neutral). */
  get method(): Method | null {
    return this._method;
  }
  set method(m: Method | null) {
    this._method = m;
    this.renderMarkers();
  }

  /** Explicit markers (override `method`). */
  get markers(): Marker[] | null {
    return this._markers;
  }
  set markers(m: Marker[] | null) {
    this._markers = m;
    this.renderMarkers();
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
  attach(source: LiveSource, options: { gyro?: boolean; gyroSmoothing?: number } = {}): () => void {
    this.detach();
    this.pause();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.setAttribute("live", "");
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
    return (name && SKINS[name]) || SKINS.standard;
  }

  private load(): void {
    if (!this._renderer || this.liveOff) return;
    const wasPlaying = this.playing;
    this.clock?.pause();
    this.unsubscribe?.();
    let maxAnimMs = 150;
    if (this._recording) {
      this.rec = this._recording;
    } else {
      const tempo = Number(this.getAttribute("tempo") ?? 2) || 2;
      const t = tempoRecording(this.alg, tempo);
      this.rec = t.recording;
      maxAnimMs = t.interval * 0.8;
    }
    this.startMoves = this._setupState ? [] : [...parseAlg(this.setup), ...this.rec.scramble];
    this.start = this._setupState ?? applyMoves(solvedState(), this.startMoves);
    this.clock = new ReplayClock(this.rec, { maxAnimMs });
    this.clock.rate = this._rate;
    this.unsubscribe = this.clock.onChange((time, pos) => this.onTime(time, pos));
    this.renderMarkers();
    this.clock.seek(0);
    if (wasPlaying) this.play();
  }

  private onTime(time: number, pos: Position): void {
    if (this._renderer) showPosition(this._renderer, this.start, this.rec.moves.map((m) => m.move), pos, spinsAfter(solvedState(), this.startMoves));
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

  private updateUi(time: number): void {
    const f = fraction(time, this.duration);
    this.$(".fill").style.width = `${f * 100}%`;
    this.$(".thumb").style.left = `${f * 100}%`;
    const progress = this.$(".progress");
    progress.setAttribute("aria-valuemax", String(Math.round(this.duration)));
    progress.setAttribute("aria-valuenow", String(Math.round(time)));
    progress.setAttribute("aria-valuetext", `${formatTime(time)} of ${formatTime(this.duration)}`);
    this.$(".time").textContent = `${formatTime(time)} / ${formatTime(this.duration)}`;
    const play = this.$<HTMLButtonElement>(".play");
    play.innerHTML = this.playing ? ICONS.pause : ICONS.play;
    play.setAttribute("aria-label", this.playing ? "Pause" : "Play");
    const atStart = time <= 0, atEnd = time >= this.duration;
    this.$<HTMLButtonElement>(".start").disabled = atStart;
    this.$<HTMLButtonElement>(".back").disabled = atStart;
    this.$<HTMLButtonElement>(".forward").disabled = atEnd;
    this.$<HTMLButtonElement>(".end").disabled = atEnd;
  }

  private renderMarkers(): void {
    const box = this.$(".markers");
    const marks = this._markers ?? (this._method && this.rec.moves.length ? stageMarkers(this._method, this.rec) : []);
    box.innerHTML = "";
    for (const m of marks) {
      const el = document.createElement("div");
      el.className = "marker";
      el.setAttribute("part", "progress-marker");
      el.title = `${m.label} · ${formatTime(m.time)}`;
      el.style.left = `${fraction(m.time, this.duration) * 100}%`;
      box.appendChild(el);
    }
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
    bar.addEventListener("pointermove", (e) => {
      if (bar.hasPointerCapture(e.pointerId)) seekTo(e.clientX);
    });
    const end = (e: PointerEvent) => {
      if (!bar.hasPointerCapture(e.pointerId)) return;
      bar.releasePointerCapture(e.pointerId);
      bar.classList.remove("dragging");
      if (resume) this.play();
    };
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
