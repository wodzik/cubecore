/**
 * Still pictures of cubes from ONE WebGL renderer — for pages with many
 * cubes (a list of cases). Browsers keep only ~16 WebGL contexts, so a live
 * renderer per cube stops working past that; here a single hidden renderer
 * draws each picture in turn (the same 3D look, perspective and camera) and
 * hands back an image URL, cached by `key`.
 *
 *   const pictures = sharedPictures();
 *   img.src = pictures.draw({ state, mask, skin, camera: { latitude: 20, longitude: 25 } }, key);
 */

import type { Mask, State } from "@cubecore/core";
import { SKINS, type Skin, type Theme } from "@cubecore/skin";
import { type CameraOptions, CubeRenderer } from "./renderer";

export interface PictureOptions {
  state: State;
  mask?: Mask | null;
  skin?: Skin;
  theme?: Theme;
  camera?: Partial<CameraOptions>;
  /** Turn the whole cube (e.g. as held: white down) — see CubeRenderer.setOrientation. */
  orientation?: { x: number; y: number; z: number; w: number } | null;
}

export class CubePictures {
  private host: HTMLDivElement | null = null;
  private renderer: CubeRenderer | null = null;
  private skin: Skin | null = null;
  private theme: Theme | null = null;
  private readonly cache = new Map<string, string>();

  /** `size`: picture side in CSS px (drawn at the device pixel ratio, up to 2×). */
  constructor(private readonly size = 240, private readonly maxCached = 500) {}

  /** An image URL of the cube (a PNG data URL); same `key` → the cached one. */
  draw(options: PictureOptions, key?: string): string {
    if (key !== undefined) {
      const hit = this.cache.get(key);
      if (hit) return hit;
    }
    const r = this.ensure();
    const skin = options.skin ?? SKINS.default;
    if (skin !== this.skin) r.setSkin((this.skin = skin));
    const theme = options.theme ?? "dark";
    if (theme !== this.theme) r.setTheme((this.theme = theme));
    r.setCamera({ latitude: 30, longitude: 35, ...options.camera });
    r.setOrientation(options.orientation ?? null);
    r.setMask(options.mask ?? null);
    r.setState(options.state);
    const url = r.snapshot();
    if (key !== undefined) {
      if (this.cache.size >= this.maxCached) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, url);
    }
    return url;
  }

  /** Forget cached pictures (e.g. after the look changed). */
  clear(): void {
    this.cache.clear();
  }

  dispose(): void {
    this.renderer?.dispose();
    this.host?.remove();
    this.renderer = null;
    this.host = null;
    this.cache.clear();
  }

  private ensure(): CubeRenderer {
    if (this.renderer) return this.renderer;
    const host = document.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = `position:fixed;left:-10000px;top:0;width:${this.size}px;height:${this.size}px;pointer-events:none;`;
    document.body.append(host);
    this.host = host;
    this.renderer = new CubeRenderer(host, { dragToRotate: false });
    return this.renderer;
  }
}

let shared: CubePictures | null = null;
/** The page's shared picture renderer (one WebGL context for all of them). */
export function sharedPictures(): CubePictures {
  shared ??= new CubePictures();
  return shared;
}
