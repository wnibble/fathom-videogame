// HUD: score + combo (top-center), depth/best (top-right), HP + XP bar + level
// (bottom-left), dash pip (bottom-center), samples (top-left), off-screen threat
// arrows. Fully repositioned from layout(w,h) so resizing never mis-sizes it.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { COLOR } from "../palette";
import type { RunState } from "../game/progression";

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
    this.hintText = new Text({ text: "WASD move · mouse aim · click fire · Shift dash · Esc pause", style: mono(12, 0x5a7a9a) });
    this.scoreText.anchor.set(0.5, 0);
    this.comboText.anchor.set(0.5, 0);
    this.root.addChild(this.bars, this.threats, this.scoreText, this.comboText, this.depthText, this.bestText, this.sampleText, this.levelText, this.hintText);
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
      const a = m.angle;
      const s = 9;
      const l = a + 2.5;
      const r = a - 2.5;
      this.threats
        .poly([m.x + Math.cos(a) * s, m.y + Math.sin(a) * s, m.x + Math.cos(l) * s, m.y + Math.sin(l) * s, m.x + Math.cos(r) * s, m.y + Math.sin(r) * s])
        .fill({ color: COLOR.coralBright, alpha: 0.9 });
    }
  }

  update(run: RunState, hpRatio: number, depth: number, best: number, dashFrac: number, dt: number): void {
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
    this.levelText.position.set(20, h - 70);

    // bars
    const g = this.bars;
    g.clear();
    // HP
    const bx = 20;
    const bw = 240;
    const hpY = h - 52;
    g.roundRect(bx, hpY, bw, 14, 4).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    const r = Math.max(0, Math.min(1, hpRatio));
    if (r > 0) g.roundRect(bx + 1, hpY + 1, (bw - 2) * r, 12, 3).fill(r > 0.35 ? COLOR.hpFull : COLOR.hpLow);
    // XP
    const xpY = h - 34;
    const xpFrac = Math.max(0, Math.min(1, run.xp.xp / run.xp.xpToNext));
    g.roundRect(bx, xpY, bw, 10, 3).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    if (xpFrac > 0) g.roundRect(bx + 1, xpY + 1, (bw - 2) * xpFrac, 8, 2).fill(COLOR.sample);
    // combo timer bar under combo pill
    if (c.combo > 0) {
      const cw = 90;
      const ct = Math.max(0, Math.min(1, c.comboTimer / 5));
      g.roundRect(w / 2 - cw / 2, 72, cw * ct, 3, 1).fill(COLOR.coralBright);
    }
    // dash pip (bottom-center)
    const ready = dashFrac <= 0;
    const pipX = w / 2;
    const pipY = h - 30;
    g.circle(pipX, pipY, 9).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    g.circle(pipX, pipY, 6).fill({ color: ready ? COLOR.aquaBright : COLOR.navy, alpha: ready ? 1 : 0.6 });
  }
}
