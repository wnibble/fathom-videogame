// Dev-only: tile every extracted sprite onto a dark grid so extraction quality
// (bg removal, trim, halo) can be eyeballed in one image. Not shipped.
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "public", "assets", "sprites");
const atlas = JSON.parse(fs.readFileSync(path.join(OUT, "atlas.json"), "utf8"));

const items = [
  ...Object.values(atlas.sprites).map((s) => s.file),
  ...Object.values(atlas.animations).map((a) => a.frames[0]),
];

const CELL = 72, PAD = 4, COLS = 12;
const rows = Math.ceil(items.length / COLS);
const W = COLS * CELL, H = rows * CELL;
const out = new PNG({ width: W, height: H });
// dark deep-sea backdrop with faint checker so transparency is visible
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) << 2;
    const chk = ((x >> 3) + (y >> 3)) & 1;
    out.data[i] = chk ? 12 : 8;
    out.data[i + 1] = chk ? 20 : 14;
    out.data[i + 2] = chk ? 34 : 26;
    out.data[i + 3] = 255;
  }
items.forEach((rel, k) => {
  const spr = PNG.sync.read(fs.readFileSync(path.join(OUT, "..", rel)));
  const scale = Math.max(1, Math.floor((CELL - PAD * 2) / Math.max(spr.width, spr.height)));
  const dw = spr.width * scale, dh = spr.height * scale;
  const ox = (k % COLS) * CELL + ((CELL - dw) >> 1);
  const oy = Math.floor(k / COLS) * CELL + ((CELL - dh) >> 1);
  for (let y = 0; y < dh; y++)
    for (let x = 0; x < dw; x++) {
      const s = ((Math.floor(y / scale) * spr.width + Math.floor(x / scale)) << 2);
      const a = spr.data[s + 3] / 255;
      if (a === 0) continue;
      const d = (((oy + y) * W + (ox + x)) << 2);
      out.data[d] = spr.data[s] * a + out.data[d] * (1 - a);
      out.data[d + 1] = spr.data[s + 1] * a + out.data[d + 1] * (1 - a);
      out.data[d + 2] = spr.data[s + 2] * a + out.data[d + 2] * (1 - a);
      out.data[d + 3] = 255;
    }
});
const dst = path.resolve(__dirname, "..", "contact-sheet.png");
fs.writeFileSync(dst, PNG.sync.write(out));
console.log(`contact sheet: ${items.length} sprites -> ${dst} (${W}x${H})`);
