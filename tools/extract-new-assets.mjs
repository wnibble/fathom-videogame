// FATHOM new-pack extraction (additive).
//
// Processes the new named sheets (diver / fauna_enemies / gatekeeper / bichon /
// surface_station) described by fathom_asset_slice_manifest(1).json, which use a
// flat #ff00ff MAGENTA background (some frames carry a baked white patch too).
// Removes the background by border flood-fill, trims tight, aligns animation
// frames on a shared canvas, downscales nearest-neighbor, and MERGES the results
// into the existing public/assets/sprites/atlas.json (never wipes — the old
// prop/telegraph sprites the strata rely on stay intact).
//
// Run: npm run extract-new-assets

import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "Game asset (pictures with guide)");
const SUPP_DIR = path.join(ASSET_DIR, "fathom_supplementary_pack_documented");
const OUT_DIR = path.join(ROOT, "public", "assets", "sprites");

// Each manifest + the folder its sheet files live in.
const MANIFESTS = [
  { path: path.join(ASSET_DIR, "fathom_asset_slice_manifest(1).json"), dir: ASSET_DIR },
  { path: path.join(SUPP_DIR, "fathom_supplementary_master_manifest.json"), dir: SUPP_DIR },
];

// Logical max-dimension per sheet (integer game scaling applied on top at render).
const TARGET_MAX = {
  diver: 34,
  fauna_enemies: 46,
  gatekeeper: 112,
  bichon: 30,
  surface_station: 64,
  "01_loot_samples_upgrades": 24,
  "02_bioluminescent_flora": 60,
  "03_hazards_and_ancient_tech": 52,
  "04_wreck_industrial_props": 60,
  "05_surface_station_devices": 64,
};
const FPS = {
  diver: 7,
  fauna_enemies: 6,
  gatekeeper: 6,
  bichon: 7,
  surface_station: 5,
  "01_loot_samples_upgrades": 8,
  "02_bioluminescent_flora": 5,
  "03_hazards_and_ancient_tech": 8,
  "04_wreck_industrial_props": 6,
  "05_surface_station_devices": 6,
};

const PIVOT_TO_ANCHOR = {
  center: [0.5, 0.5],
  "bottom-center": [0.5, 1],
  "top-center": [0.5, 0],
  "left-center": [0, 0.5],
  "right-center": [1, 0.5],
  "apex-left": [0, 0.5],
};

function readPNG(file) {
  return PNG.sync.read(fs.readFileSync(file));
}
function writePNG(file, width, height, data) {
  const png = new PNG({ width, height });
  data.copy ? data.copy(png.data) : png.data.set(data);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, PNG.sync.write(png));
}
const idx = (x, y, w) => (y * w + x) * 4;

function crop(src, x0, y0, x1, y1) {
  const w = x1 - x0;
  const h = y1 - y0;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = idx(x0 + x, y0 + y, src.width);
      const d = idx(x, y, w);
      data[d] = src.data[s];
      data[d + 1] = src.data[s + 1];
      data[d + 2] = src.data[s + 2];
      data[d + 3] = src.data[s + 3];
    }
  }
  return { w, h, data };
}

// Magenta (#ff00ff and pinkish antialias toward it): high R + high B, low G.
function isMagenta(r, g, b) {
  return r > 150 && b > 150 && g < 120 && r - g > 55 && b - g > 55;
}
// Baked white/near-white patch (present on a couple frames).
function isNearWhite(r, g, b) {
  return r > 222 && g > 222 && b > 222;
}
function isBorderBg(r, g, b) {
  return isMagenta(r, g, b) || isNearWhite(r, g, b);
}

// Remove background by 8-connected border flood-fill (enclosed pale/white sprite
// pixels survive because they aren't border-connected), then binarize alpha and
// strip the magenta-tinted fringe rim.
function removeBackground(img) {
  const { w, h, data } = img;
  const visited = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const o = p * 4;
    if (!isBorderBg(data[o], data[o + 1], data[o + 2])) return;
    visited[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    data[p * 4 + 3] = 0;
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    push(x + 1, y + 1); push(x - 1, y - 1); push(x + 1, y - 1); push(x - 1, y + 1);
  }
  // Fringe decontamination: opaque magenta-ish pixels touching transparency are
  // the antialias rim — strip them for a clean binary edge.
  const alpha0 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha0[i] = data[i * 4 + 3];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (alpha0[p] === 0) continue;
      const o = p * 4;
      if (!isMagenta(data[o], data[o + 1], data[o + 2])) continue;
      let touchesBg = false;
      for (let dy = -1; dy <= 1 && !touchesBg; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) { touchesBg = true; break; }
          if (alpha0[ny * w + nx] === 0) { touchesBg = true; break; }
        }
      }
      if (touchesBg) data[o + 3] = 0;
    }
  }
  for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 128 ? 0 : 255;
}

function alphaBounds(img) {
  const { w, h, data } = img;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[idx(x, y, w) + 3] > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

function subCrop(img, minX, minY, maxX, maxY) {
  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = idx(minX + x, minY + y, img.w);
      const d = idx(x, y, w);
      data[d] = img.data[s];
      data[d + 1] = img.data[s + 1];
      data[d + 2] = img.data[s + 2];
      data[d + 3] = img.data[s + 3];
    }
  }
  return { w, h, data };
}

