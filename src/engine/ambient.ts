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
  baseAlpha?: number; // snow: twinkle anchor
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
        const baseAlpha = tier.alpha * (0.7 + Math.random() * 0.6); // per-mote brightness
        s.alpha = baseAlpha;
        s.scale.set((tier.size * (1.4 + Math.random() * 1.2)) / 128); // per-mote size
        this.root.addChild(s);
        this.motes.push({ s, vy: tier.vy * (0.75 + Math.random() * 0.5), swayAmp: 8 + Math.random() * 14, swayFreq: 0.4 + Math.random() * 0.6, phase: Math.random() * Math.PI * 2, baseAlpha });
      }
    }
    for (let i = 0; i < 10; i++) {
      const s = new Sprite(getGlowTexture());
      s.anchor.set(0.5);
      s.tint = 0x9fe6ff;
      s.blendMode = "add";
      this.root.addChild(s);
      const b: Mote = { s, vy: 0, swayAmp: 0, swayFreq: 0, phase: 0 };
      this.rerollBubble(b);
      this.bubbles.push(b);
    }
  }

  /** Fresh identity per ascent so no bubble reads as the same one on repeat. */
  private rerollBubble(b: Mote): void {
    b.vy = -(10 + Math.random() * 34);
    b.swayAmp = 8 + Math.random() * 22;
    b.swayFreq = 0.5 + Math.random() * 1.1;
    b.phase = Math.random() * Math.PI * 2;
    b.s.alpha = 0.07 + Math.random() * 0.14;
    const size = 1.4 + Math.random() * 5;
    b.s.scale.set((size * 2) / 128);
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
      // Gentle twinkle — catching stray light as it falls.
      if (m.baseAlpha !== undefined) m.s.alpha = m.baseAlpha * (0.75 + 0.25 * Math.sin(this.t * (m.swayFreq * 1.7) + m.phase * 2));
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
        this.rerollBubble(b); // new size/pace/brightness every ascent
        b.s.y = h + 8;
        b.s.x = Math.random() * w;
      }
    }
  }
}
