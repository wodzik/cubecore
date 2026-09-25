/**
 * <cube-bld> — blindfolded (Old Pochmann) memo and execution on a smart cube.
 *
 *   el.attach(session);          // memo of the cube as it is now; then follows the execution
 *   el.scheme = "speffz";        // or "ruwix" (default), or a LetterScheme
 *   el.setAttribute("rotation", "x2 y'");   // how you hold it (yellow top, orange front…)
 *
 * Shows the letters in pairs, edges then (parity) then corners; the letter
 * due is highlighted, done ones fade. A swap with another letter than the
 * one due is called out. reveal="all" (default) / "done" / "none" hides the
 * letters still to do (memo practice).
 *
 * Customising like the other elements: --cc-seq-* variables and --cc-accent,
 * parts (edges, corners, label, letters, pair, letter, letter-done /
 * -current / -todo / -hidden, parity, message, controls, button), slot
 * "controls" (default: Show / Hide, Restart), `headless` (build your own
 * from the `progress` event).
 *
 * Events: progress (detail: BldProgress + memo), letter (a letter done:
 * { step, index }), wrong ({ expected, got }), complete.
 */

import { BldTracker, type BldProgress, type LetterScheme, SCHEMES, formatMemo } from "@cubecore/bld";
import { type Move, type State, solvedState } from "@cubecore/core";
import { ElementBase } from "./base";
import { type MoveSource, SEQUENCE_STYLES, escapeHtml } from "./sequence";

export interface BldMessages {
  edges: string;
  corners: string;
  parity: string;
  wrong: string;
  complete: string;
  show: string;
  hide: string;
  restart: string;
}

const STYLES = /* css */ `
.rows { display: flex; flex-direction: column; gap: 0.35em; }
.row { display: flex; align-items: baseline; gap: 0.6em; flex-wrap: wrap; }
.label { font: 600 11px/1 system-ui, sans-serif; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.7; min-width: 5.5em; }
.letters { display: flex; flex-wrap: wrap; gap: 0.1em var(--cc-seq-gap); font: 600 var(--cc-seq-size) / 1.5 var(--cc-seq-font); }
.pair { display: inline-flex; }
.letter { padding: 0 0.12em; border-radius: 0.25em; transition: color 0.15s ease, background 0.15s ease; }
.none { opacity: 0.5; font: 500 13px system-ui, sans-serif; }
.parity { font: 600 12px/1 system-ui, sans-serif; padding: 0.3em 0.55em; border-radius: 999px; background: var(--cc-control-bg); }
.message.wrong { color: var(--cc-seq-undo); }
`;

