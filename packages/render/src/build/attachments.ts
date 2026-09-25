/**
 * Attachments in 3D — decals and features (see @cubecore/skin
 * attachments.ts) as three.js objects that ride on their STICKER.
 *
 * Tiles are built per position and only recoloured as the state changes, so
 * each frame an attachment is re-parented onto the tile mesh where its
 * sticker currently is, and turned by that sticker's in-plane turn (core
 * `stickerTurn`: centre spins, piece orientation). Being a child of the tile
 * it moves with layer animations and hides with the tile.
 */

import * as THREE from "three";
import { type CenterSpins, type Mask, type State, maskStateAt, stickerTurn } from "@cubecore/core";
import { type PieceKind, type Skin, featureDef, imageUrl, kindOfSticker, selectedStickers } from "@cubecore/skin";

export interface Attachment {
  /** Home facelet index of the sticker it belongs to. */
  sticker: number;
  /** Pivot in tile-local coordinates (z = 0 on the tile top); rotated by the sticker's turn. */
  object: THREE.Group;
  /** Hidden while the sticker isn't shown in full colour. */
  onlyRegular: boolean;
  /** Height of its tile's top (the tile thickness of its piece kind). */
  lift: number;
}

export interface AttachmentSet {
  items: Attachment[];
  dispose(): void;
}

/** Build every decal and feature of `skin`, one object per selected sticker. `onLoad` fires as images arrive. */
export function buildAttachments(skin: Skin, kit: { sideOf(kind: PieceKind): number; thicknessOf(kind: PieceKind): number }, onLoad: () => void): AttachmentSet {
  const items: Attachment[] = [];
  const textures = new Map<string, THREE.Texture>();
  const disposables: { dispose(): void }[] = [];
  const pivot = (sticker: number, onlyRegular: boolean) => {
    const object = new THREE.Group();
    items.push({ sticker, object, onlyRegular, lift: kit.thicknessOf(kindOfSticker(sticker)) });
    return object;
  };
  // A sticker is always on the same kind of piece, so its tile size is known up front.
  const planes = new Map<string, THREE.PlaneGeometry>();

  for (const decal of skin.decals ?? []) {
    const url = imageUrl(decal.image);
    let texture = textures.get(url);
    if (!texture) {
      texture = new THREE.TextureLoader().load(url, onLoad);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      textures.set(url, texture);
    }
    const multiply = decal.blend === "multiply";
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: multiply ? THREE.MultiplyBlending : THREE.NormalBlending,
      premultipliedAlpha: multiply,
    });
    disposables.push(material);
    const [ox, oy] = decal.offset ?? [0, 0];
    for (const sticker of selectedStickers(decal.select)) {
      const side = kit.sideOf(kindOfSticker(sticker));
      const key = `${side * decal.size}`;
      let plane = planes.get(key);
      if (!plane) {
        planes.set(key, (plane = new THREE.PlaneGeometry(side * decal.size, side * decal.size)));
        disposables.push(plane);
      }
      const mesh = new THREE.Mesh(plane, material);
      mesh.position.set((ox * side) / 2, (oy * side) / 2, 0.0015);
      mesh.rotation.z = ((decal.rotate ?? 0) * Math.PI) / 2;
      mesh.renderOrder = 2;
      pivot(sticker, decal.onlyRegular ?? true).add(mesh);
    }
  }

  for (const use of skin.features ?? []) {
    const def = featureDef(use.type);
    if (!def?.build3d) continue; // unknown type or 2D-only: nothing to draw here
    for (const sticker of selectedStickers(use.select)) {
      const kind = kindOfSticker(sticker);
      pivot(sticker, false).add(def.build3d({ three: THREE, side: kit.sideOf(kind), thickness: kit.thicknessOf(kind), params: use.params ?? {} }));
    }
  }

  return {
    items,
    dispose() {
      for (const t of textures.values()) t.dispose();
      for (const d of disposables) d.dispose();
    },
  };
}

/** Put each attachment on the tile where its sticker is now, turned with the sticker. */
/** `surface`: one height for every tile (glTF models), or null for each tile's own thickness. */
export function placeAttachments(set: AttachmentSet, state: State, spins: CenterSpins, tiles: readonly THREE.Object3D[], surface: number | null, mask: Mask | null): void {
  for (const a of set.items) {
    const pos = state.indexOf(a.sticker);
    const tile = tiles[pos];
    if (!tile) continue;
    if (a.object.parent !== tile) tile.add(a.object);
    a.object.position.set(0, 0, surface ?? a.lift);
    a.object.rotation.set(0, 0, (stickerTurn(state, a.sticker, spins) * Math.PI) / 2);
    a.object.visible = !a.onlyRegular || !mask || maskStateAt(mask, state, pos) === "regular";
  }
}
