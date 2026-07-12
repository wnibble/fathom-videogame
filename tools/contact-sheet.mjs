// Dev-only: tile every extracted sprite onto a dark grid so extraction quality
// (bg removal, trim, halo) can be eyeballed in one image. Not shipped.
import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, "..", "public", "assets", "sprites");
const atlas = JSON.parse(fs.readFileSync(path.join(OUT, "atlas.json"), "utf8"));

let items = [
  ...Object.entries(atlas.sprites).map(([name, s]) => ({ name, file: s.file, kind: "sprite" })),
  ...Object.entries(atlas.animations).flatMap(([name, a]) => a.frames.map((f, i) => ({ name: `${name}_${i}`, file: f, kind: "anim" }))),
];
const filter = process.argv[2];
if (filter) {
  const terms = filter.split(",");
  items = items.filter((it) => terms.some((t) => it.name.includes(t)));
}

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
const suspect = [];
items.forEach((it, k) => {
  const spr = PNG.sync.read(fs.readFileSync(path.join(OUT, "..", it.file)));
  // coverage: fraction of non-transparent pixels (flags flood-fill damage / empties)
  let opaque = 0;
  for (let i = 3; i < spr.data.length; i += 4) if (spr.data[i] > 20) opaque++;
  const coverage = opaque / (spr.width * spr.height);
  const col = k % COLS;
  const row = Math.floor(k / COLS);
  if (coverage < 0.04 || spr.width <= 2 || spr.height <= 2 || coverage > 0.985)
    suspect.push(`  [r${row} c${col}] ${it.name} (${spr.width}x${spr.height}, cov ${(coverage * 100).toFixed(0)}%)`);

  const scale = Math.max(1, Math.floor((CELL - PAD * 2) / Math.max(spr.width, spr.height)));
  const dw = spr.width * scale, dh = spr.height * scale;
  const ox = col * CELL + ((CELL - dw) >> 1);
  const oy = row * CELL + ((CELL - dh) >> 1);
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
console.log(`contact sheet: ${items.length} sprites, ${COLS} cols -> ${dst} (${W}x${H})`);
console.log(`\nSUSPECT sprites (${suspect.length}):`);
console.log(suspect.join("\n") || "  none");
console.log("\nFull order (row col name):");
console.log(items.map((it, k) => `r${Math.floor(k / COLS)}c${k % COLS} ${it.name}`).join("  |  "));
