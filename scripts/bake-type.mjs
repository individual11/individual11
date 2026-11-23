// Turns the site's two fonts into plain glyph outlines (assets/type.json), because an SVG
// inside an <img> can't load fonts. Only needed if the fonts change:
//   npm i --no-save opentype.js && node scripts/bake-type.mjs <folder with the two .ttf files>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import opentype from "opentype.js";

const dir = process.argv[2];
const ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i));
const faces = {
  display: ["ArchivoBlack-Regular.ttf", [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 "]],
  mono: ["JetBrainsMono-Bold.ttf", [...ASCII, "→", "↗", "·", "’"]],
};

const out = {};
for (const [name, [file, chars]] of Object.entries(faces)) {
  const buf = readFileSync(join(dir, file));
  const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const glyphs = {};
  for (const ch of chars) {
    const g = font.charToGlyph(ch);
    // 1000 units to the em, y down
    glyphs[ch] = [Math.round((g.advanceWidth / font.unitsPerEm) * 1000), g.getPath(0, 0, 1000).toPathData(0)];
  }
  out[name] = glyphs;
}
writeFileSync(new URL("../assets/type.json", import.meta.url), JSON.stringify(out));
