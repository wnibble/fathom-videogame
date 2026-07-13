// Placeholder actor visuals (the diver + Spitter aren't in the art pack). Solid
// dark bodies (silhouette-first) in the world layer + a SOFT radial glow sprite
// in the light layer. Swap for real sprites later — nothing depends on the draw.

import { Container, Graphics, Sprite } from "pixi.js";
import { COLOR } from "../palette";
import { getGlowTexture, GLOW_SIZE } from "../engine/glow";
import type { AssetStore } from "../engine/assets";

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
  /** Drive the diver's animation state: swim vs idle, left/right facing, hurt flash. */
  update?(dt: number, moving: boolean, faceX: number, hurt: boolean): void;
}

export function buildPlayerView(assets?: AssetStore): PlayerView {
  const root = new Container();
  // A restrained headlamp pool — enough to read "a small light," not a blinding disc.
  const lamp = glow(126, COLOR.aqua, 0.22);

  // Prefer the real animated diver sprite. It's drawn side-on, so we FLIP L/R to
  // face travel (never full-rotate — that would tumble a side view). Aim direction
  // is already told by the muzzle flash + bullets.
  if (assets && assets.has("diver_idle") && assets.has("diver_swim")) {
    const flip = new Container();
    root.addChild(flip);
    const idle = assets.anim("diver_idle");
    const swim = assets.anim("diver_swim");
    swim.animationSpeed = idle.animationSpeed * 1.6;
    const hurt = assets.has("diver_hurt") ? assets.sprite("diver_hurt") : null;
    idle.visible = true;
    swim.visible = false;
    flip.addChild(idle, swim);
    if (hurt) {
      hurt.visible = false;
      flip.addChild(hurt);
    }
    let hurtT = 0;
    let face = 1; // sprite art faces LEFT at scale.x=1; flip to face right
    const update = (dt: number, moving: boolean, faceX: number, isHurt: boolean) => {
      if (isHurt) hurtT = 0.2;
      hurtT = Math.max(0, hurtT - dt);
      const showHurt = hurtT > 0 && !!hurt;
      idle.visible = !showHurt && !moving;
      swim.visible = !showHurt && moving;
      if (hurt) hurt.visible = showHurt;
      if (Math.abs(faceX) > 0.06) face = faceX > 0 ? -1 : 1;
      flip.scale.x = face;
    };
    return { root, lamp, update };
  }

  // Procedural fallback (silhouette-first) — kept for missing-asset safety.
  const g = new Graphics();
  g.roundRect(-9, -7, 18, 14, 6).fill(COLOR.teal).stroke({ width: 1.5, color: COLOR.deepNavy });
  g.roundRect(-11, -5, 5, 10, 2).fill(COLOR.navy);
  g.circle(7, 0, 4).fill(COLOR.amber);
  g.circle(8, 0, 2).fill(COLOR.amberBright);
  g.poly([-9, -7, -15, -11, -12, -5]).fill(COLOR.teal);
  g.poly([-9, 7, -15, 11, -12, 5]).fill(COLOR.teal);
  root.addChild(g);
  return { root, lamp };
}

export interface SpitterView {
  root: Container; // world layer
  glow: Sprite; // light layer
  body: Graphics; // for hit feedback
}

export function buildSpitterView(elite = false): SpitterView {
  const root = new Container();
  const body = new Graphics();
  const r = elite ? 17 : 13;
  const spike = elite ? 26 : 20;
  const outline = elite ? COLOR.amberBright : COLOR.coral;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const sx = Math.cos(a) * r;
    const sy = Math.sin(a) * r;
    const tx = Math.cos(a) * spike;
    const ty = Math.sin(a) * spike;
    const px = Math.cos(a + 0.32) * (r - 2);
    const py = Math.sin(a + 0.32) * (r - 2);
    body.poly([sx, sy, tx, ty, px, py]).fill(COLOR.coral);
  }
  body.circle(0, 0, r).fill(COLOR.deepNavy).stroke({ width: elite ? 3 : 2, color: outline });
  body.circle(0, 0, r * 0.46).fill(COLOR.navy);
  body.circle(0, 0, elite ? 4 : 3).fill(COLOR.amberBright);
  root.addChild(body);

  // Brighter/larger than ambient fauna glows — the threat must be the loudest
  // warm signal on screen, not blend into set-dressing. Elites glow harder.
  return { root, glow: glow(elite ? 175 : 120, COLOR.coral, elite ? 0.95 : 0.85), body };
}

// The Drifter — a slow jelly-like mine-layer: a domed bell + drooping tendrils.
// A distinct silhouette from the spiky Spitter and arrow Darter.
export function buildDrifterView(elite = false): SpitterView {
  const root = new Container();
  const body = new Graphics();
  const s = elite ? 1.3 : 1;
  const outline = elite ? COLOR.amberBright : COLOR.coral;
  // bell dome
  body.ellipse(0, -2 * s, 13 * s, 10 * s).fill(COLOR.deepNavy).stroke({ width: 2, color: outline });
  body.ellipse(0, -4 * s, 7 * s, 5 * s).fill(COLOR.navy);
  // drooping tendrils
  for (let i = -2; i <= 2; i++) {
    const x = i * 5 * s;
    body.moveTo(x, 6 * s).lineTo(x + Math.sign(i) * 2, 16 * s).stroke({ width: 2, color: COLOR.coral, alpha: 0.8 });
  }
  body.circle(0, -3 * s, 2.4 * s).fill(COLOR.amberBright); // eye
  root.addChild(body);
  return { root, glow: glow(elite ? 130 : 90, COLOR.coral, elite ? 0.85 : 0.6), body };
}

// The Darter — a sleek lunging predator (points +x; dive rotates it to face its
// lunge). Distinct silhouette from the Spitter so the two threats read apart.
export function buildDarterView(elite = false): SpitterView {
  const root = new Container();
  const body = new Graphics();
  const s = elite ? 1.35 : 1;
  const outline = elite ? COLOR.amberBright : COLOR.coral;
  body.poly([15 * s, 0, -8 * s, -8 * s, -3 * s, 0, -8 * s, 8 * s]).fill(COLOR.deepNavy).stroke({ width: 2, color: outline });
  body.poly([-3 * s, 0, -15 * s, -6 * s, -10 * s, 0, -15 * s, 6 * s]).fill(COLOR.coral);
  body.circle(6 * s, 0, 2.6 * s).fill(COLOR.amberBright);
  root.addChild(body);
  return { root, glow: glow(elite ? 120 : 82, COLOR.coral, elite ? 0.9 : 0.72), body };
}
