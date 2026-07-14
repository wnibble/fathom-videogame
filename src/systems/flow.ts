// Ambient flow field — the sea drifts EVERYWHERE, not just inside the two
// authored current bands. A smooth, time-varying vector field (derived from a
// scalar streamfunction, so it swirls without sources/sinks) gives a gentle
// omnipresent current you can feel, and drives drifting flow particles so the
// whole water column visibly moves. The strong authored bands still layer on top.

import { Container, Sprite } from "pixi.js";
import type { Current, Vec2 } from "../core/types";
import { getGlowTexture } from "../engine/glow";

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
  len: number; // base streak length (varies per mote)
  thick: number; // base streak thickness
  speedMul: number; // drift pace variance
  alphaMul: number; // brightness variance
  age: number; // life-cycle so streaks fade in/out instead of persisting forever
  maxLife: number;
}

const MOTE_TINTS = [0x8fd8e8, 0xbfe8f2, 0x7fc0d4, 0x9db8d8]; // pale aqua-greys, not one color

// Faint drifting streaks advected by the flow — makes the current visible so it
// reads as a living sea instead of an invisible force. Every mote differs in
// length/thickness/pace/brightness/tint AND lives a finite life (fade in, drift,
// fade out, respawn elsewhere) so no single "wisp" can be tracked as a repeat.
// Visual-only (screen never depends on these), so seeding may use Math.random.
export class FlowParticles {
  readonly layer = new Container();
  private motes: Mote[] = [];
  private v: Vec2 = { x: 0, y: 0 };
  constructor(private field: FlowField, private currents: Current[], private bounds: { w: number; h: number }, count = 56) {
    this.layer.alpha = 0.9;
    for (let i = 0; i < count; i++) {
      const s = new Sprite(getGlowTexture());
      s.anchor.set(0.5);
      s.tint = MOTE_TINTS[i % MOTE_TINTS.length];
      s.blendMode = "add";
      s.alpha = 0;
      this.layer.addChild(s);
      const m: Mote = { x: 0, y: 0, s, len: 1, thick: 1, speedMul: 1, alphaMul: 1, age: 0, maxLife: 1 };
      this.reroll(m, true);
      this.motes.push(m);
    }
  }
  /** New identity + position; initial=true scatters ages so cycles desync. */
  private reroll(m: Mote, initial = false): void {
    m.x = Math.random() * this.bounds.w;
    m.y = Math.random() * this.bounds.h;
    m.len = 0.35 + Math.random() * 1.1;
    m.thick = 0.035 + Math.random() * 0.035;
    m.speedMul = 0.6 + Math.random() * 0.9;
    m.alphaMul = 0.5 + Math.random() * 0.7;
    m.maxLife = 5 + Math.random() * 7;
    m.age = initial ? Math.random() * m.maxLife : 0;
    m.s.tint = MOTE_TINTS[(Math.random() * MOTE_TINTS.length) | 0];
  }
  update(dt: number, t: number): void {
    for (const m of this.motes) {
      m.age += dt;
      if (m.age >= m.maxLife) this.reroll(m);
      flowAt(this.field, this.currents, m.x, m.y, t, this.v);
      const sp = Math.hypot(this.v.x, this.v.y) || 0.0001;
      // Advect at a visible pace (physics uses accel/sec²; here we treat it as a
      // velocity for the streak so slow ambient flow still reads as motion).
      m.x += this.v.x * dt * 1.6 * m.speedMul;
      m.y += this.v.y * dt * 1.6 * m.speedMul;
      // Wrap so the field is always populated.
      if (m.x < -20) m.x = this.bounds.w + 20;
      else if (m.x > this.bounds.w + 20) m.x = -20;
      if (m.y < -20) m.y = this.bounds.h + 20;
      else if (m.y > this.bounds.h + 20) m.y = -20;
      m.s.position.set(m.x, m.y);
      m.s.rotation = Math.atan2(this.v.y, this.v.x);
      // Life envelope (ease in/out) × flow-speed brightness. Whisper-faint at rest.
      const lifeT = m.age / m.maxLife;
      const env = Math.min(1, Math.min(lifeT, 1 - lifeT) * 6);
      const norm = Math.min(1, sp / 90);
      m.s.alpha = (0.035 + norm * 0.18) * m.alphaMul * env;
      m.s.scale.set(m.len * (0.28 + norm * 0.5), m.thick + norm * 0.03);
    }
  }
  destroy(): void {
    this.layer.destroy({ children: true });
    this.motes = [];
  }
}
