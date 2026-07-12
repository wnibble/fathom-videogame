// Lightweight scripted sequencer (Part 3 / Part 5 §13). A cutscene is an ordered
// list of timed steps. Data-driven, fully skippable, never locks input > the step
// it's on. The engine here is generic; beats live in content/.

export interface CutsceneCtx {
  layer: import("pixi.js").Container;
  width: number;
  height: number;
}

export interface CutsceneStep {
  duration: number; // seconds
  enter?(ctx: CutsceneCtx): void;
  update?(ctx: CutsceneCtx, t01: number): void; // progress 0..1
  exit?(ctx: CutsceneCtx): void;
}

export class Cutscene {
  private i = 0;
  private t = 0;
  private started = false;
  done = false;

  constructor(private steps: CutsceneStep[], private ctx: CutsceneCtx) {
    if (steps.length === 0) this.done = true;
  }

  update(dt: number): void {
    if (this.done) return;
    const step = this.steps[this.i];
    if (!this.started) {
      step.enter?.(this.ctx);
      this.started = true;
    }
    this.t += dt;
    const t01 = step.duration > 0 ? Math.min(1, this.t / step.duration) : 1;
    step.update?.(this.ctx, t01);
    if (this.t >= step.duration) {
      step.exit?.(this.ctx);
      this.i++;
      this.t = 0;
      this.started = false;
      if (this.i >= this.steps.length) this.done = true;
    }
  }

  /** Hold-to-skip: run remaining exits so nothing is left half-shown. */
  skip(): void {
    if (this.done) return;
    if (this.started) this.steps[this.i].exit?.(this.ctx);
    for (let j = this.i + 1; j < this.steps.length; j++) {
      this.steps[j].enter?.(this.ctx);
      this.steps[j].exit?.(this.ctx);
    }
    this.done = true;
  }
}
