// Themed loader (Part 5 §14): a descending depth-gauge fills with REAL progress,
// with a rotating codex tip — the loader is worldbuilding, not a spinner.

import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { COLOR } from "../palette";

const TIPS = [
  "The deep is beautiful. It is also patient.",
  "Everything that glows is telling you something. Read it.",
  "You always surface with something — even if it is only a deeper record.",
  "Warm light is danger. Cool light is yours.",
  "A wind-up always precedes a shot. Watch for it.",
];

export class Loader {
  readonly root = new Container();
  private gauge = new Graphics();
  private title: Text;
  private tip: Text;
  private pct: Text;

  constructor() {
    this.title = new Text({
      text: "FATHOM",
      style: new TextStyle({ fontFamily: "Consolas, monospace", fontSize: 44, fill: COLOR.aquaBright, fontWeight: "bold", letterSpacing: 8 }),
    });
    this.tip = new Text({
      text: TIPS[0],
      style: new TextStyle({ fontFamily: "Consolas, monospace", fontSize: 15, fill: COLOR.teal, fontStyle: "italic" }),
    });
    this.pct = new Text({
      text: "DIVING… 0%",
      style: new TextStyle({ fontFamily: "Consolas, monospace", fontSize: 14, fill: COLOR.amber }),
    });
    this.root.addChild(this.gauge, this.title, this.tip, this.pct);
  }

  pickTip(i: number): void {
    this.tip.text = TIPS[i % TIPS.length];
  }

  update(progress: number, w: number, h: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const cx = w / 2;
    this.title.position.set(cx - this.title.width / 2, h * 0.32);
    this.tip.position.set(cx - this.tip.width / 2, h * 0.32 + 66);

    // Vertical depth gauge that fills downward.
    const gx = cx - 6;
    const gy = h * 0.52;
    const gh = h * 0.2;
    this.gauge.clear();
    this.gauge.roundRect(gx, gy, 12, gh, 6).fill({ color: COLOR.deepNavy, alpha: 0.9 }).stroke({ width: 1, color: COLOR.navy });
    this.gauge.roundRect(gx + 1, gy + 1, 10, (gh - 2) * p, 5).fill(COLOR.aqua);
    // sinking marker
    this.gauge.circle(gx + 6, gy + (gh - 2) * p + 1, 5).fill(COLOR.aquaBright);

    this.pct.text = `DIVING… ${Math.round(p * 100)}%`;
    this.pct.position.set(cx - this.pct.width / 2, gy + gh + 16);
  }
}
