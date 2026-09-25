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
import { type PieceKind, type Skin, type StickerShape, reachEdge, roundedOutline, stickerLayout, stickerlessOutline, tileSize, tileThickness } from "@cubecore/skin";
import { type Mitre, type TileSolid, applyDome, densify, skirtSolid, tileSolid } from "../tile";

export interface TileKit {
  /** Tile side (cubie units) — the usual one; `sideOf` per piece kind. */
  side: number;
  /** Height of a tile's top above the cubie face — the usual one; `thicknessOf` per piece kind. */
  thickness: number;
  sideOf(kind: PieceKind): number;
  thicknessOf(kind: PieceKind): number;
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
  const sideOf = (kind: PieceKind) => tileSize(skin, kind) * size;
  const thicknessOf = (kind: PieceKind) => tileThickness(skin, kind);
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
    const fill = skin.stickers.fillOuter === true;
    const s = sideOf(layout.kind), t = thicknessOf(layout.kind);
    const outline = path
      ? fill
        ? reachEdge(pathOutline(path, s, layout.pathQuarters), layout, s / 2, edge)
        : pathOutline(path, s, layout.pathQuarters)
      : fill
        ? stickerlessOutline(layout, s, edge)
        : roundedOutline(s, layout.radii);
    const mitre: Mitre | null = fill ? { u: layout.u, v: layout.v, edge, ramp: Math.max(t * 4, 0.03) } : null;
    const key = (path ? `p|${layout.kind}|${layout.pathQuarters}` : `r|${layout.radii.join(",")}`) + `${fill ? `|${layout.u},${layout.v}` : ""}|${s}|${t}`;
    return { outline, mitre, key, layout, thickness: t, side: s };
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
    sideOf,
    thicknessOf,
    faceOffset,
    body,
    tile(fi) {
      const { outline, mitre, key, thickness: t, layout } = outlineFor(fi);
      const bevel = Math.min(skin.stickers.bevel ?? 0, t);
      const dome = skin.stickers.kinds?.[layout.kind]?.dome;
      // A domed tile reaches deeper, so its lowered corners stay above its bottom.
      const sink = inset + 0.002 + (dome ? dome.drop : 0);
      return cached(`tile|${key}|${dome ? `${dome.flat},${dome.drop}` : ""}`, () =>
        t > 0
          ? solidToGeometry(
              ((solid) => (dome ? applyDome(solid, dome, sink) : solid))(
                tileSolid(dome ? densify(outline) : outline, { thickness: t, bevel, segments: 4, sink, edgeRadius: skin.stickers.edgeRadius ?? 0 }, mitre),
              ),
            )
          : new ShapeGeometry(new Shape(outline.map(([x, y]) => new Vector2(x, y)))),
      );
    },
    skirt(fi) {
      const pieces = skin.pieces;
      if (!pieces) return null;
      const { outline, mitre, key } = outlineFor(fi);
      // Solid pieces: down to the cubie's centre. The walls lean in, so where two meet inside
      // the piece the one from the nearer tile is outermost — the colours split on the diagonals.
      const depth = pieces.fill === "solid" ? size / 2 : pieces.depth;
      return cached(`skirt|${key}|${depth}`, () => solidToGeometry(skirtSolid(outline, { top: inset + 0.002, depth, taper: pieces.taper }, mitre)));
    },
    hint(fi) {
      const { layout, side: s } = outlineFor(fi);
      return cached(`hint|${layout.radii.join(",")}|${s}`, () => new ShapeGeometry(new Shape(roundedOutline(s * 0.92, layout.radii).map(([x, y]) => new Vector2(x, y)))));
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

