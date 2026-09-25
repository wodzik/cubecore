# Blindfolded (`@cubecore/bld`, `<cube-bld>`)

Old Pochmann: edges swapped one at a time with the UR buffer (T-perm with
setup moves), corners with the ULB buffer (Y-perm), parity after the edges
when their count is odd.

## Letters

A letter for every corner sticker and every edge sticker. Built-in schemes
letter each face clockwise from its top-left corner / top edge, looking at the
face in the usual net:

| scheme | faces in order | |
|---|---|---|
| `RUWIX` (default) | U F R B L D | the ruwix.com tutorial |
| `SPEFFZ` | U L F R B D | the common scheme |

Your own: `schemeByFaces(name, order)` or any `{ corners, edges }` map
(facelet position → letter).

## Memo

```ts
import { memo, formatMemo } from "@cubecore/bld";
const m = memo(session.state, { rotation: "x2 y'" });   // held yellow top, orange front
formatMemo(m.edges);    // "HV PU EF TX DW AM"
formatMemo(m.corners);  // "WU OI RJ"
m.parity;               // odd number of edge letters
```

Cycles from the buffer, cycle breaks to the lowest unsolved letter, flipped
edges / twisted corners in place (both of their stickers) — checked by doing
every letter's swap on hundreds of random scrambles. `rotation` says how the
cube is held (rotations from its own U / F); a state after rotations
(`"… x2 y'"`) reads as it is held.

## Following the execution

`BldTracker` (and `<cube-bld>` on top of it) takes the cube's moves: a letter
is done when that kind of piece is exactly where its swap leaves it — edges
after an edge letter, corners after a corner letter (the swap algorithms move
a couple of pieces of the other kind on the side, which is fine). Parity is
done when the corners are back as they were. A swap with another letter than
the one due is reported (`wrong: { expected, got }`).

```html
<cube-bld reveal="done" scheme="ruwix" rotation="x2 y'"></cube-bld>
<script type="module">
  const el = document.querySelector("cube-bld");
  el.attach(session);                 // memo now, then follow
  el.memoText;                        // { edges: "HV PU …", corners: "WU OI RJ" }
  el.addEventListener("letter", (e) => e.detail.step);   // { kind, letter, target }
  el.addEventListener("wrong", (e) => e.detail);        // { expected, got, kind }
</script>
```

Styling like the other sequence elements (`--cc-seq-*`, `::part`, a
`controls` slot, `headless`).

## Letters on the cube

```ts
player.skin = letterSkin(SKINS.standard, { scheme: RUWIX, rotation: "x2 y'" });
```

Each sticker carries the letter of its home position (as held, upright for
the holder) and keeps it wherever it goes — the letter in the buffer is the
next letter to remember. `alwaysShow: true` keeps the letters on stickers a
mask greys out: with a mask greying every sticker you get a letters-only
cube; without letters, a hidden (blindfold) one.

Demo: `/bld`.
