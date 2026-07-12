// FATHOM asset-extraction pipeline.
//
// Turns the concept-grade source sheets (RGB with baked light/checker background,
// OR real alpha) into game-ready sprites: background removed, trimmed to a tight
// binary-alpha bound, animation frames aligned on a shared canvas, and downscaled
// nearest-neighbor to logical pixel-art sizes. Emits individual PNGs +
// public/assets/sprites/atlas.json (name -> file/size/anchor, animation groups).
//
// Run: npm run extract-assets
//
// This is intentionally dependency-light (pngjs only). Atlas *packing* into a
// power-of-two sheet is deferred to the optimizer pass; individual textures load
// fine at slice scale.

import { PNG } from "pngjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ASSET_DIR = path.join(ROOT, "Game asset (pictures with guide)");
const MANIFEST = path.join(ASSET_DIR, "fathom_asset_slice_manifest.json");
const OUT_DIR = path.join(ROOT, "public", "assets", "sprites");

// Logical max-dimension (px) each category downscales to. Integer game scaling
// is applied on top of this at render time.
const TARGET_MAX = {
  projectiles: 16,
  impacts_telegraphs: 48,
  movement_utility_vfx: 32,
  twilight_drift_props: 64,
  kelp_forest_props: 64,
  wreck_thermal_props: 64,
};
const FPS = {
  projectiles: 8,
  impacts_telegraphs: 14,
  movement_utility_vfx: 12,
  twilight_drift_props: 6,
  kelp_forest_props: 6,
  wreck_thermal_props: 10,
};

const PIVOT_TO_ANCHOR = {
  center: [0.5, 0.5],
  "bottom-center": [0.5, 1],
  "top-center": [0.5, 0],
  "left-center": [0, 0.5],
  "right-center": [1, 0.5],
  "apex-left": [0, 0.5],
};

// ---------- PNG helpers ----------
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

// Crop an RGBA region out of a source PNG -> {w,h,data}
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

// A pixel reads as "light background" — near-white or the light-gray checker,
// low saturation. Interior sprite highlights are enclosed by darker outlines and
// so survive the border flood.
function isLightBg(r, g, b) {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx >= 224 && mx - mn <= 30;
}
// Some sheets (telegraphs/impacts) render glows on a near-black backdrop rather
// than a light checker. Strip that too — but only border-connected, so enclosed
// dark detail inside a bright sprite survives.
function isDarkBg(r, g, b) {
  return Math.max(r, g, b) <= 28;
}
function isBg(r, g, b) {
  return isLightBg(r, g, b) || isDarkBg(r, g, b);
}

// Remove background in-place: alpha-passthrough if the sheet already has real
// transparency, otherwise border flood-fill on light/checker background.
function removeBackground(img) {
  const { w, h, data } = img;
  // Does the border already have real transparency?
  let borderCount = 0;
  let borderTransparent = 0;
  const scanBorder = (x, y) => {
    borderCount++;
    if (data[idx(x, y, w) + 3] < 40) borderTransparent++;
  };
  for (let x = 0; x < w; x++) { scanBorder(x, 0); scanBorder(x, h - 1); }
  for (let y = 0; y < h; y++) { scanBorder(0, y); scanBorder(w - 1, y); }
  const hasAlpha = borderCount > 0 && borderTransparent / borderCount > 0.35;

  if (hasAlpha) {
    // Binarize existing alpha — pixel art wants a hard edge.
    for (let i = 3; i < data.length; i += 4) data[i] = data[i] < 128 ? 0 : 255;
    return;
  }

  // Border flood-fill: mark connected light pixels transparent.
  const visited = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const o = p * 4;
    if (!isBg(data[o], data[o + 1], data[o + 2])) return;
    visited[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w;
    const y = (p - x) / w;
    data[p * 4 + 3] = 0; // transparent
    // 8-connectivity: pixel-art staircase edges leave diagonal-only paths into
    // background pockets that a 4-connected flood won't reach.
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    push(x + 1, y + 1); push(x - 1, y - 1); push(x + 1, y - 1); push(x - 1, y + 1);
  }

  // Fringe decontamination: a hard alpha cutoff leaves a thin rim of
  // background-tinted (light, low-sat) pixels at the sprite edge. Strip opaque
  // pixels that are BOTH light-ish AND touch transparency — removes the halo
  // without eating solid or dark sprite edges.
  const alpha0 = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) alpha0[i] = data[i * 4 + 3];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      if (alpha0[p] === 0) continue;
      const o = p * 4;
      const mx = Math.max(data[o], data[o + 1], data[o + 2]);
      const mn = Math.min(data[o], data[o + 1], data[o + 2]);
      if (!(mx >= 210 && mx - mn <= 40)) continue; // only light-ish rim pixels
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
}

