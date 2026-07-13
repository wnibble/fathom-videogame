// Ambient flow field — the sea drifts EVERYWHERE, not just inside the two
// authored current bands. A smooth, time-varying vector field (derived from a
// scalar streamfunction, so it swirls without sources/sinks) gives a gentle
// omnipresent current you can feel, and drives drifting flow particles so the
// whole water column visibly moves. The strong authored bands still layer on top.

import { Container, Sprite } from "pixi.js";
import type { Current, Vec2 } from "../core/types";
import { getGlowTexture } from "../engine/glow";
import { COLOR } from "../palette";

export class FlowField {
  private ax: number;
  private ay: number;
  private bx: number;
  private by: number;
  private ph: number;
  constructor(
    public strength: number, // px/sec^2 ambient drift magnitude (keep small — a nudge, not a shove)
    public bias: Vec2, // prevailing direction the whole stratum leans
    seed: number
  ) {
    // Deterministic per-stratum spatial frequencies + phase (no Math.random).
    const r = (n: number) => {
      const s = Math.sin(seed * 0.017 + n * 12.9898) * 43758.5453;
      return s - Math.floor(s);
    };
    this.ax = 0.0015 + r(1) * 0.0011;
    this.ay = 0.0014 + r(2) * 0.0011;
    this.bx = 0.0009 + r(3) * 0.0008;
    this.by = 0.0011 + r(4) * 0.0008;
    this.ph = r(5) * Math.PI * 2;
  }
  // Incompressible-ish swirl: velocity from the curl of a scalar streamfunction.
  sample(x: number, y: number, t: number, out: Vec2): Vec2 {
    const vx = Math.cos(x * this.ax + t * 0.23 + this.ph) * Math.sin(y * this.ay + t * 0.17);
    const vy = -Math.sin(x * this.bx + t * 0.19) * Math.cos(y * this.by + t * 0.21 + this.ph);
    out.x = this.bias.x + vx * this.strength;
    out.y = this.bias.y + vy * this.strength;
    return out;
  }
}

// Combined flow at a point: ambient field + any authored band you're standing in.
export function flowAt(field: FlowField, currents: Current[], x: number, y: number, t: number, out: Vec2): Vec2 {
  field.sample(x, y, t, out);
  for (const c of currents) {
    if (Math.abs(x - c.pos.x) <= c.half.x && Math.abs(y - c.pos.y) <= c.half.y) {
      out.x += c.force.x;
      out.y += c.force.y;
    }
  }
  return out;
}

interface Mote {
  x: number;
  y: number;
  s: Sprite;
  len: number;
}

// Faint drifting streaks advected by the flow — makes the current visible so it
// reads as a living sea instead of an invisible force. Visual-only (screen never
// depends on these), so seeding may use Math.random.
export class FlowParticles {
  readonly layer = new Container();
  private motes: Mote[] = [];
  private v: Vec2 = { x: 0, y: 0 };
  constructor(private field: FlowField, private currents: Current[], private bounds: { w: number; h: number }, count = 80) {
    this.layer.alpha = 0.9;
    for (let i = 0; i < count; i++) {
      const s = new Sprite(getGlowTexture());
      s.anchor.set(0.5);
      s.tint = COLOR.aquaBright;
      s.blendMode = "add";
      const len = 0.5 + Math.random() * 0.9;
      s.scale.set(len * 0.34, 0.055);
      s.alpha = 0;
      this.layer.addChild(s);
      this.motes.push({ x: Math.random() * bounds.w, y: Math.random() * bounds.h, s, len });
    }
  }
  update(dt: number, t: number): void {
    for (const m of this.motes) {
      flowAt(this.field, this.currents, m.x, m.y, t, this.v);
      const sp = Math.hypot(this.v.x, this.v.y) || 0.0001;
      // Advect at a visible pace (physics uses accel/sec²; here we treat it as a
      // velocity for the streak so slow ambient flow still reads as motion).
      m.x += this.v.x * dt * 1.6;
      m.y += this.v.y * dt * 1.6;
      // Wrap so the field is always populated.
      if (m.x < -20) m.x = this.bounds.w + 20;
      else if (m.x > this.bounds.w + 20) m.x = -20;
      if (m.y < -20) m.y = this.bounds.h + 20;
      else if (m.y > this.bounds.h + 20) m.y = -20;
      m.s.position.set(m.x, m.y);
      m.s.rotation = Math.atan2(this.v.y, this.v.x);
      // Faster flow → brighter, longer streak. Ambient drift stays whisper-faint.
      const norm = Math.min(1, sp / 90);
      m.s.alpha = 0.04 + norm * 0.22;
      m.s.scale.set(m.len * (0.28 + norm * 0.5), 0.05 + norm * 0.03);
    }
  }
  destroy(): void {
    this.layer.destroy({ children: true });
    this.motes = [];
  }
}
