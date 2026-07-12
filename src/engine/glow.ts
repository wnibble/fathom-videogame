// A soft radial-gradient glow texture, generated once. Tinted sprites of this
// read as real bioluminescence (a soft falloff), unlike flat Graphics circles
// which look like solid discs.

import { Texture } from "pixi.js";

let cached: Texture | null = null;

export function getGlowTexture(): Texture {
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.7)");
  g.addColorStop(0.6, "rgba(255,255,255,0.22)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  cached = Texture.from(canvas);
  return cached;
}

export const GLOW_SIZE = 128;
