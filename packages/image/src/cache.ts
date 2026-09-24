/**
 * Caching SVG output. `svgKey` is a stable string for (state, options) — use it
 * as a key for an in-memory LRU, IndexedDB, localStorage, a CDN path or a
 * server-side file name. Rendering is deterministic, so equal keys mean equal
 * images.
 */

import type { Mask, State } from "@cubecore/core";
import { type SvgOptions, renderSvg } from "./svg";

const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

/** Short FNV-1a hash — keys stay short enough for file names and URLs. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

export function svgKey(state: State, options: SvgOptions = {}): string {
  const { mask, frame, skin, spins, ...rest } = options;
  const parts = [
    hex(state),
    mask ? hex(mask as Mask) : "",
    frame ? String(frame.id) : "0",
    skin ? JSON.stringify(skin) : "",
    spins && skin?.decals?.length ? hex(spins) : "",
    JSON.stringify(rest, Object.keys(rest).sort()),
  ];
  return `${options.view ?? "iso"}-${fnv(parts.join("|"))}-${fnv(parts.reverse().join("|"))}`;
}

/** Small LRU of rendered SVG strings. */
export class SvgCache {
  private map = new Map<string, string>();
  constructor(private readonly max = 500) {}

  get(state: State, options: SvgOptions = {}): string {
    const key = svgKey(state, options);
    const hit = this.map.get(key);
    if (hit !== undefined) {
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const svg = renderSvg(state, options);
    this.map.set(key, svg);
    if (this.map.size > this.max) this.map.delete(this.map.keys().next().value!);
    return svg;
  }

  get size() {
    return this.map.size;
  }
}

/** `data:` URL for an <img src>. */
export const svgDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/** Browser only: rasterise to a PNG Blob (uses an offscreen canvas). */
export async function svgToPngBlob(svg: string, width: number): Promise<Blob> {
  const img = new Image();
  img.src = svgDataUrl(svg);
  await img.decode();
  const height = Math.round((width * img.naturalHeight) / img.naturalWidth);
  const canvas = new OffscreenCanvas(width, height);
  canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
  return canvas.convertToBlob({ type: "image/png" });
}
