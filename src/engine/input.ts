// Input: keyboard + mouse twin-stick. WASD/arrows move; mouse aims; LMB/space
// fires. Remap-ready (keys are a map), gamepad/touch deferred to a later pass.
// Acceptance: identical feel across the supported devices this pass (kbd+mouse).

import type { Vec2 } from "../core/types";

export interface InputState {
  move: Vec2; // normalized move intent
  aim: Vec2; // world-space aim point (set by the game each frame from screen→world)
  aimScreen: Vec2; // raw screen-space mouse
  firing: boolean;
  skip: boolean; // hold-to-skip (cutscenes)
  anyKey: boolean;
}

const KEYS = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  fire: ["Space"],
  skip: ["Enter", "Escape"],
};

export class Input {
  readonly state: InputState = {
    move: { x: 0, y: 0 },
    aim: { x: 0, y: 0 },
    aimScreen: { x: 0, y: 0 },
    firing: false,
    skip: false,
    anyKey: false,
  };
  private down = new Set<string>();
  private mouseDown = false;

  attach(canvas: HTMLCanvasElement): void {
    window.addEventListener("keydown", (e) => {
      this.down.add(e.code);
      this.state.anyKey = true;
      if (KEYS.fire.includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.down.delete(e.code));
    window.addEventListener("blur", () => {
      this.down.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener("mousemove", (e) => {
      const r = canvas.getBoundingClientRect();
      this.state.aimScreen.x = e.clientX - r.left;
      this.state.aimScreen.y = e.clientY - r.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouseDown = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Call once per frame to resolve the current intent. */
  update(): void {
    const held = (list: string[]) => list.some((k) => this.down.has(k));
    let x = 0;
    let y = 0;
    if (held(KEYS.left)) x -= 1;
    if (held(KEYS.right)) x += 1;
    if (held(KEYS.up)) y -= 1;
    if (held(KEYS.down)) y += 1;
    const len = Math.hypot(x, y) || 1;
    this.state.move.x = x / len;
    this.state.move.y = y / len;
    this.state.firing = this.mouseDown || held(KEYS.fire);
    this.state.skip = held(KEYS.skip);
  }

  consumeAnyKey(): boolean {
    const v = this.state.anyKey;
    this.state.anyKey = false;
    return v;
  }
}
