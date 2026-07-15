// Procedural audio (WebAudio) — no asset files. Small synth of game SFX + a low
// ambient drone that deepens as you descend. Must be resumed on a user gesture
// (browser autoplay policy), which main.ts does on first input.

export class Audio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private drone: { osc: OscillatorNode; gain: GainNode } | null = null;
  enabled = true;

  init(): void {
    if (this.ctx) return;
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.32;
    this.master.connect(this.ctx.destination);
  }
  resume(): void {
    this.init();
    if (this.ctx?.state === "suspended") void this.ctx.resume();
  }
  setEnabled(v: boolean): void {
    this.enabled = v;
    if (this.master) this.master.gain.value = v ? 0.32 : 0;
  }

  private get t(): number {
    return this.ctx!.currentTime;
  }

  // A pitched blip, optionally sliding, through a gain envelope.
  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t = this.t;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol: number, cutoff = 1800): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const t = this.t;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = cutoff;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  shoot(): void {
    this.tone(720, 0.05, "square", 0.03, 900);
  }
  playerHit(): void {
    this.noise(0.18, 0.25, 1200);
    this.tone(160, 0.2, "sawtooth", 0.15, 90);
  }
  enemyHit(): void {
    this.tone(420, 0.04, "square", 0.03, 520);
  }
  kill(): void {
    this.tone(300, 0.14, "triangle", 0.12, 120);
    this.noise(0.1, 0.1);
  }
  dash(): void {
    this.noise(0.16, 0.14, 2400);
    this.tone(300, 0.16, "sine", 0.06, 720);
  }
  // ---- pickup sounds: rate-limited + rising-pitch ladder ----
  // Mass-collection used to machine-gun identical blips (awful). Now: minimum
  // gap between blips, and consecutive pickups climb a pentatonic ladder that
  // resets after a beat of silence — a hoover becomes an arpeggio.
  private lastPickupAt = 0;
  private pickupStep = 0;
  private pickupLadder(base: number, vol: number): void {
    if (!this.ctx) return;
    const now = this.t;
    if (now - this.lastPickupAt > 0.55) this.pickupStep = 0; // ladder resets
    if (now - this.lastPickupAt < 0.07) return; // too soon — swallow the blip
    this.lastPickupAt = now;
    const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // pentatonic-ish semitones
    const step = LADDER[Math.min(this.pickupStep, LADDER.length - 1)];
    this.pickupStep++;
    const f = base * Math.pow(2, step / 12);
    this.tone(f, 0.07, "sine", vol, f * 1.25);
  }
  pickup(): void {
    this.pickupLadder(880, 0.08);
  }
  sample(): void {
    this.pickupLadder(990, 0.05);
  }
  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.16, "triangle", 0.12), i * 70));
  }
  relic(): void {
    [659, 988, 1319].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, "sine", 0.1), i * 90));
  }
  lowHp(): void {
    this.tone(220, 0.25, "sawtooth", 0.1, 180);
  }
  uiMove(): void {
    this.tone(520, 0.04, "square", 0.04);
  }
  uiConfirm(): void {
    this.tone(660, 0.08, "square", 0.07, 880);
  }

  /** Ambient descent drone; call as depth changes to lower the pitch. */
  setDepth(depth: number): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const freq = Math.max(38, 70 - depth * 0.02);
    if (!this.drone) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sine";
      gain.gain.value = 0.05;
      osc.frequency.value = freq;
      osc.connect(gain).connect(this.master);
      osc.start();
      this.drone = { osc, gain };
    } else {
      this.drone.osc.frequency.setTargetAtTime(freq, this.t, 0.5);
    }
  }
  stopDrone(): void {
    if (this.drone) {
      try {
        this.drone.osc.stop();
      } catch {
        /* already stopped */
      }
      this.drone = null;
    }
    this.stopAtmosphere();
  }

  // ---- atmosphere: an evolving pad per stratum + distant sea events ----
  private pad: { oscs: OscillatorNode[]; gain: GainNode; lfo: OscillatorNode } | null = null;
  private atmosTimer: ReturnType<typeof setInterval> | null = null;
  private atmosStratum = -1;

  /** Per-stratum chord roots (Hz) — cool open dyads shallow, darker low deep. */
  private static PAD_CHORDS: number[][] = [
    [110, 165, 220], // s0 Twilight — A dyad, open water
    [98, 147, 196], // s1 Kelp — G, verdant
    [82.4, 123.5, 164.8], // s2 Wreck — E, hollow
    [92.5, 138.6, 185], // s3 Vents — F#, uneasy
    [73.4, 110, 146.8], // s4 Abyss — D, vast
    [65.4, 98, 130.8], // s5 Cradle — C, the bottom
  ];

  /** Start/retune the ambient pad + distant events for a stratum. */
  setAtmosphere(stratum: number): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const chord = Audio.PAD_CHORDS[Math.max(0, Math.min(Audio.PAD_CHORDS.length - 1, stratum))];
    this.atmosStratum = stratum;
    if (!this.pad) {
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0;
      const filt = this.ctx.createBiquadFilter();
      filt.type = "lowpass";
      filt.frequency.value = 420;
      // Slow breathing on the pad volume — the sea inhales.
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.value = 0.05;
      lfoGain.gain.value = 0.012;
      lfo.connect(lfoGain).connect(gain.gain);
      lfo.start();
      const oscs = chord.map((f, i) => {
        const o = this.ctx!.createOscillator();
        o.type = i === 0 ? "sine" : "triangle";
        o.frequency.value = f * (1 + (i - 1) * 0.0015); // gentle detune shimmer
        o.connect(filt);
        o.start();
        return o;
      });
      filt.connect(gain).connect(this.master);
      gain.gain.setTargetAtTime(0.028, this.t, 2.5); // fade in over seconds
      this.pad = { oscs, gain, lfo };
    } else {
      // Retune the existing pad to the new stratum's chord (slow glide).
      this.pad.oscs.forEach((o, i) => {
        if (chord[i]) o.frequency.setTargetAtTime(chord[i] * (1 + (i - 1) * 0.0015), this.t, 1.8);
      });
    }
    // Distant events every 9-22s: whale calls in open strata, creaks in the
    // industrial ones, crystalline shimmer at the bottom.
    if (this.atmosTimer) clearInterval(this.atmosTimer);
    this.atmosTimer = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      if (Math.random() < 0.45) return; // sometimes the sea says nothing
      const s = this.atmosStratum;
      const roll = Math.random();
      if (s >= 2 && s <= 3 && roll < 0.5) this.creak();
      else if (s >= 5 && roll < 0.5) this.shimmer();
      else this.whaleCall();
    }, 9000 + Math.random() * 13000);
  }

  stopAtmosphere(): void {
    if (this.atmosTimer) {
      clearInterval(this.atmosTimer);
      this.atmosTimer = null;
    }
    if (this.pad) {
      const p = this.pad;
      p.gain.gain.setTargetAtTime(0.0001, this.t, 0.6);
      setTimeout(() => {
        try {
          p.oscs.forEach((o) => o.stop());
          p.lfo.stop();
        } catch {
          /* already stopped */
        }
      }, 2500);
      this.pad = null;
    }
  }

  /** A far-off leviathan — low moan with slow vibrato, barely there. */
  private whaleCall(): void {
    if (!this.ctx || !this.master) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const vib = this.ctx.createOscillator();
    const vibGain = this.ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(62, t + 2.6);
    vib.frequency.value = 4.5;
    vibGain.gain.value = 3;
    vib.connect(vibGain).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.9);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g).connect(this.master);
    vib.start(t);
    o.start(t);
    o.stop(t + 3.4);
    vib.stop(t + 3.4);
  }

  /** Hull groan for the industrial strata. */
  private creak(): void {
    if (!this.ctx || !this.master) return;
    const t = this.t;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const f = this.ctx.createBiquadFilter();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(55 + Math.random() * 30, t);
    o.frequency.linearRampToValueAtTime(40 + Math.random() * 20, t + 1.4);
    f.type = "bandpass";
    f.frequency.value = 210;
    f.Q.value = 9;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 1.8);
  }

  /** Crystalline ring for the Cradle. */
  private shimmer(): void {
    if (!this.ctx || !this.master) return;
    [1318, 1568, 1976].forEach((f, i) => {
      setTimeout(() => this.tone(f, 1.4, "sine", 0.02), i * 160);
    });
  }
}

export const audio = new Audio();