function downscale(img, targetMax) {
  const scale = Math.min(1, targetMax / Math.max(img.w, img.h));
  const nw = Math.max(1, Math.round(img.w * scale));
  const nh = Math.max(1, Math.round(img.h * scale));
  if (nw === img.w && nh === img.h) return img;
  const data = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const sx = Math.min(img.w - 1, Math.floor(x / scale));
      const sy = Math.min(img.h - 1, Math.floor(y / scale));
      const s = idx(sx, sy, img.w);
      const d = idx(x, y, nw);
      data[d] = img.data[s];
      data[d + 1] = img.data[s + 1];
      data[d + 2] = img.data[s + 2];
      data[d + 3] = img.data[s + 3];
    }
  }
  return { w: nw, h: nh, data };
}

const anchorFor = (pivot) => PIVOT_TO_ANCHOR[pivot] || [0.5, 0.5];
const animMatch = (name) => name.match(/^(.*)_f(\d+)$/);

function processManifest(manifestPath, dir, atlas, counts) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

  for (const [sheetKey, sheet] of Object.entries(manifest.sheets)) {
    const srcFile = path.join(dir, sheet.file);
    if (!fs.existsSync(srcFile)) {
      console.warn(`  ! missing ${sheet.file}, skipping ${sheetKey}`);
      continue;
    }
    const src = readPNG(srcFile);
    const targetMax = TARGET_MAX[sheetKey] ?? 48;
    const fps = FPS[sheetKey] ?? 8;

    const extracted = sheet.entries.map((e) => {
      const [x0, y0, x1, y1] = e.bbox;
      const img = crop(src, Math.max(0, x0), Math.max(0, y0), Math.min(src.width, x1), Math.min(src.height, y1));
      removeBackground(img);
      return { name: e.name, pivot: e.pivot, img, bounds: alphaBounds(img) };
    });

    const groups = new Map();
    for (const ex of extracted) {
      const m = animMatch(ex.name);
      const key = m ? m[1] : ex.name;
      if (!groups.has(key)) groups.set(key, { key, isAnim: !!m, frames: [] });
      const g = groups.get(key);
      if (m) g.isAnim = true;
      g.frames.push(ex);
    }

    for (const g of groups.values()) {
      const usable = g.frames.filter((f) => f.bounds);
      if (!usable.length) continue;

      if (g.isAnim && usable.length > 1) {
        const u = usable.reduce(
          (a, f) => ({
            minX: Math.min(a.minX, f.bounds.minX),
            minY: Math.min(a.minY, f.bounds.minY),
            maxX: Math.max(a.maxX, f.bounds.maxX),
            maxY: Math.max(a.maxY, f.bounds.maxY),
          }),
          { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }
        );
        const scale = Math.min(1, targetMax / Math.max(u.maxX - u.minX + 1, u.maxY - u.minY + 1));
        const frameFiles = [];
        let fw = 0, fh = 0;
        usable
          .sort((a, b) => +animMatch(a.name)[2] - +animMatch(b.name)[2])
          .forEach((f) => {
            const cropped = subCrop(f.img, u.minX, u.minY, u.maxX, u.maxY);
            const small = downscale(cropped, Math.max(cropped.w, cropped.h) * scale);
            fw = small.w; fh = small.h;
            const rel = `sprites/${f.name}.png`;
            writePNG(path.join(OUT_DIR, `${f.name}.png`), small.w, small.h, small.data);
            frameFiles.push(rel);
          });
        atlas.animations[g.key] = { frames: frameFiles, w: fw, h: fh, anchor: anchorFor(g.frames[0].pivot), fps, sheet: sheetKey };
        counts.anims++;
      } else {
        for (const f of usable) {
          const cropped = subCrop(f.img, f.bounds.minX, f.bounds.minY, f.bounds.maxX, f.bounds.maxY);
          const small = downscale(cropped, targetMax);
          const rel = `sprites/${f.name}.png`;
          writePNG(path.join(OUT_DIR, `${f.name}.png`), small.w, small.h, small.data);
          atlas.sprites[f.name] = { file: rel, w: small.w, h: small.h, anchor: anchorFor(f.pivot), sheet: sheetKey };
          counts.sprites++;
        }
      }
    }
    console.log(`  ${sheetKey}: ${sheet.entries.length} entries from ${sheet.file}`);
  }
}

function main() {
  const atlasPath = path.join(OUT_DIR, "atlas.json");
  const atlas = fs.existsSync(atlasPath)
    ? JSON.parse(fs.readFileSync(atlasPath, "utf8"))
    : { sprites: {}, animations: {} };
  const counts = { sprites: 0, anims: 0 };
  for (const m of MANIFESTS) {
    if (!fs.existsSync(m.path)) { console.warn(`  ! manifest missing: ${m.path}`); continue; }
    console.log(`\n== ${path.basename(m.path)} ==`);
    processManifest(m.path, m.dir, atlas, counts);
  }
  fs.writeFileSync(atlasPath, JSON.stringify(atlas, null, 2));
  console.log(`\nMerged: +${counts.sprites} sprites, +${counts.anims} animations -> ${path.relative(ROOT, OUT_DIR)}`);
}

main();
