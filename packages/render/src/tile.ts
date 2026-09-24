/**
 * Tile solids — pure geometry (no three.js), shared by the renderer and its
 * tests. A tile is its outline (from @cubecore/skin: rounded shape, custom
 * SVG path or stickerless) swept through a cross-section:
 *
 *        top (flat) ── bevel (quarter round, `bevel` radius) ─┐
 *                                                             │ wall
 *   z = −sink ─────────────────────────────────────────────── ┘ (into the body)
 *
 * Sides lying on the cube's outer edge (stickerless `fillOuter`) are not
 * bevelled: they are mitred at 45° instead, so the tiles of two faces of one
 * piece meet on the edge line and their colours touch, like on a real
 * stickerless cube. Normals are given explicitly — smooth round the bevel,
 * straight up on the top — so a lit ("plastic") material shades it cleanly.
 */

export type Pt = readonly [number, number];

export interface TileProfile {
  /** Height of the tile above the cubie face (cubie units). */
  thickness: number;
  /** Radius of the rounded top edge (≤ thickness + sink). 0 = sharp. */
  bevel: number;
  /** Segments of the bevel's quarter round. */
  segments: number;
  /** How deep the tile reaches below the cubie face — into a body shrunk by `bodyInset`. */
  sink: number;
}

export interface Mitre {
  /** Which local sides lie on the cube's outer edge: -1 / 0 / +1 along x (u) and y (v). */
  u: number;
  v: number;
  /** Coordinate of the cube edge at z = 0 (the outline reaches it there). */
  edge: number;
  /** Width of the zone next to the edge that blends from mitred to bevelled. */
  ramp: number;
}

export interface TileSolid {
  positions: Float32Array;
  normals: Float32Array;
  /** Side triangles (indices into positions). */
  sides: Uint32Array;
  /** Index of the first top-ring vertex; the top cap is triangulated from `topRing` by the caller. */
  topStart: number;
  /** The top outline (2D), for the caller's triangulator; its vertices follow `topStart` in positions. */
  topRing: Pt[];
}

/** Drop consecutive duplicate points (rounded corners with radius 0 repeat their corner). */
export function dedupe(outline: readonly Pt[], eps = 1e-7): Pt[] {
  const out: Pt[] = [];
  for (const p of outline) {
    const q = out[out.length - 1];
    if (!q || Math.abs(p[0] - q[0]) > eps || Math.abs(p[1] - q[1]) > eps) out.push(p);
  }
  const first = out[0], last = out[out.length - 1];
  if (out.length > 1 && Math.abs(first[0] - last[0]) <= eps && Math.abs(first[1] - last[1]) <= eps) out.pop();
  return out;
}

/** Outward unit normal at each vertex (outline counter-clockwise) and the miter factor keeping offsets parallel. */
function vertexNormals(pts: readonly Pt[]): { n: Pt; scale: number }[] {
  const count = pts.length;
  const edgeNormal = (i: number): Pt => {
    const a = pts[i], b = pts[(i + 1) % count];
    const dx = b[0] - a[0], dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];
  };
  return pts.map((_, i) => {
    const e1 = edgeNormal((i + count - 1) % count), e2 = edgeNormal(i);
    let nx = e1[0] + e2[0], ny = e1[1] + e2[1];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    const cos = nx * e2[0] + ny * e2[1];
    return { n: [nx, ny] as Pt, scale: 1 / Math.max(0.5, cos) };
  });
}

/** How strongly a point belongs to the cube's outer edge: 1 on it, 0 beyond `ramp` from it. */
function edgeWeight(c: number, dir: number, mitre: Mitre): number {
  if (dir === 0) return 0;
  return Math.max(0, 1 - (mitre.edge - c * dir) / mitre.ramp);
}

export function tileSolid(outlineIn: readonly Pt[], profile: TileProfile, mitre: Mitre | null): TileSolid {
  const outline = dedupe(outlineIn);
  const vn = vertexNormals(outline);
  const t = profile.thickness;
  const b = Math.max(0, Math.min(profile.bevel, t + profile.sink));
  const segs = b > 0 ? Math.max(1, profile.segments) : 0;

  // Rings from the bottom up: height z, inward offset d, normal tilt phi (0 = sideways, π/2 = up).
  const rings: { z: number; d: number; phi: number }[] = [{ z: -profile.sink, d: 0, phi: 0 }];
  if (b > 0) {
    rings.push({ z: t - b, d: 0, phi: 0 });
    for (let k = 1; k <= segs; k++) {
      const th = (k / segs) * (Math.PI / 2);
      rings.push({ z: t - b + b * Math.sin(th), d: b * (1 - Math.cos(th)), phi: th });
    }
  } else rings.push({ z: t, d: 0, phi: 0 });

  const n = outline.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const place = (i: number, ring: { z: number; d: number }): [number, number, number] => {
    let [x, y] = outline[i];
    const ku = mitre ? edgeWeight(x, mitre.u, mitre) : 0;
    const kv = mitre ? edgeWeight(y, mitre.v, mitre) : 0;
    // Bevel inset fades out towards the outer edge; the mitre moves the outer sides with height.
    const bevelWeight = (1 - ku) * (1 - kv);
    x -= vn[i].n[0] * ring.d * vn[i].scale * bevelWeight;
    y -= vn[i].n[1] * ring.d * vn[i].scale * bevelWeight;
    if (mitre) {
      x += mitre.u * ring.z * ku;
      y += mitre.v * ring.z * kv;
    }
    return [x, y, ring.z];
  };

  for (const ring of rings) {
    for (let i = 0; i < n; i++) {
      positions.push(...place(i, ring));
      const c = Math.cos(ring.phi), s = Math.sin(ring.phi);
      normals.push(vn[i].n[0] * c, vn[i].n[1] * c, s);
    }
  }
  const sides: number[] = [];
  for (let j = 0; j + 1 < rings.length; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * n + i, bb = j * n + ((i + 1) % n), c = (j + 1) * n + ((i + 1) % n), d = (j + 1) * n + i;
      sides.push(a, bb, c, a, c, d);
    }
  }

  // Top cap: its own copy of the top ring, facing straight up.
  const top = rings[rings.length - 1];
  const topStart = positions.length / 3;
  const topRing: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = place(i, top);
    positions.push(...p);
    normals.push(0, 0, 1);
    topRing.push([p[0], p[1]]);
  }

  return { positions: new Float32Array(positions), normals: new Float32Array(normals), sides: new Uint32Array(sides), topStart, topRing };
}
