// HUD: score + combo (top-center), depth/best (top-right), HP + XP bar + level
// (bottom-left), dash pip (bottom-center), samples (top-left), off-screen threat
// arrows. Fully repositioned from layout(w,h) so resizing never mis-sizes it.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { COLOR } from "../palette";
import { BASE_HP, type RunState } from "../game/progression";
import { UPGRADE_BY_ID } from "../content/upgrades";

const mono = (size: number, color: number, weight: "normal" | "bold" = "normal") =>
  new TextStyle({ fontFamily: "Consolas, ui-monospace, monospace", fontSize: size, fill: color, fontWeight: weight });

export class Hud {
  readonly root = new Container();
  private bars = new Graphics();
  private threats = new Graphics();
  private scoreText: Text;
  private comboText: Text;
  private depthText: Text;
  private bestText: Text;
  private sampleText: Text;
  private levelText: Text;
  private buildText: Text;
  private hintText: Text;
  private w = 1280;
  private h = 720;
  private hintTimer = 8;

  constructor() {
    this.scoreText = new Text({ text: "0", style: mono(30, COLOR.amberBright, "bold") });
    this.comboText = new Text({ text: "", style: mono(15, COLOR.coralBright, "bold") });
    this.depthText = new Text({ text: "DEPTH 0 m", style: mono(18, COLOR.aquaBright, "bold") });
    this.bestText = new Text({ text: "BEST 0 m", style: mono(12, COLOR.teal) });
    this.sampleText = new Text({ text: "◈ 0", style: mono(16, COLOR.sample, "bold") });
    this.levelText = new Text({ text: "LV 1", style: mono(13, COLOR.aqua, "bold") });
    this.buildText = new Text({ text: "", style: mono(12, COLOR.teal) });
    this.hintText = new Text({ text: "WASD move · mouse aim · click fire · Shift dash · Esc pause   —   warm = danger, cool = you", style: mono(12, 0x5a7a9a) });
    this.scoreText.anchor.set(0.5, 0);
    this.comboText.anchor.set(0.5, 0);
    this.root.addChild(this.bars, this.threats, this.scoreText, this.comboText, this.depthText, this.bestText, this.sampleText, this.levelText, this.buildText, this.hintText);
  }

  layout(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.hintText.position.set(20, 16);
    this.sampleText.position.set(20, 40);
    this.scoreText.position.set(w / 2, 12);
    this.comboText.position.set(w / 2, 48);
    this.depthText.position.set(w - this.depthText.width - 20, 16);
    this.bestText.position.set(w - this.bestText.width - 20, 40);
    this.levelText.position.set(20, h - 70);
  }

  setThreats(markers: { x: number; y: number; angle: number }[]): void {
    this.threats.clear();
    for (const m of markers) {
      // Keep arrows out of the top-center score/combo zone so they never overlap it.
      if (m.y < 96 && Math.abs(m.x - this.w / 2) < 140) m.y = 100;
      const a = m.angle;
      const s = 9;
      const l = a + 2.5;
      const r = a - 2.5;
      this.threats
        .poly([m.x + Math.cos(a) * s, m.y + Math.sin(a) * s, m.x + Math.cos(l) * s, m.y + Math.sin(l) * s, m.x + Math.cos(r) * s, m.y + Math.sin(r) * s])
        .fill({ color: COLOR.coralBright, alpha: 0.9 });
    }
  }

  update(run: RunState, hp: number, maxHp: number, shield: number, shieldMax: number, depth: number, best: number, dashFrac: number, dt: number): void {
    const w = this.w;
    const h = this.h;
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      this.hintText.alpha = Math.max(0, Math.min(1, this.hintTimer));
    }

    this.scoreText.text = `${Math.floor(run.score.score)}`;
    this.scoreText.position.set(w / 2, 12);
    const c = run.score;
    if (c.combo > 0) {
      this.comboText.visible = true;
      this.comboText.text = `${c.combo}  ×${c.multiplier.toFixed(1)}`;
      this.comboText.position.set(w / 2, 48);
    } else {
      this.comboText.visible = false;
    }

    this.depthText.text = `DEPTH ${Math.floor(depth)} m`;
    this.bestText.text = `BEST ${Math.floor(best)} m`;
    this.depthText.position.set(w - this.depthText.width - 20, 16);
    this.bestText.position.set(w - this.bestText.width - 20, 40);
    this.sampleText.text = `◈ ${run.samples}`;
    this.levelText.text = `LV ${run.xp.level}`;

    // Build readout — owned in-run upgrades, compact (power made visible).
    const stacks = Object.entries(run.stacks).filter(([, n]) => n > 0);
    this.buildText.text = stacks.length
      ? stacks.slice(0, 6).map(([id, n]) => `${(UPGRADE_BY_ID[id]?.name ?? id).split(" ")[0]}×${n}`).join("  ") + (stacks.length > 6 ? " +" + (stacks.length - 6) : "")
      : "";

    const g = this.bars;
    g.clear();
    const bx = 20;
    // HP bar width scales with max HP (power is visible), clamped.
    const hpW = Math.round(Math.max(160, Math.min(360, 200 + (maxHp - BASE_HP) * 0.9)));
    const hpY = h - 52;
    g.roundRect(bx, hpY, hpW, 14, 4).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    const r = Math.max(0, Math.min(1, hp / maxHp));
    if (r > 0) g.roundRect(bx + 1, hpY + 1, (hpW - 2) * r, 12, 3).fill(r > 0.35 ? COLOR.hpFull : COLOR.hpLow);

    // Shield bar — only when unlocked; sits above HP, capacity-tick segments.
    if (shieldMax > 0) {
      const shW = Math.round(Math.max(120, Math.min(360, 120 + shieldMax * 1.2)));
      const shY = hpY - 14;
      g.roundRect(bx, shY, shW, 10, 3).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
      const sr = Math.max(0, Math.min(1, shield / shieldMax));
      if (sr > 0) g.roundRect(bx + 1, shY + 1, (shW - 2) * sr, 8, 2).fill(COLOR.aqua);
      for (let seg = 30; seg < shieldMax; seg += 30) {
        const sx = bx + 1 + (shW - 2) * (seg / shieldMax);
        g.rect(sx, shY + 1, 1, 8).fill({ color: COLOR.deepNavy, alpha: 0.8 });
      }
    }

    // XP bar below HP; LV + build labels tucked above the HP bar.
    const xpY = h - 34;
    const xpFrac = Math.max(0, Math.min(1, run.xp.xp / run.xp.xpToNext));
    g.roundRect(bx, xpY, 200, 10, 3).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    if (xpFrac > 0) g.roundRect(bx + 1, xpY + 1, (200 - 2) * xpFrac, 8, 2).fill(COLOR.sample);
    this.levelText.position.set(bx, shieldMax > 0 ? hpY - 30 : hpY - 18);
    this.buildText.position.set(bx + 44, shieldMax > 0 ? hpY - 30 : hpY - 18);

    if (c.combo > 0) {
      const cw = 90;
      const ct = Math.max(0, Math.min(1, c.comboTimer / 5));
      g.roundRect(w / 2 - cw / 2, 72, cw * ct, 3, 1).fill(COLOR.coralBright);
    }
    const ready = dashFrac <= 0;
    g.circle(w / 2, h - 30, 9).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    g.circle(w / 2, h - 30, 6).fill({ color: ready ? COLOR.aquaBright : COLOR.navy, alpha: ready ? 1 : 0.6 });
  }
}
