/**
 * Loading piece models (glTF / GLB) once per URL. The renderer draws the
 * built-in pieces until a model is ready, then rebuilds with it.
 */

import type { Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const pending = new Map<string, Promise<Object3D | null>>();
const ready = new Map<string, Object3D>();

/** The model at `url` if it has loaded (null while loading or after a failure). */
export const readyModel = (url: string | undefined): Object3D | null => (url ? (ready.get(url) ?? null) : null);

/** Load (once) and resolve with the model's scene, or null on failure (logged). */
export function loadModel(url: string): Promise<Object3D | null> {
  let p = pending.get(url);
  if (!p) {
    p = new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        ready.set(url, gltf.scene);
        return gltf.scene;
      })
      .catch((err) => {
        console.warn(`cubecore: could not load piece model ${url}`, err);
        return null;
      });
    pending.set(url, p);
  }
  return p;
}
