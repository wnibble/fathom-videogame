// Core state machine (Part 5 §1). Every state has an explicit exit; unknown
// transitions are rejected — no soft-locks.

import { bus } from "./events";

export type StateName =
  | "boot" | "loading" | "error"
  | "menu" | "howto"
  | "cutscene" | "dive"
  | "levelup" | "pause" | "gameover";

interface StateHooks {
  enter?(from: StateName | null): void;
  exit?(to: StateName): void;
  update?(dt: number): void;
}

export class StateMachine {
  private states = new Map<StateName, StateHooks>();
  private _current: StateName | null = null;

  define(name: StateName, hooks: StateHooks): this {
    this.states.set(name, hooks);
    return this;
  }

  get current(): StateName | null {
    return this._current;
  }

  change(to: StateName): void {
    if (!this.states.has(to)) {
      console.warn(`[state] unknown state '${to}' — ignored`);
      return;
    }
    if (to === this._current) return;
    const prev = this._current;
    if (prev) this.states.get(prev)!.exit?.(to);
    this._current = to;
    this.states.get(to)!.enter?.(prev);
    bus.emit("state:changed", { state: to });
  }

  update(dt: number): void {
    if (this._current) this.states.get(this._current)!.update?.(dt);
  }
}
