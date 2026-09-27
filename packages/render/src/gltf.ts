/**
 * glTF templates of a skin's pieces — the built-in geometry written out in
 * the piece-model convention (pieceModels.ts), as a starting point for model
 * authors (open in Blender, reshape, export as GLB) and as ready-made
 * models. Materials: `body` and `sticker-U` / `sticker-F` / `sticker-R`.
 */

import { BufferGeometry, Matrix4, Vector3 } from "three";
import { FACELETS, FACE_BASIS, type Face, faceletAt, FACE_NORMAL } from "@cubecore/core";
import type { Skin } from "@cubecore/skin";
import { tileKit } from "./build/tiles";
import { CANONICAL, type ModelKind } from "./pieceModels";

interface Part {
  geometry: BufferGeometry;
  matrix: Matrix4;
  material: string;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const hexToLinear = (hex: string): [number, number, number] => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as [number, number, number];
};

/** A minimal glTF 2.0 document (embedded buffer) with one node per part. */
function writeGltf(parts: Part[], materials: Record<string, { color: string; roughness: number }>): string {
  const chunks: Uint8Array[] = [];
  let offset = 0;
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const push = (data: Float32Array | Uint32Array, target: number) => {
    const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    const pad = (4 - (offset % 4)) % 4;
    if (pad) {
      chunks.push(new Uint8Array(pad));
      offset += pad;
    }
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
    chunks.push(bytes);
    offset += bytes.length;
    return bufferViews.length - 1;
  };
  const materialNames = Object.keys(materials);
  const meshes = parts.map((p) => {
    const pos = p.geometry.getAttribute("position").array as Float32Array;
    const nor = p.geometry.getAttribute("normal").array as Float32Array;
    const index = p.geometry.getIndex()?.array ?? Uint32Array.from({ length: pos.length / 3 }, (_, i) => i);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], pos[i + k]);
      max[k] = Math.max(max[k], pos[i + k]);
    }
    const count = pos.length / 3;
    accessors.push({ bufferView: push(Float32Array.from(pos), 34962), componentType: 5126, count, type: "VEC3", min, max });
    const posAcc = accessors.length - 1;
    accessors.push({ bufferView: push(Float32Array.from(nor), 34962), componentType: 5126, count, type: "VEC3" });
    const norAcc = accessors.length - 1;
    accessors.push({ bufferView: push(Uint32Array.from(index), 34963), componentType: 5125, count: index.length, type: "SCALAR" });
    return { primitives: [{ attributes: { POSITION: posAcc, NORMAL: norAcc }, indices: accessors.length - 1, material: materialNames.indexOf(p.material) }] };
  });
  const buffer = new Uint8Array(offset);
  let at = 0;
  for (const c of chunks) {
    buffer.set(c, at);
    at += c.length;
  }
  return JSON.stringify({
    asset: { version: "2.0", generator: "cubecore piece templates" },
    scene: 0,
    scenes: [{ nodes: parts.map((_, i) => i) }],
    nodes: parts.map((p, i) => ({ mesh: i, matrix: p.matrix.elements.map((v) => Math.round(v * 1e6) / 1e6 + 0) })),
    meshes,
    materials: materialNames.map((name) => ({
      name,
      pbrMetallicRoughness: { baseColorFactor: [...hexToLinear(materials[name].color), 1], metallicFactor: 0, roughnessFactor: materials[name].roughness },
    })),
    accessors,
    bufferViews,
    buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${toBase64(buffer)}` }],
  });
}

/** The skin's corner, edge and centre as .gltf documents (JSON strings) in the piece-model convention. */
export function pieceTemplates(skin: Skin): Record<ModelKind, string> {
  const kit = tileKit(skin);
  const roughness = skin.stickers.roughness ?? 0.4;
  const colors = skin.stickers.colors;
  const out = {} as Record<ModelKind, string>;
  for (const kind of ["corner", "edge", "center"] as ModelKind[]) {
    const { pos, faces } = CANONICAL[kind];
    const parts: Part[] = [{ geometry: kit.body, matrix: new Matrix4(), material: "body" }];
    for (const face of faces) {
      const fi = faceletAt(pos, FACE_NORMAL[face]);
      const f = FACELETS[fi];
      const { a, b, n } = FACE_BASIS[f.face];
      const m = new Matrix4().makeBasis(new Vector3(...a), new Vector3(...b), new Vector3(...n));
      m.setPosition(new Vector3(...f.pos).sub(new Vector3(...pos)).addScaledVector(new Vector3(...n), kit.faceOffset));
      parts.push({ geometry: kit.tile(fi), matrix: m, material: `sticker-${face}` });
      const skirt = kit.skirt(fi);
      if (skirt) parts.push({ geometry: skirt, matrix: m.clone(), material: "body" });
    }
    const mats: Record<string, { color: string; roughness: number }> = { body: { color: skin.body, roughness: 0.85 } };
    for (const face of faces) mats[`sticker-${face}`] = { color: colors["URFDLB".indexOf(face as Face)], roughness };
    out[kind] = writeGltf(parts, mats);
  }
  kit.dispose();
  return out;
}
