/**
 * Tile and piece geometry for a skin — everything the renderer needs to
 * build one cubie, as cached three.js geometries. Pure construction, no
 * scene state: swap this module (or wrap it) to give a skin different solids.
 *
 * Per facelet POSITION, a tile's shape only depends on its piece kind and
 * where it sits (corner / edge / centre, which way the centre is), so tiles
 * are built per position and cached per distinct shape. Anything that must
 * follow a particular STICKER (logos, holes, charging ports) is an
 * attachment — see attachments.ts.
 */

import { BufferGeometry, Float32BufferAttribute, Shape, ShapeGeometry, ShapeUtils, Vector2 } from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { type Skin, type StickerShape, roundedOutline, stickerLayout, stickerlessOutline } from "@cubecore/skin";
import { type Mitre, type TileSolid, skirtSolid, tileSolid } from "../tile";

export interface TileKit {
  /** Tile side (cubie units). */
  side: number;
  /** Height of a tile's top above the cubie face. */
  thickness: number;
  /** Distance from a cubie's centre to the plane its tiles sit on. */
  faceOffset: number;
  /** The cubie body (a rounded box, or the small core when pieces are shaped). */
  body: BufferGeometry;
  /** The tile at facelet position `fi`, in its face's local frame (x = a, y = b, z = outward). */
  tile(fi: number): BufferGeometry;
  /** The piece's plastic under that tile (`skin.pieces`), or null. */
  skirt(fi: number): BufferGeometry | null;
  /** The flat floating "back" sticker for position `fi`. */
  hint(fi: number): BufferGeometry;
  dispose(): void;
}

export function tileKit(skin: Skin): TileKit {
  const size = skin.cubieSize;
  const inset = skin.bodyInset ?? 0;
  const side = skin.stickers.size * size;
  const thickness = skin.stickers.thickness ?? 0;
  const bevel = Math.min(skin.stickers.bevel ?? 0, thickness);
  const faceOffset = size / 2 + 0.002;
  const edge = faceOffset;
  const shape: StickerShape = skin.stickers.shape ?? {
    corner: { inner: skin.stickers.radius, outer: skin.stickers.radius },
    edge: { inner: skin.stickers.radius, outer: skin.stickers.radius },
    center: skin.stickers.radius,
  };

  // With shaped pieces the box is only the hidden core; the visible plastic is the skirts under the tiles.
  const bodySize = skin.pieces ? skin.pieces.core * size : size - 2 * inset;
  const body = new RoundedBoxGeometry(bodySize, bodySize, bodySize, 3, Math.min(skin.cubieRadius * size, bodySize / 2));

  const outlineFor = (fi: number) => {
    const layout = stickerLayout(fi, shape);
    const path = skin.stickers.paths?.[layout.kind];
    const fill = !path && skin.stickers.fillOuter === true;
    const outline = path ? pathOutline(path, side, layout.pathQuarters) : fill ? stickerlessOutline(layout, side, edge) : roundedOutline(side, layout.radii);
    const mitre: Mitre | null = fill ? { u: layout.u, v: layout.v, edge, ramp: Math.max(thickness * 4, 0.03) } : null;
    const key = path ? `p|${layout.kind}|${layout.pathQuarters}` : `r|${layout.radii.join(",")}|${fill ? `${layout.u},${layout.v}` : ""}`;
    return { outline, mitre, key, layout };
  };

  const cache = new Map<string, BufferGeometry>();
  const cached = (key: string, make: () => BufferGeometry) => {
    let g = cache.get(key);
    if (!g) cache.set(key, (g = make()));
    return g;
  };

  return {
    side,
    thickness,
    faceOffset,
    body,
    tile(fi) {
      const { outline, mitre, key } = outlineFor(fi);
      return cached(`tile|${key}`, () =>
        thickness > 0
          ? solidToGeometry(tileSolid(outline, { thickness, bevel, segments: 4, sink: inset + 0.002, edgeRadius: skin.stickers.edgeRadius ?? 0 }, mitre))
          : new ShapeGeometry(new Shape(outline.map(([x, y]) => new Vector2(x, y)))),
      );
    },
    skirt(fi) {
      const pieces = skin.pieces;
      if (!pieces) return null;
      const { outline, mitre, key } = outlineFor(fi);
      return cached(`skirt|${key}`, () => solidToGeometry(skirtSolid(outline, { top: inset + 0.002, depth: pieces.depth, taper: pieces.taper }, mitre)));
    },
    hint(fi) {
      const { layout } = outlineFor(fi);
      return cached(`hint|${layout.radii.join(",")}`, () => new ShapeGeometry(new Shape(roundedOutline(side * 0.92, layout.radii).map(([x, y]) => new Vector2(x, y)))));
    },
    dispose() {
      body.dispose();
      for (const g of cache.values()) g.dispose();
      cache.clear();
    },
  };
}

/** three.js geometry of a swept solid (see tile.ts): sides plus a triangulated flat top, if any. */
export function solidToGeometry(solid: TileSolid): BufferGeometry {
  const cap = solid.topRing.length ? ShapeUtils.triangulateShape(solid.topRing.map(([x, y]) => new Vector2(x, y)), []) : [];
  const index = [...solid.sides];
  for (const [a, b, c] of cap) index.push(solid.topStart + a, solid.topStart + b, solid.topStart + c);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(solid.positions, 3));
  g.setAttribute("normal", new Float32BufferAttribute(solid.normals, 3));
  g.setIndex(index);
  g.computeBoundingSphere();
  return g;
}

/** Outline of a custom SVG path (0..1 box, y down) scaled to `side`, rotated by `quarters` CCW, centred. */
function pathOutline(d: string, side: number, quarters: number): [number, number][] {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg"><path d="${d}"/></svg>`);
  const shape = SVGLoader.createShapes(data.paths[0])[0];
  if (!shape) throw new Error("Sticker path has no closed shape");
  const pts = shape.getPoints(8).map((p) => [(p.x - 0.5) * side, (0.5 - p.y) * side] as [number, number]);
  const c = Math.cos((quarters * Math.PI) / 2), s = Math.sin((quarters * Math.PI) / 2);
  const rotated = pts.map(([x, y]) => [Math.round((x * c - y * s) * 1e6) / 1e6, Math.round((x * s + y * c) * 1e6) / 1e6] as [number, number]);
  // Keep the outline counter-clockwise (y flip reversed SVG's winding).
  let area = 0;
  for (let i = 0; i < rotated.length; i++) {
    const [x1, y1] = rotated[i], [x2, y2] = rotated[(i + 1) % rotated.length];
    area += x1 * y2 - x2 * y1;
  }
  return area < 0 ? rotated.reverse() : rotated;
}