export class CubeBld extends ElementBase {
  static observedAttributes = ["reveal", "rotation", "scheme"];
  private readonly root: ShadowRoot;
  private source: MoveSource | null = null;
  private off: (() => void) | null = null;
  private tracker: BldTracker | null = null;
  private _scheme: LetterScheme = SCHEMES.ruwix;
  private shownAll = false;
  private lastDone = 0;
  private completed = false;
  private _messages: BldMessages = {
    edges: "Edges",
    corners: "Corners",
    parity: "Parity",
    wrong: "Swapped with {got} instead of {expected} — undo it",
    complete: "All letters done",
    show: "Show",
    hide: "Hide",
    restart: "Restart",
  };

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${SEQUENCE_STYLES}${STYLES}</style>
      <div class="container" part="container">
        <div class="rows"></div>
        <slot name="message"><div class="message" part="message" role="status"></div></slot>
        <slot name="controls"><div class="controls" part="controls">
          <button part="button button-reveal" data-action="reveal" aria-pressed="false"></button>
          <button part="button button-restart" data-action="restart"></button>
        </div></slot>
      </div>`;
    this.root.addEventListener("click", (e) => {
      const action = (e.target as HTMLElement).closest<HTMLElement>("[data-action]")?.dataset.action;
      if (action === "reveal") this.toggleShown();
      else if (action === "restart") this.reset();
    });
    this.labelButtons();
  }

  attributeChangedCallback(name: string): void {
    if (name === "scheme") {
      const s = this.getAttribute("scheme") as keyof typeof SCHEMES | null;
      if (s && SCHEMES[s]) this._scheme = SCHEMES[s];
    }
    if (name === "scheme" || name === "rotation") this.reset();
    else this.update();
  }

  /** The letter scheme: "ruwix" (default), "speffz" or your own. */
  get scheme(): LetterScheme {
    return this._scheme;
  }
  set scheme(s: LetterScheme | keyof typeof SCHEMES) {
    this._scheme = typeof s === "string" ? SCHEMES[s] : s;
    this.reset();
  }

  get messages(): BldMessages {
    return { ...this._messages };
  }
  set messages(m: Partial<BldMessages>) {
    this._messages = { ...this._messages, ...m };
    this.labelButtons();
    this.update();
  }

  /** Memo and progress (null before anything is set). */
  get progress(): (BldProgress & { memo: BldTracker["memo"] }) | null {
    return this.tracker ? { ...this.tracker.progress, memo: this.tracker.memo } : null;
  }

  /** The memo as text, e.g. "Letters memorized for edges: QU SR NX…". */
  get memoText(): { edges: string; corners: string } | null {
    const m = this.tracker?.memo;
    return m ? { edges: formatMemo(m.edges), corners: formatMemo(m.corners) } : null;
  }

  /** Memo of the attached cube as it is now, then follow its moves. Returns detach. */
  attach(source: MoveSource): () => void {
    this.detach();
    this.source = source;
    this.off = source.on("move", (e) => this.push(e.move));
    this.reset(source.state);
    return () => this.detach();
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.source = null;
  }

  /** Memo again from `state` (default: the attached cube as it is now). */
  reset(state?: State): void {
    const start = state ?? this.source?.state ?? solvedState();
    this.tracker = new BldTracker(start, { scheme: this._scheme, rotation: this.getAttribute("rotation") ?? undefined });
    this.lastDone = 0;
    this.completed = false;
    this.update();
  }

  /** A face turn from the cube (called for you when attached). */
  push(move: Move): void {
    if (!this.tracker || this.completed) return;
    const p = this.tracker.push(move);
    for (let i = this.lastDone; i < p.done; i++) this.dispatchEvent(new CustomEvent("letter", { detail: { step: p.steps[i], index: i } }));
    this.lastDone = p.done;
    if (p.wrong) this.dispatchEvent(new CustomEvent("wrong", { detail: p.wrong }));
    this.update();
    if (p.complete) {
      this.completed = true;
      this.dispatchEvent(new CustomEvent("complete", { detail: this.progress }));
    }
  }

  /** Show every letter / back to the reveal mode. */
  toggleShown(): void {
    this.shownAll = !this.shownAll;
    this.labelButtons();
    this.update();
  }

  private visible(status: string): boolean {
    if (this.shownAll) return true;
    const r = this.getAttribute("reveal");
    return r === "none" ? false : r === "done" ? status === "done" : true;
  }

  private update(): void {
    const p = this.tracker?.progress;
    const rows = this.root.querySelector(".rows")!;
    if (!p) {
      rows.innerHTML = "";
      return;
    }
    const lettersOf = (kind: "edge" | "corner") => {
      const idx = p.steps.map((s, i) => (s.kind === kind ? i : -1)).filter((i) => i >= 0);
      if (!idx.length) return `<span class="none">—</span>`;
      const pairs: string[] = [];
      for (let j = 0; j < idx.length; j += 2) {
        const pair = idx.slice(j, j + 2).map((i) => {
          const st = p.status[i];
          const shown = this.visible(st);
          return `<span class="letter ${st}${shown ? "" : " hidden"}" part="letter letter-${st}${shown ? "" : " letter-hidden"}">${shown ? escapeHtml(p.steps[i].letter) : "•"}</span>`;
        });
        pairs.push(`<span class="pair" part="pair">${pair.join("")}</span>`);
      }
      return pairs.join("");
    };
    const parityIdx = p.steps.findIndex((s) => s.kind === "parity");
    const parity = parityIdx >= 0 ? `<span class="parity letter ${p.status[parityIdx]}" part="parity letter-${p.status[parityIdx]}">${escapeHtml(this._messages.parity)}</span>` : "";
    rows.innerHTML = `
      <div class="row" part="edges"><span class="label" part="label">${escapeHtml(this._messages.edges)}</span><span class="letters" part="letters">${lettersOf("edge")}</span>${parity}</div>
      <div class="row" part="corners"><span class="label" part="label">${escapeHtml(this._messages.corners)}</span><span class="letters" part="letters">${lettersOf("corner")}</span></div>`;
    const message = this.root.querySelector(".message");
    if (message) {
      const text = p.wrong
        ? this._messages.wrong.replace("{got}", p.wrong.got).replace("{expected}", p.wrong.expected)
        : p.complete ? this._messages.complete : "";
      message.textContent = text;
      message.classList.toggle("on", !!text);
      message.classList.toggle("wrong", !!p.wrong);
    }
    this.dispatchEvent(new CustomEvent("progress", { detail: this.progress }));
  }

  private labelButtons(): void {
    const reveal = this.root.querySelector<HTMLElement>('[data-action="reveal"]');
    if (reveal) {
      reveal.textContent = this.shownAll ? this._messages.hide : this._messages.show;
      reveal.setAttribute("aria-pressed", String(this.shownAll));
    }
    const restart = this.root.querySelector<HTMLElement>('[data-action="restart"]');
    if (restart) restart.textContent = this._messages.restart;
  }
}

export function defineCubeBld(tag = "cube-bld"): void {
  if (!customElements.get(tag)) customElements.define(tag, class extends CubeBld {});
}

declare global {
  interface HTMLElementTagNameMap {
    "cube-bld": CubeBld;
  }
}
