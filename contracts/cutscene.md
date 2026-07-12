# Contract — `cutscene` (data-driven sequencer, cold-open only)

> Part-5 subsystem #13 (Cutscene sequencer) + Part 3. Slice scope = the **cold-open
> "The Descent"** beat only, but built as the general data-driven, skippable
> sequencer so future beats are data, not code.

## PURPOSE
Play an ordered list of steps (show framed art, pan camera, type text, wait, fade,
sfx-stub) that sets tone: the diver drops from surface light into blue. Fully
**skippable** (hold-to-skip); never blocks input >1s without an escape (acceptance).

## RESPONSIBILITIES
- Interpret a `CutsceneDef` step-by-step; advance by `dt`; expose `done`.
- Support step kinds: `showCard`, `wait`, `panCamera` (tween via `Camera`),
  `typeText` (typewriter), `fade`, `playSfx` (stub — audio out of slice, no-op hook).
- Hold-to-skip: while `ctx.input.skipHeld` for a short hold, fast-forward to end and
  resolve. Any single blocking step must be interruptible within ~1s.
- Render its cards/text into a screen-space overlay (renderer hud/overlay layer);
  camera moves go through the concrete `Camera`.
- Author `COLD_OPEN: CutsceneDef` (title card → fade from surface light → pan down
  into blue → tone line).

## KEY DATA
```ts
import { Vec2, Milliseconds, Hex } from '../shared/types';

export type Ease = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut';

export type CutsceneStep =
  | { kind: 'showCard'; atlasId?: string; frame?: string; text?: string; durationMs: Milliseconds }
  | { kind: 'wait'; durationMs: Milliseconds }
  | { kind: 'panCamera'; to: Vec2; durationMs: Milliseconds; ease: Ease }
  | { kind: 'typeText'; text: string; cpsMs: Milliseconds }        // ms per char
  | { kind: 'fade'; toAlpha: number; color: Hex; durationMs: Milliseconds }
  | { kind: 'playSfx'; id: string };                               // stubbed this pass

export interface CutsceneDef {
  id: string;
  skippable: boolean;         // cold-open = true
  steps: CutsceneStep[];
}
export const COLD_OPEN: CutsceneDef;
```

## INTERFACE
```ts
export interface CutscenePlayer {
  play(def: CutsceneDef): Promise<void>;  // resolves on natural end OR skip
  update(ctx: FrameContext): void;        // advance current step; handle hold-to-skip
  skip(): void;
  readonly done: boolean;
}
export function createCutscenePlayer(overlayLayer: unknown, camera: Camera): CutscenePlayer;
```
Wiring: the `Cutscene` app-state calls `player.play(COLD_OPEN)` on enter and
`player.update(ctx)` each tick; on resolve, `changeState('Dive')`.

## DEPENDENCIES
`shared/types`, `core` (FrameContext, Camera, StateMachine), `renderer` (overlay
layer), `input` (skipHeld), `assets` (card frames). Audio SFX = stub hook only.

## ACCEPTANCE (Part 5 #13 / Part 3)
- Data-driven: a new beat is added by writing a `CutsceneDef`, no engine change.
- Skippable: hold-to-skip always works and fast-forwards to the end.
- Never locks input >1s without an escape.
