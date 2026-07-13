// Floating combat text — damage numbers, score pops, combo flourishes. Pooled
// (Text objects are reused, never churned) so a bullet-hell's hit-rate never
// stutters. World-space: they rise from the point of impact and drift with the
// camera. The satisfying "chip damage" readout every good action game has.

import { Container, Text, TextStyle } from "pixi.js";

interface Floater {
  t: Text;
  age: number;
  life: number;
  vx: number;
  vy: number;
  active: boolean;
  baseSize: number;
}

const CAP = 72;

export class Floaters {
  private pool: Floater[] = [];
  constructor(private layer: Container) {}

  spawn(x: number, y: number, text: string, color: number, size = 12, pop = false): void {
    let f = this.pool.find((p) => !p.active);
    if (!f) {
      if (this.pool.length >= CAP) return; // hard cap — drop excess rather than churn
      const t = new Text({ text: "", style: new TextStyle({ fontFamily: "Consolas, monospace", fontSize: 16, fontWeight: "bold", fill: 0xffffff }) });
      t.anchor.set(0.5);
      this.layer.addChild(t);
      f = { t, age: 0, life: 0, vx: 0, vy: 0, active: false, baseSize: 16 };
      this.pool.push(f);
    }
    f.t.text = text;
    f.t.tint = color;
    f.t.visible = true;
    f.t.alpha = 1;
    f.t.position.set(x + (this.hash(x + y) - 0.5) * 14, y - 6);
    f.t.scale.set((size / 16) * (pop ? 1.35 : 1));
    f.baseSize = size;
    f.age = 0;
    f.life = pop ? 0.8 : 0.55;
    f.vx = (this.hash(x * 1.7 + y) - 0.5) * 22;
    f.vy = pop ? -46 : -38;
    f.active = true;
  }

  private hash(n: number): number {
    const s = Math.sin(n * 12.9898) * 43758.5453;
    return s - Math.floor(s);
  }

  update(dt: number): void {
    for (const f of this.pool) {
      if (!f.active) continue;
      f.age += dt;
      const k = f.age / f.life;
      if (k >= 1) {
        f.active = false;
        f.t.visible = false;
        continue;
      }
      f.vy += 42 * dt; // gravity — the number arcs up then settles
      f.t.position.x += f.vx * dt;
      f.t.position.y += f.vy * dt;
      f.t.alpha = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      // A quick pop-in on the first slice, then hold.
      const s = (f.baseSize / 16) * (1 + 0.25 * Math.max(0, 1 - k * 6));
      f.t.scale.set(s);
    }
  }

  clear(): void {
    for (const f of this.pool) {
      f.active = false;
      f.t.visible = false;
    }
  }

  destroy(): void {
    for (const f of this.pool) f.t.destroy();
    this.pool = [];
  }
}
