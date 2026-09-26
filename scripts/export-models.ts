/**
 * Writes glTF templates of a skin's pieces (see @cubecore/render gltf.ts):
 *   bun scripts/export-models.ts [skin] [outDir]
 * Default: ganI4 → demo/models/. Open them in Blender, reshape, keep the
 * material names (body, sticker-U / -F / -R), export as GLB.
 */
import { ARCHIVED_SKINS, SKINS as CURRENT } from "../packages/skin/src/index";

const SKINS = { ...CURRENT, ...ARCHIVED_SKINS }; // the i4 templates come from the archived i4 skin
import { pieceTemplates } from "../packages/render/src/gltf";

const name = (process.argv[2] ?? "ganI4") as keyof typeof SKINS;
const out = process.argv[3] ?? `${import.meta.dir}/../demo/models`;
const skin = SKINS[name];
if (!skin) throw new Error(`No skin "${name}" (have: ${Object.keys(SKINS).join(", ")})`);
for (const [kind, gltf] of Object.entries(pieceTemplates(skin))) {
  const file = `${out}/${name}-${kind}.gltf`;
  await Bun.write(file, gltf);
  console.log(file, `${Math.round(gltf.length / 1024)} KB`);
}
