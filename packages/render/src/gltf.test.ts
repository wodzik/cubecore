import { describe, expect, it } from "bun:test";
import { ARCHIVED_SKINS } from "@cubecore/skin";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { pieceTemplates } from "./gltf";
import { stickerFaceOf } from "./pieceModels";

// three's FileLoader reports progress with ProgressEvent — a browser class Bun doesn't have.
(globalThis as { ProgressEvent?: unknown }).ProgressEvent ??= class extends Event {
  constructor(type: string, init: Record<string, unknown> = {}) {
    super(type);
    Object.assign(this, init);
  }
};

describe("glTF piece templates", () => {
  const t = pieceTemplates(ARCHIVED_SKINS.ganI4);

  it("one document per kind, with body and the kind's sticker materials", () => {
    const names = (k: keyof typeof t) => JSON.parse(t[k]).materials.map((m: { name: string }) => m.name).sort();
    expect(names("corner")).toEqual(["body", "sticker-F", "sticker-R", "sticker-U"]);
    expect(names("edge")).toEqual(["body", "sticker-F", "sticker-U"]);
    expect(names("center")).toEqual(["body", "sticker-U"]);
  });

  it("loads back with three.js GLTFLoader: sticker meshes are recognised", async () => {
    const gltf = await new GLTFLoader().parseAsync(t.corner, "");
    const faces: string[] = [];
    gltf.scene.traverse((o) => {
      const f = stickerFaceOf((o as { material?: { name?: string } }).material?.name);
      if (f) faces.push(f);
    });
    expect(faces.sort()).toEqual(["F", "R", "U"]);
  });
});
