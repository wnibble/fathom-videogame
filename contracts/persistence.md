# Contract — `persistence` (local save)

> Part-5 subsystem #17 (Persistence/Auth), **local-only slice**: browser
> `localStorage`, no backend this pass. Stores a guest id + best depth.

## PURPOSE
Durable local save that survives refresh. Generates a stable guest id on first run
and records the deepest dive. Structured so a real account/cloud sync can adopt the
same `SaveData` later without loss (versioned schema, guest id is the migration key).

## RESPONSIBILITIES
- On first run, generate a `guestId` (UUID v4) and persist it.
- Load/return `SaveData` (defaulted when absent or corrupt — never throw into the
  game; a parse failure resets to defaults but preserves any recoverable guestId).
- `recordDepth(depth)` updates `bestDepth` only when greater; bumps `updatedAt`.
- Version the schema; provide a migration hook for future fields.

## KEY DATA
```ts
export interface SaveData {
  version: number;         // schema version (start at 1)
  guestId: string;         // uuid v4, stable across sessions
  bestDepth: number;       // deepest depth reached, meters
  createdAt: number;       // epoch ms
  updatedAt: number;       // epoch ms
}

export const SAVE_KEY = 'fathom.save.v1';
```

## INTERFACE
```ts
export interface PersistenceService {
  load(): SaveData;                       // defaulted if missing/corrupt
  save(data: SaveData): void;
  recordDepth(depth: number): SaveData;   // max(bestDepth, depth); persists; returns new state
  reset(): void;                          // wipe (keeps a fresh guestId)
  readonly guestId: string;
  readonly data: Readonly<SaveData>;      // last-loaded snapshot
}

// storage defaults to window.localStorage; injectable for tests/SSR safety.
export function createPersistence(storage?: Storage): PersistenceService;
```

## DEPENDENCIES
`shared/types` only. No other module. (Fully independent — build any time.)

## ACCEPTANCE (Part 5 #17)
- Progress survives a page refresh (`bestDepth` and `guestId` reload identically).
- Missing/corrupt storage never crashes the game — falls back to sane defaults.
- Schema is versioned so a later cloud-save/account link can migrate without loss.
- `guestId` is generated exactly once and remains stable across sessions.
