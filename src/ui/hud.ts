// HUD: health, depth gauge, sample count. Screen-space (uiRoot). Kept legible and
// out of the play area (Part 5 §15).

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { COLOR } from "../palette";

const mono = (size: number, color: number, weight: "normal" | "bold" = "normal") =>
  new TextStyle({ fontFamily: "Consolas, ui-monospace, monospace", fontSize: size, fill: color, fontWeight: weight });

export class Hud {
  readonly root = new Container();
  private hp = new Graphics();
  private depthText: Text;
  private bestText: Text;
  private sampleText: Text;
  private hintText: Text;

  constructor() {
    this.depthText = new Text({ text: "DEPTH 0 m", style: mono(20, COLOR.aquaBright, "bold") });
    this.bestText = new Text({ text: "BEST 0 m", style: mono(13, COLOR.teal) });
    this.sampleText = new Text({ text: "◈ 0", style: mono(16, COLOR.amberBright, "bold") });
    this.hintText = new Text({ text: "WASD move · mouse aim · click/space fire", style: mono(12, 0x5a7a9a) });
    this.root.addChild(this.hp, this.depthText, this.bestText, this.sampleText, this.hintText);
  }

  layout(w: number, _h: number): void {
    this.depthText.position.set(w - this.depthText.width - 20, 16);
    this.bestText.position.set(w - this.bestText.width - 20, 42);
    this.sampleText.position.set(20, 44);
    this.hintText.position.set(20, 16);
  }

  update(hpRatio: number, depth: number, best: number, samples: number, w: number): void {
    const barW = 220;
    const barH = 16;
    const x = 20;
    const y = 70;
    this.hp.clear();
    this.hp.roundRect(x, y, barW, barH, 4).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    const r = Math.max(0, Math.min(1, hpRatio));
    const col = r > 0.35 ? COLOR.hpFull : COLOR.hpLow;
    if (r > 0) this.hp.roundRect(x + 1, y + 1, (barW - 2) * r, barH - 2, 3).fill(col);

    this.depthText.text = `DEPTH ${Math.floor(depth)} m`;
    this.bestText.text = `BEST ${Math.floor(best)} m`;
    this.sampleText.text = `◈ ${samples}`;
    this.depthText.position.set(w - this.depthText.width - 20, 16);
    this.bestText.position.set(w - this.bestText.width - 20, 42);
  }
}