// Tight alpha bounds of an RGBA image, or null if empty.
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

// Crop an already-in-memory RGBA image to a rect.
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

// Nearest-neighbor downscale so max(w,h) == targetMax (never upscale).
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

function anchorFor(pivot) {
  return PIVOT_TO_ANCHOR[pivot] || [0.5, 0.5];
}
const animMatch = (name) => name.match(/^(.*)_f(\d+)$/);

// ---------- main ----------
function main() {
  const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const sheetKeys = Object.keys(manifest.sheets);

  // Map actual source files "(N).png" -> Nth sheet in manifest order.
  const files = fs
    .readdirSync(ASSET_DIR)
    .filter((f) => /\((\d+)\)\.png$/i.test(f))
    .map((f) => ({ f, n: parseInt(f.match(/\((\d+)\)\.png$/i)[1], 10) }))
    .sort((a, b) => a.n - b.n);
  if (files.length < sheetKeys.length) {
    console.error(`Expected ${sheetKeys.length} source PNGs, found ${files.length}`);
    process.exit(1);
  }

  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const atlas = { sprites: {}, animations: {} };
  let spriteCount = 0;
  let animCount = 0;

  sheetKeys.forEach((sheetKey, i) => {
    const sheet = manifest.sheets[sheetKey];
    const srcFile = path.join(ASSET_DIR, files[i].f);
    const src = readPNG(srcFile);
    if (src.width !== sheet.size[0] || src.height !== sheet.size[1]) {
      console.warn(
        `  ! ${sheetKey}: source ${src.width}x${src.height} != manifest ${sheet.size[0]}x${sheet.size[1]} (mapping may be off)`
      );
    }
    const targetMax = TARGET_MAX[sheetKey] ?? 48;
    const fps = FPS[sheetKey] ?? 10;

    // Extract + bg-remove every entry first (needed for animation union bounds).
    const extracted = sheet.entries.map((e) => {
      const [x0, y0, x1, y1] = e.bbox;
      const img = crop(src, x0, y0, x1, y1);
      removeBackground(img);
      return { name: e.name, pivot: e.pivot, img, bounds: alphaBounds(img) };
    });

    // Group animation frames by prefix so they share a canvas + alignment.
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
        // Shared union bounds across frames -> no jitter.
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
          .sort((a, b) => {
            const na = +animMatch(a.name)[2], nb = +animMatch(b.name)[2];
            return na - nb;
          })
          .forEach((f) => {
            const cropped = subCrop(f.img, u.minX, u.minY, u.maxX, u.maxY);
            const small = downscale(cropped, Math.max(cropped.w, cropped.h) * scale);
            fw = small.w; fh = small.h;
            const rel = `sprites/${f.name}.png`;
            writePNG(path.join(OUT_DIR, `${f.name}.png`), small.w, small.h, small.data);
            frameFiles.push(rel);
          });
        atlas.animations[g.key] = {
          frames: frameFiles,
          w: fw, h: fh,
          anchor: anchorFor(g.frames[0].pivot),
          fps,
          sheet: sheetKey,
        };
        animCount++;
      } else {
        // Single sprite (or a lone frame): trim tight + downscale.
        for (const f of usable) {
          const cropped = subCrop(f.img, f.bounds.minX, f.bounds.minY, f.bounds.maxX, f.bounds.maxY);
          const small = downscale(cropped, targetMax);
          const rel = `sprites/${f.name}.png`;
          writePNG(path.join(OUT_DIR, `${f.name}.png`), small.w, small.h, small.data);
          atlas.sprites[f.name] = {
            file: rel,
            w: small.w, h: small.h,
            anchor: anchorFor(f.pivot),
            sheet: sheetKey,
          };
          spriteCount++;
        }
      }
    }
    console.log(`  ${sheetKey}: ${sheet.entries.length} entries from ${files[i].f}`);
  });

  fs.writeFileSync(path.join(OUT_DIR, "atlas.json"), JSON.stringify(atlas, null, 2));
  console.log(`\nDone: ${spriteCount} sprites, ${animCount} animations -> ${path.relative(ROOT, OUT_DIR)}`);
}

main();
