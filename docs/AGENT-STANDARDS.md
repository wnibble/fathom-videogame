# Agent Generation Standards

How many of each child to spawn, and how, for a given task. The parent consults
this before sizing a fleet; `/retro` tunes it from real run outcomes. Keep it a
living table — it should change as evidence accumulates.

> These are **defaults, not laws.** The parent may deviate with a one-line
> rationale in the plan; `/retro` watches for deviations that keep paying off and
> promotes them into the defaults.

## One table: task class → ceremony + fleet

There is **one** classification axis (task class). It implies both the ceremony
level and the fleet — no separate "tier" table to reconcile.

| Class | Examples | Architect | Researcher | QA | Reviewer | Optimizer |
|-------|----------|-----------|-----------|----|----------|-----------|
| **trivial** | one-line fix, rename, copy edit | no | 0 | parent self-checks | 0 | no |
| **small** | single function/file feature | no | 0–1 (haiku) | 1 at end (sonnet) | 1 blind (correctness) | optional |
| **standard** | multi-file feature, bug with unknown cause | optional | 1–2 (haiku/sonnet) | per-change (sonnet) | **1 blind reviewer** (correctness+assumptions); escalate to a 2-lens panel only if it raises a blocker or stakes are high | if perf/cleanliness matters |
| **complex / high-stakes** | new subsystem, cross-cutting change, migration, anything risky/irreversible | **yes — first** | 2–4 (mixed) | per-unit + final (sonnet→opus) | **2–3 lens panel** per unit (correctness + robustness/failure + bias/blind-spot) + **one exogenous check** (see below) | **yes — before ship**, then re-QA |
| **research-heavy** | "which library / approach", unknown domain | optional | 2–4 (sonnet) parallel, different angles | as needed | 2-lens panel (assumptions/logic + simplicity/scope) on the synthesis | no |
| **game — feel-touching** | new mechanic, controls, difficulty, core loop, juice | per underlying class | 1–2 (engine/design facts) | per-change + **frame-budget & save/determinism** | panel **incl. game-feel/design lens**; ≥1 seat on a different model | **frame-budget** pass if perf matters |

For any **feel-touching game change**, add the **playtester after QA passes** (see
Games below) — it is the game equivalent of the blind reviewer for the experience
axis, and the highest-value seat on game work. Pure-plumbing game changes (build
scripts, a loader with no feel impact) fall back to their underlying class and
skip the playtester.

**Architect** front-loads the plan (units + interfaces + parallelizable work) so
the parent fans out instead of building linearly — it's the throughput multiplier
on big jobs. **Optimizer** runs after QA passes to make working code
simpler/faster/cheaper, then QA re-verifies. Both are *optional power tools*: use
them when the task is big enough to pay for them, skip them when it isn't.

**Mind the cost.** Each adds a *serial* stage to the critical path (architect at
the front, optimizer + a re-QA at the back) plus an Opus/Sonnet call. On a big job
the parallel decomposition the architect buys more than repays that; on a medium
one it may not. Net the multiplier against the added hops — if you can't say how a
run came out faster/cheaper *with* them, that's a signal to drop them next time
(and `/retro` should watch for it in the ledger).

**Default to the lighter end.** A single sharp blind reviewer catches most of
what a panel does; reserve the multi-lens panel for complex/high-stakes work
where the extra Opus calls actually pay for themselves. When unsure between two
classes, pick the lighter and escalate if the first review raises a blocker —
escalation is cheaper than blanket ceremony.

## Decorrelate the panel (so majority vote means something)
Blind reviewers on the **same model** share training blind spots — a majority of
correlated voters can agree on a shared error. Majority vote reduces *variance*,
not shared *bias*. So:
- On complex/high-stakes work, put **at least one panel seat on a different model
  family** (e.g. not all Opus) where available, to decorrelate blind spots.
- **Exogenous check — graceful, not a hard block.** On complex/high-stakes ship,
  prefer an exogenous check (human sign-off or different-model reviewer). But do
  NOT make it a gate that can never be satisfied: if neither is available in the
  environment, **log a one-line residual-risk waiver** in the run (e.g. in the
  ledger `notes`: "panel correlated single-model, no exogenous check — unaudited")
  so the gap is visible and auditable, then ship. Surfacing the risk beats both
  silently shipping as if audited *and* blocking all work forever. These waivers
  are what the periodic human audit reviews.
- Treat the panel as **bias *reduction*, not elimination.** Name the residual
  risk; don't claim it's gone.

## Games — the feel gate
A game is graded on experience, and the correctness-oriented default fleet is blind
to it. So on feel-touching game work:
- **Add the playtester after QA.** QA proves it *works* (frame budget, save/load,
  determinism, asset integrity); the playtester proves it's *good to play*
  (response, juice, difficulty, readability). Both, in that order — a build that
  passes QA can still be a defect if it plays badly.
- **The human playtest is the exogenous check, and it's cheap.** The playtester
  can measure the substrate of feel and author a **PLAYTEST SCRIPT**, but it cannot
  feel juice through a terminal. A human running that script before shipping a
  feel-changing build is the exogenous check the standards ask for on high-stakes
  work — and unlike the general graceful-waiver, on game feel it is **not
  waivable**, because you were going to play the build anyway. Cheap, so do it.
- **`blocker` feel-defects stand.** An unresponsive core verb or an unfair death
  loop is ship-stopping, exactly like a correctness blocker.

## Concurrency
- Fan out independent children in **one message** (multiple Agent calls) so they
  run in parallel. This is the single biggest throughput win.
- Practical cap: **~3–5 concurrent children** — but the real limit is the
  parent's own integration bandwidth. Keep a **WIP limit of ~2 in-flight units**
  under review while you build the next; pipelining past what one orchestrator can
  integrate just queues context you'll skim.
- Reviewers in a panel are always independent → always dispatch them together.

## Sizing rules
- **Parallelize researchers** when sub-questions are independent; give each a
  distinct angle so they don't overlap. Dedup their findings yourself.
- **Don't spawn a child you don't need.** A researcher for a fact you can grep in
  10s is waste. A reviewer on a rename is theater.
- **Keep at least one blind reviewer on standard+ work.** Cut researcher/QA count
  first if budget is tight; the blind review is the highest-value seat.
- **Escalate, don't multiply.** If one QA pass on sonnet keeps missing a subtle
  bug, re-dispatch on opus rather than spawning three sonnet QAs.
- **Cap concurrency** at what you can integrate cleanly.

## Model tiers
Tier selection is owned by `.claude/skills/optimize-model/SKILL.md`. This doc
decides *how many and which roles*; that skill decides *what model each runs on*.
Keep the two concerns separate so `/retro` can tune them independently.

## Change log
`/retro` records every change to this file in `runs/TUNING-LOG.md` with the
evidence that justified it. Don't edit the tables by hand without logging why —
the whole point is that tuning is auditable.
