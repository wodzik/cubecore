/**
 * <cube-scramble> — shows a scramble (or an algorithm) and follows it on a
 * smart cube: done moves fade, the next one is highlighted, half of a half
 * turn shows as partial, and after a slip it shows what to undo.
 *
 *   const el = document.querySelector("cube-scramble");
 *   el.scramble = "R U2 F' …";
 *   el.attach(session);            // a @cubecore/bluetooth SmartCubeSession (or anything with state + "move" events)
 *   el.addEventListener("complete", startInspection);
 *
 * What happens when it's done (inspection, timer…) is the app's call — the
 * element only reports `progress` and `complete`.
 *
 * Styling: CSS variables --cc-scramble-font, --cc-scramble-size,
 * --cc-scramble-gap, --cc-done, --cc-current, --cc-current-bg, --cc-partial,
 * --cc-todo, --cc-undo; parts moves, move, move-done, move-current,
 * move-partial, move-todo, undo, undo-label, undo-move, message.
 * Text: the `messages` property (e.g. translations).
 */

import { type Move, type SequenceProgress, SequenceTracker, type State, formatMove, parseAlg, solvedState } from "@cubecore/core";
import { ElementBase } from "./base";

const STYLES = /* css */ `
:host {
  --cc-scramble-font: ui-monospace, "SF Mono", Menlo, monospace;
  --cc-scramble-size: 22px;
  --cc-scramble-gap: 0.35em;
  --cc-done: color-mix(in srgb, currentColor 35%, transparent);
  --cc-current: currentColor;
  --cc-current-bg: color-mix(in srgb, #4f8cff 22%, transparent);
  --cc-partial: #4f8cff;
  --cc-todo: color-mix(in srgb, currentColor 80%, transparent);
  --cc-undo: #ff8a4c;
  display: block;
  font: 600 var(--cc-scramble-size) / 1.5 var(--cc-scramble-font);
}
.moves { display: flex; flex-wrap: wrap; gap: 0.1em var(--cc-scramble-gap); }
.move { padding: 0 0.18em; border-radius: 0.25em; transition: color 0.15s ease, background 0.15s ease; }
.done { color: var(--cc-done); }
.current { color: var(--cc-current); background: var(--cc-current-bg); }
.partial { color: var(--cc-partial); background: var(--cc-current-bg); }
.todo { color: var(--cc-todo); }
.undo { display: none; margin-top: 0.4em; color: var(--cc-undo); gap: var(--cc-scramble-gap); flex-wrap: wrap; align-items: baseline; }
.undo.on { display: flex; }
.undo-label { font: 600 0.6em/1 system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 0.3em; }
.message { display: none; margin-top: 0.4em; font: 500 0.6em/1.4 system-ui, sans-serif; opacity: 0.8; }
.message.on { display: block; }
`;

export interface ScrambleMessages {
  undo: string;
  reset: string;
  complete: string;
}

/** What `attach` needs: the cube's current state and its moves. */
export interface MoveSource {
  readonly state: State;
  on(type: "move", listener: (e: { move: Move }) => void): () => void;
}

export class CubeScramble extends ElementBase {
  private readonly root: ShadowRoot;
  private tracker: SequenceTracker | null = null;
  private _moves: Move[] = [];
  private source: MoveSource | null = null;
  private off: (() => void) | null = null;
  private _messages: ScrambleMessages = { undo: "Undo", reset: "Too far off — solve the cube and start again", complete: "" };

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style>
      <div class="moves" part="moves"></div>
      <div class="undo" part="undo"><span class="undo-label" part="undo-label"></span><span class="undo-moves"></span></div>
      <div class="message" part="message" role="status"></div>`;
  }

  /** The scramble / algorithm to show and follow (written notation or moves). */
  get scramble(): string {
    return this._moves.map(formatMove).join(" ");
  }
  set scramble(v: string | readonly Move[]) {
    this._moves = typeof v === "string" ? parseAlg(v) : [...v];
    this.reset();
  }

  get messages(): ScrambleMessages {
    return { ...this._messages };
  }
  set messages(m: Partial<ScrambleMessages>) {
    this._messages = { ...this._messages, ...m };
    this.render();
  }

  get progress(): SequenceProgress | null {
    return this.tracker?.progress ?? null;
  }

  /** Follow a smart cube from its current state. Returns detach. */
  attach(source: MoveSource): () => void {
    this.detach();
    this.source = source;
    this.off = source.on("move", (e) => this.push(e.move));
    this.reset();
    return () => this.detach();
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.source = null;
  }

  /** Start following again from `start` (default: the attached cube's state, else solved). */
  reset(start?: State): void {
    this.tracker = new SequenceTracker(this._moves, start ?? this.source?.state ?? solvedState());
    this.render();
    this.dispatchEvent(new CustomEvent("progress", { detail: this.tracker.progress }));
  }

  /** A face turn from the cube (called for you when attached). */
  push(move: Move): void {
    if (!this.tracker) return;
    const wasComplete = this.tracker.progress.complete;
    const p = this.tracker.push(move);
    this.render();
    this.dispatchEvent(new CustomEvent("progress", { detail: p }));
    if (p.complete && !wasComplete) this.dispatchEvent(new CustomEvent("complete", { detail: p }));
  }

  private render(): void {
    const p = this.tracker?.progress;
    const moves = this.root.querySelector(".moves")!;
    moves.innerHTML = this._moves
      .map((m, i) => {
        const status = p?.tokens[i] ?? "todo";
        return `<span class="move ${status}" part="move move-${status}">${formatMove(m)}</span>`;
      })
      .join("");
    const undo = this.root.querySelector(".undo")!;
    const showUndo = !!p && p.undo.length > 0 && !p.needsReset;
    undo.classList.toggle("on", showUndo);
    this.root.querySelector(".undo-label")!.textContent = this._messages.undo;
    this.root.querySelector(".undo-moves")!.innerHTML = showUndo ? p!.undo.map((m) => `<span class="move" part="undo-move">${formatMove(m)}</span>`).join(" ") : "";
    const message = this.root.querySelector(".message")!;
    const text = p?.needsReset ? this._messages.reset : p?.complete ? this._messages.complete : "";
    message.textContent = text;
    message.classList.toggle("on", !!text);
  }
}

/** Register the element (idempotent). */
export function defineCubeScramble(tag = "cube-scramble"): void {
  if (!customElements.get(tag)) customElements.define(tag, class extends CubeScramble {});
}

declare global {
  interface HTMLElementTagNameMap {
    "cube-scramble": CubeScramble;
  }
}
