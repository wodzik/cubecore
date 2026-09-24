/**
 * <cube-alg> — an algorithm as written, in sync with a <cube-player>: the
 * move playing now is highlighted, played ones fade, click a move to jump to
 * it. Comments, grouping and pauses stay as written (repeats and commutator
 * inverses light up the move they copy).
 *
 *   <cube-player id="p" alg="(R U R' U')3 // sexy × 3"></cube-player>
 *   <cube-alg for="p"></cube-alg>
 *
 * Text: its own `alg` attribute, else the player's `alg`, else the player's
 * moves (a recorded solve). Styling: --cc-alg-font, --cc-alg-size,
 * --cc-alg-done, --cc-alg-current, --cc-alg-current-bg, --cc-alg-comment;
 * parts alg, token, token-done, token-current, token-todo, comment.
 */

import { type AlgDocument, formatAlg, parseAlgDocument } from "@cubecore/core";
import type { CubePlayer } from "./player";

const STYLES = /* css */ `
:host {
  --cc-alg-font: ui-monospace, "SF Mono", Menlo, monospace;
  --cc-alg-size: 16px;
  --cc-alg-done: color-mix(in srgb, currentColor 40%, transparent);
  --cc-alg-current: currentColor;
  --cc-alg-current-bg: color-mix(in srgb, #4f8cff 25%, transparent);
  --cc-alg-comment: color-mix(in srgb, currentColor 50%, transparent);
  display: block;
  font: 500 var(--cc-alg-size) / 1.6 var(--cc-alg-font);
  white-space: pre-wrap;
}
.token { cursor: pointer; border-radius: 0.2em; padding: 0 0.08em; transition: color 0.12s, background 0.12s; }
.token:hover { background: color-mix(in srgb, currentColor 10%, transparent); }
.done { color: var(--cc-alg-done); }
.current { color: var(--cc-alg-current); background: var(--cc-alg-current-bg); font-weight: 700; }
.comment { color: var(--cc-alg-comment); font-style: italic; }
`;

export class CubeAlg extends HTMLElement {
  static observedAttributes = ["for", "alg"];
  private readonly root: ShadowRoot;
  private player: CubePlayer | null = null;
  private doc: AlgDocument | null = null;
  private text = "";
  /** Token index (by source start) of each move. */
  private tokenOf: number[] = [];
  private tokens: HTMLElement[] = [];
  private readonly onTime = (e: Event) => this.highlight((e as CustomEvent<{ applied: number }>).detail.applied);
  private readonly onLoad = () => this.render();

  constructor() {
    super();
    this.root = this.attachShadow({ mode: "open" });
    this.root.innerHTML = `<style>${STYLES}</style><div class="alg" part="alg"></div>`;
    this.root.addEventListener("click", (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>(".token");
      if (!t || !this.player) return;
      // Jump to just before the first move written there.
      const k = this.tokenOf.indexOf(Number(t.dataset.token));
      if (k >= 0) this.player.seekToMove(k);
    });
  }

  connectedCallback(): void {
    this.connect();
  }
  disconnectedCallback(): void {
    this.disconnect();
  }
  attributeChangedCallback(): void {
    if (this.isConnected) this.connect();
  }

  /** Follow this player (instead of `for`). */
  attach(player: CubePlayer): void {
    this.disconnect();
    this.player = player;
    player.addEventListener("timeupdate", this.onTime);
    player.addEventListener("load", this.onLoad);
    this.render();
  }

  private connect(): void {
    const id = this.getAttribute("for");
    const p = id ? (document.getElementById(id) as CubePlayer | null) : null;
    if (p) this.attach(p);
    else this.render();
  }

  private disconnect(): void {
    this.player?.removeEventListener("timeupdate", this.onTime);
    this.player?.removeEventListener("load", this.onLoad);
    this.player = null;
  }

  private render(): void {
    this.text = this.getAttribute("alg") ?? this.player?.getAttribute("alg") ?? (this.player ? formatAlg(this.player.moves) : "");
    const box = this.root.querySelector(".alg")!;
    box.innerHTML = "";
    this.tokens = [];
    try {
      this.doc = parseAlgDocument(this.text);
    } catch {
      box.textContent = this.text; // unparsable: plain text (the player reports the error)
      this.doc = null;
      return;
    }
    // Cut the text into plain runs, move tokens (one per written move) and comments.
    const starts = [...new Set(this.doc.sources.map((s) => s.start))].sort((a, b) => a - b);
    const spans = [
      ...starts.map((start) => ({ kind: "token" as const, start, end: this.doc!.sources.find((s) => s.start === start)!.end })),
      ...this.doc.comments.map((c) => ({ kind: "comment" as const, start: c.start, end: c.end })),
    ].sort((a, b) => a.start - b.start);
    let at = 0;
    for (const s of spans) {
      if (s.start > at) box.append(this.text.slice(at, s.start));
      const el = document.createElement("span");
      el.textContent = this.text.slice(s.start, s.end);
      if (s.kind === "token") {
        el.className = "token todo";
        el.dataset.token = String(s.start);
        el.setAttribute("part", "token token-todo");
        this.tokens.push(el);
      } else {
        el.className = "comment";
        el.setAttribute("part", "comment");
      }
      box.append(el);
      at = s.end;
    }
    if (at < this.text.length) box.append(this.text.slice(at));
    this.tokenOf = this.doc.sources.map((s) => s.start);
    this.highlight(this.player?.applied ?? 0);
  }

  /** Moves [0, applied) are done; move `applied` is next / playing. */
  private highlight(applied: number): void {
    const current = this.tokenOf[applied];
    const done = new Set(this.tokenOf.slice(0, applied));
    for (const el of this.tokens) {
      const t = Number(el.dataset.token);
      const status = t === current ? "current" : done.has(t) ? "done" : "todo";
      el.className = `token ${status}`;
      el.setAttribute("part", `token token-${status}`);
    }
  }
}

export function defineCubeAlg(tag = "cube-alg"): void {
  if (!customElements.get(tag)) customElements.define(tag, class extends CubeAlg {});
}

declare global {
  interface HTMLElementTagNameMap {
    "cube-alg": CubeAlg;
  }
}
