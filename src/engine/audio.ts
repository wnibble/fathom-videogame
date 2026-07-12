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
  pickup(): void {
    this.tone(880, 0.09, "sine", 0.09, 1240);
  }
  sample(): void {
    this.tone(1000, 0.06, "sine", 0.05, 1300);
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
  }
}

export const audio = new Audio();
