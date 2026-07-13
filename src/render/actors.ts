// Placeholder actor visuals (the diver + Spitter aren't in the art pack). Solid
// dark bodies (silhouette-first) in the world layer + a SOFT radial glow sprite
// in the light layer. Swap for real sprites later — nothing depends on the draw.

import { Container, Graphics, Sprite } from "pixi.js";
import { COLOR } from "../palette";
import { getGlowTexture, GLOW_SIZE } from "../engine/glow";
import type { AssetStore } from "../engine/assets";
import type { Enemy } from "../core/types";
import { phaseOf } from "./vitality";

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
  body?: Graphics; // procedural path only (unused elsewhere)
  /** Sprite path: drive pose (idle/windup/fire/lunge…), facing + breathe/flash. */
  update?(e: Enemy, dt: number, elapsed: number): void;
}

// Shared breathe/flash so procedural + sprite paths feel identical. Gentle —
// large scale-breathing on pixel sprites reads as wobble, not life.
function faunaBreathe(e: Enemy, elapsed: number, elite: boolean): number {
  const ph = phaseOf(e.pos.x, e.pos.y);
  const amp = e.kind === "drifter" ? 0.035 : e.kind === "spitter" ? 0.022 : 0.014;
  const spd = e.kind === "drifter" ? 2.2 : 3;
  let sc = (elite ? 1.28 : 1) * (1 + amp * Math.sin(elapsed * spd + ph));
  if (e.flash > 0) sc *= 1.12;
  return sc;
}

// The Spitter — a spiky urchin that winds up then fires a radial volley.
export function buildSpitterView(elite = false, assets?: AssetStore): SpitterView {
  const root = new Container();
  const glowS = glow(elite ? 175 : 120, COLOR.coral, elite ? 0.95 : 0.85);
  if (assets?.has("spitter_idle")) {
    const idle = assets.anim("spitter_idle");
    const windup = assets.has("spitter_windup") ? assets.sprite("spitter_windup") : null;
    const fire = assets.has("spitter_fire") ? assets.sprite("spitter_fire") : null;
    root.addChild(idle);
    if (windup) { windup.visible = false; root.addChild(windup); }
    if (fire) { fire.visible = false; root.addChild(fire); }
    let prevTele = false, fireT = 0;
    return {
      root, glow: glowS,
      update(e, dt, elapsed) {
        const tele = e.telegraphTimer > 0;
        if (prevTele && !tele) fireT = 0.18;
        prevTele = tele;
        fireT = Math.max(0, fireT - dt);
        const showFire = fireT > 0 && !!fire;
        const showWind = tele && !!windup && !showFire;
        idle.visible = !showFire && !showWind;
        if (windup) windup.visible = showWind;
        if (fire) fire.visible = showFire;
        root.scale.set(faunaBreathe(e, elapsed, elite));
      },
    };
  }
  const body = new Graphics();
  const r = elite ? 17 : 13, spike = elite ? 26 : 20, outline = elite ? COLOR.amberBright : COLOR.coral;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    body.poly([Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * spike, Math.sin(a) * spike, Math.cos(a + 0.32) * (r - 2), Math.sin(a + 0.32) * (r - 2)]).fill(COLOR.coral);
  }
  body.circle(0, 0, r).fill(COLOR.deepNavy).stroke({ width: elite ? 3 : 2, color: outline });
  body.circle(0, 0, r * 0.46).fill(COLOR.navy);
  body.circle(0, 0, elite ? 4 : 3).fill(COLOR.amberBright);
  root.addChild(body);
  return { root, glow: glowS, body };
}

// The Drifter — a slow jelly mine-layer: domed bell + drooping tendrils.
export function buildDrifterView(elite = false, assets?: AssetStore): SpitterView {
  const root = new Container();
  const glowS = glow(elite ? 130 : 90, COLOR.coral, elite ? 0.85 : 0.6);
  if (assets?.has("drifter_idle")) {
    const idle = assets.anim("drifter_idle");
    const pulse = assets.has("drifter_pulse") ? assets.sprite("drifter_pulse") : null;
    root.addChild(idle);
    if (pulse) { pulse.visible = false; root.addChild(pulse); }
    return {
      root, glow: glowS,
      update(e, _dt, elapsed) {
        // Pulse frame when a mine is imminent (irradiated cadence), else drift.
        const pulsing = !!pulse && (e.mineTimer !== undefined && e.mineTimer < 0.2);
        idle.visible = !pulsing;
        if (pulse) pulse.visible = pulsing;
        root.scale.set(faunaBreathe(e, elapsed, elite));
      },
    };
  }
  const body = new Graphics();
  const s = elite ? 1.3 : 1, outline = elite ? COLOR.amberBright : COLOR.coral;
  body.ellipse(0, -2 * s, 13 * s, 10 * s).fill(COLOR.deepNavy).stroke({ width: 2, color: outline });
  body.ellipse(0, -4 * s, 7 * s, 5 * s).fill(COLOR.navy);
  for (let i = -2; i <= 2; i++) body.moveTo(i * 5 * s, 6 * s).lineTo(i * 5 * s + Math.sign(i) * 2, 16 * s).stroke({ width: 2, color: COLOR.coral, alpha: 0.8 });
  body.circle(0, -3 * s, 2.4 * s).fill(COLOR.amberBright);
  root.addChild(body);
  return { root, glow: glowS, body };
}

// The Darter — a sleek lunging eel. Side-view sprite: flips L/R to face its lunge.
export function buildDarterView(elite = false, assets?: AssetStore): SpitterView {
  const root = new Container();
  const glowS = glow(elite ? 120 : 82, COLOR.coral, elite ? 0.9 : 0.72);
  if (assets?.has("darter_idle")) {
    const flip = new Container();
    root.addChild(flip);
    const idle = assets.sprite("darter_idle");
    const windup = assets.has("darter_windup") ? assets.sprite("darter_windup") : null;
    const lunge = assets.has("darter_lunge") ? assets.sprite("darter_lunge") : null;
    const recover = assets.has("darter_recover") ? assets.sprite("darter_recover") : null;
    flip.addChild(idle);
    for (const s of [windup, lunge, recover]) if (s) { s.visible = false; flip.addChild(s); }
    let face = 1;
    return {
      root, glow: glowS,
      update(e, _dt, elapsed) {
        const dir = Math.abs(e.vel.x) > 6 ? e.vel.x : 0;
        if (dir !== 0) face = dir > 0 ? -1 : 1; // art faces LEFT; flip for rightward
        flip.scale.x = face;
        const lunging = !!lunge && e.lungeTimer > 0;
        const winding = !!windup && e.telegraphTimer > 0 && !lunging;
        idle.visible = !lunging && !winding;
        if (windup) windup.visible = winding;
        if (lunge) lunge.visible = lunging;
        if (recover) recover.visible = false;
        root.scale.set(faunaBreathe(e, elapsed, elite));
      },
    };
  }
  const body = new Graphics();
  const s = elite ? 1.35 : 1, outline = elite ? COLOR.amberBright : COLOR.coral;
  body.poly([15 * s, 0, -8 * s, -8 * s, -3 * s, 0, -8 * s, 8 * s]).fill(COLOR.deepNavy).stroke({ width: 2, color: outline });
  body.poly([-3 * s, 0, -15 * s, -6 * s, -10 * s, 0, -15 * s, 6 * s]).fill(COLOR.coral);
  body.circle(6 * s, 0, 2.6 * s).fill(COLOR.amberBright);
  root.addChild(body);
  return { root, glow: glowS, body };
}
