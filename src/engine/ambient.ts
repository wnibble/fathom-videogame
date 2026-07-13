// Marine snow — drifting particulate that gives the water DIMENSION and life.
// Screen-space, parallax depth tiers (far = tiny/slow/dim, near = bigger/faster/
// brighter), soft pale motes on NORMAL blend (not additive — this is texture, not
// glow). Runs everywhere (dive, station, menu) so the whole world feels underwater.

import { Container, Sprite } from "pixi.js";
import { getGlowTexture } from "./glow";

interface Mote {
  s: Sprite;
  vy: number;
  swayAmp: number;
  swayFreq: number;
  phase: number;
}

const TIERS = [
  { size: 2, alpha: 0.1, vy: 6, count: 34 }, // far
  { size: 3.5, alpha: 0.16, vy: 11, count: 24 }, // mid
  { size: 6, alpha: 0.22, vy: 18, count: 14 }, // near
];

export class MarineSnow {
  readonly root = new Container();
  private motes: Mote[] = [];
  private bubbles: Mote[] = []; // rising, additive — they catch the light
  private w = 1280;
  private h = 720;
  private t = 0;

  constructor() {
    for (const tier of TIERS) {
      for (let i = 0; i < tier.count; i++) {
        const s = new Sprite(getGlowTexture());
        s.anchor.set(0.5);
        s.tint = 0xbcd6ea;
        s.alpha = tier.alpha;
        s.scale.set((tier.size * 2) / 128);
        this.root.addChild(s);
        this.motes.push({ s, vy: tier.vy, swayAmp: 8 + Math.random() * 14, swayFreq: 0.4 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2 });
      }
    }
    for (let i = 0; i < 12; i++) {
      const s = new Sprite(getGlowTexture());
      s.anchor.set(0.5);
      s.tint = 0x9fe6ff;
      s.blendMode = "add";
      s.alpha = 0.12 + Math.random() * 0.12;
      const size = 2 + Math.random() * 4;
      s.scale.set((size * 2) / 128);
      this.root.addChild(s);
      this.bubbles.push({ s, vy: -(14 + Math.random() * 26), swayAmp: 10 + Math.random() * 18, swayFreq: 0.6 + Math.random() * 0.9, phase: Math.random() * Math.PI * 2 });
    }
  }

  reseed(w: number, h: number): void {
    this.w = w;
    this.h = h;
    for (const m of this.motes) m.s.position.set(Math.random() * w, Math.random() * h);
    for (const b of this.bubbles) b.s.position.set(Math.random() * w, Math.random() * h);
  }

  update(dt: number, w: number, h: number): void {
    if (w !== this.w || h !== this.h) {
      this.w = w;
      this.h = h;
    }
    this.t += dt;
    for (const m of this.motes) {
      m.s.y += m.vy * dt;
      m.s.x += Math.sin(this.t * m.swayFreq + m.phase) * m.swayAmp * dt;
      if (m.s.y > h + 8) {
        m.s.y = -8;
        m.s.x = Math.random() * w;
      }
      if (m.s.x < -8) m.s.x = w + 8;
      else if (m.s.x > w + 8) m.s.x = -8;
    }
    for (const b of this.bubbles) {
      b.s.y += b.vy * dt; // rises
      b.s.x += Math.sin(this.t * b.swayFreq + b.phase) * b.swayAmp * dt;
      if (b.s.y < -8) {
        b.s.y = h + 8;
        b.s.x = Math.random() * w;
      }
    }
  }
}
