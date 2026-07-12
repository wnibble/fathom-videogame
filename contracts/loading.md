# Contract — `loading` (accurate progress + depth-gauge loader)

> Part-5 subsystem #14 (Loading). Themed depth-gauge loader driven by a **real**
> progress source (the AssetRegistry load), no fake bars.

## PURPOSE
Cover the BOOT/asset load with worldbuilding, not a spinner: a descending
depth-gauge fills as real load progress arrives. Progress is weighted by actual
task cost so the bar is honest (acceptance: accurate progress, no fake bars).

## RESPONSIBILITIES
- Run an ordered set of weighted `LoadTask`s, aggregating real per-task progress
  into a single `LoadProgress` (fraction 0..1 + label).
- Drive the `LoadingScreen` visual (depth gauge filling downward; a rotating
  codex-tip line; ambient tint) from that progress.
- For the slice, the one real task is `assets.loadAll` (byte/count weighted from
  `atlas-index.json`); the task list is extensible for future biome streams.
- Resolve when all tasks complete, then hand control back to the state machine.

## KEY DATA
```ts
export interface LoadTask {
  id: string;
  weight: number;                              // relative cost (e.g. bytes)
  run(onProgress: (fraction: number) => void): Promise<void>;
}
export interface LoadProgress {
  fraction: number;   // 0..1 overall, weighted
  label: string;      // current task label
  done: number; total: number; // task counts, for text
}
```

## INTERFACE
```ts
export interface Loader {
  onProgress(cb: (p: LoadProgress) => void): void;
  start(): Promise<void>;   // resolves when every task completes
}
export function createLoader(tasks: LoadTask[]): Loader;

export interface LoadingScreen {
  mount(target: HTMLElement): void;
  update(p: LoadProgress): void;   // wired from loader.onProgress
  destroy(): void;
}
export function createLoadingScreen(): LoadingScreen;
```

## DEPENDENCIES
`shared/types`, `assets` (the load task / progress source), `renderer` or DOM for
the screen visual. Independent of gameplay modules.

## ACCEPTANCE (Part 5 #14)
- Progress is accurate — the gauge tracks real weighted load, never a timed fake.
- First meaningful paint target < 2s on mid hardware (loader appears immediately,
  before assets finish).
- The loading→next-state transition is masked by the loader (no flash of empty
  screen).
