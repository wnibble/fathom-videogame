// Placeholder actor visuals (the diver + Spitter aren't in the art pack). Solid
// dark bodies (silhouette-first) in the world layer + a SOFT radial glow sprite
// in the light layer. Swap for real sprites later — nothing depends on the draw.

import { Container, Graphics, Sprite } from "pixi.js";
import { COLOR } from "../palette";
import { getGlowTexture, GLOW_SIZE } from "../engine/glow";

function glow(diameter: number, color: number, alpha: number): Sprite {
  const s = new Sprite(getGlowTexture());
  s.anchor.set(0.5);
  s.scale.set(diameter / GLOW_SIZE);
  s.tint = color;
  s.alpha = alpha;
  return s;
}

export interface PlayerView {
  root: Container; // world layer
  lamp: Sprite; // light layer (headlamp pool)
}

export function buildPlayerView(): PlayerView {
  const root = new Container();
  const g = new Graphics();
  // Diver faces +x.
  g.roundRect(-9, -7, 18, 14, 6).fill(COLOR.teal).stroke({ width: 1.5, color: COLOR.deepNavy });
  g.roundRect(-11, -5, 5, 10, 2).fill(COLOR.navy);
  g.circle(7, 0, 4).fill(COLOR.amber);
  g.circle(8, 0, 2).fill(COLOR.amberBright);
  g.poly([-9, -7, -15, -11, -12, -5]).fill(COLOR.teal);
  g.poly([-9, 7, -15, 11, -12, 5]).fill(COLOR.teal);
  root.addChild(g);

  const lamp = glow(230, COLOR.aqua, 0.5);
  return { root, lamp };
}

export interface SpitterView {
  root: Container; // world layer
  glow: Sprite; // light layer
  body: Graphics; // for hit feedback
}

export function buildSpitterView(): SpitterView {
  const root = new Container();
  const body = new Graphics();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = Math.cos(a) * 13;
    const sy = Math.sin(a) * 13;
    const tx = Math.cos(a) * 20;
    const ty = Math.sin(a) * 20;
    const px = Math.cos(a + 0.32) * 11;
    const py = Math.sin(a + 0.32) * 11;
    body.poly([sx, sy, tx, ty, px, py]).fill(COLOR.coral);
  }
  body.circle(0, 0, 13).fill(COLOR.deepNavy).stroke({ width: 2, color: COLOR.coral });
  body.circle(0, 0, 6).fill(COLOR.navy);
  body.circle(0, 0, 3).fill(COLOR.amberBright);
  root.addChild(body);

  // Brighter/larger than ambient fauna glows — the threat must be the loudest
  // warm signal on screen, not blend into set-dressing.
  return { root, glow: glow(120, COLOR.coral, 0.85), body };
}
