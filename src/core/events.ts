// Tiny typed event bus. Decouples systems (e.g. a bullet hit → HUD flash, SFX).

export type GameEvents = {
  "player:hit": { damage: number };
  "player:died": void;
  "enemy:killed": { kind: string; pos: { x: number; y: number } };
  "sample:collected": { value: number };
  "depth:changed": { depth: number };
  "state:changed": { state: string };
};

type Handler<T> = (payload: T) => void;

class EventBus {
  private map = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(type);
    if (!set) {
      set = new Set();
      this.map.set(type, set);
    }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }
}

export const bus = new EventBus();
