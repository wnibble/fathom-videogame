// Input: keyboard + mouse twin-stick, plus discrete press-edge detection for
// menus / upgrade picks / dash / dismissing screens (so a HELD key can't
// instantly skip a screen — that was the game-over-vanishes bug). Remap-ready.

import type { Vec2 } from "../core/types";

export interface InputState {
  move: Vec2;
  aim: Vec2;
  aimScreen: Vec2;
  firing: boolean;
  skip: boolean;
  anyKey: boolean;
}

export const KEYS = {
  up: ["KeyW", "ArrowUp"],
  down: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  fire: ["Space", "Mouse0"],
  dash: ["ShiftLeft", "ShiftRight"],
  pause: ["Escape", "KeyP"],
  skip: ["Enter", "Escape", "Space", "Mouse0"],
  confirm: ["Enter", "Space", "Mouse0"],
  choose: ["Digit1", "Digit2", "Digit3"],
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
  private edgeBuffer = new Set<string>(); // press edges accumulated since last update()
  private justDown = new Set<string>(); // edges visible to consumers this frame
  pressCount = 0;

  attach(canvas: HTMLCanvasElement): void {
    window.addEventListener("keydown", (e) => {
      if (!e.repeat) {
        this.edgeBuffer.add(e.code);
        this.pressCount++;
      }
      this.down.add(e.code);
      this.state.anyKey = true;
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
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
      if (e.button === 0) {
        this.mouseDown = true;
        this.edgeBuffer.add("Mouse0");
        this.pressCount++;
      }
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  /** Resolve intent + swap the edge buffer in. Call once per frame BEFORE consumers. */
  update(): void {
    this.justDown = this.edgeBuffer;
    this.edgeBuffer = new Set();

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
    this.state.firing = this.mouseDown || this.down.has("Space");
    this.state.skip = held(["Enter", "Escape"]);
  }

  /** True if any of these codes had a fresh press edge this frame. */
  pressed(codes: string[]): boolean {
    return codes.some((c) => this.justDown.has(c));
  }
  /** Any fresh press this frame (for "press any key"). */
  anyPress(): boolean {
    return this.justDown.size > 0;
  }
  /** Swallow pending edges so the click/key that opened a screen can't also dismiss it. */
  clearEdges(): void {
    this.justDown.clear();
    this.edgeBuffer.clear();
  }
  /** Which choose-slot (0,1,2) was pressed this frame, or -1. */
  choiceIndex(): number {
    if (this.justDown.has("Digit1")) return 0;
    if (this.justDown.has("Digit2")) return 1;
    if (this.justDown.has("Digit3")) return 2;
    return -1;
  }
  held(codes: string[]): boolean {
    return codes.some((c) => this.down.has(c));
  }
}
