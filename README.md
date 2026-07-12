# Operations-Agents

A modular **parent → child agent team** for Claude Code. One Opus "parent" owns
the project and the thinking; **three core children** do the cheap, the
repetitive, and the adversarial work — plus **two optional power tools**
(architect, optimizer) for big jobs. The whole thing is just markdown files —
copy this folder into any project and it works. Start with the core four; add the
optional pair when a task is big enough to pay for them.

```
                          ┌──────────────────────────┐
                          │   PARENT  (Builder/Orch.) │  opus · max thinking
                          │   holds all context       │  writes the project
                          └────────────┬─────────────┘
       dispatch briefs ┌───────┬───────┼───────┬──────────────┬───────────┐
                       ▼       ▼       ▼       ▼              ▼           ▼
                  ┌─────────┐┌────────┐┌────┐┌──────────────┐┌──────────┐
                  │ARCHITECT*││RESEARCH││ QA ││  REVIEWER     ││OPTIMIZER*│
                  │ plan/    ││ scout  ││veri││  red-team     ││ perf/cost│
                  │ decompose││haiku/  ││fy  ││  opus·blind   ││ /simplify│
                  │ opus     ││sonnet  ││son ││  asks WHY      ││ sonnet→  │
                  └─────────┘└────────┘└────┘└──────────────┘└──────────┘
            core: researcher · qa · reviewer   ·   * = optional (big jobs)
                       model per task by /optimize-model
```

Loop: `PLAN (architect) → RESEARCH → BUILD → QA → REVIEW → OPTIMIZE (→re-QA) → SHIP`

**Building a game?** The team gains a **feel gate**: `… → QA (works?) → PLAYTEST
(fun?) → REVIEW (with a game-feel lens) → SHIP`. QA verifies frame budget /
save-load / determinism; the **playtester** judges responsiveness, juice, and
difficulty, and hands you a short script to run by hand — that human playtest is
the (non-waivable, and free) exogenous check for a game. See
[`docs/AGENT-STANDARDS.md`](docs/AGENT-STANDARDS.md) → "Games — the feel gate."

## The roles

Four core roles, plus two optional **power tools** (architect, optimizer) for big
jobs. Model per role is governed by the `optimize-model` skill.

| Role | File | Model | Holds context? | Job |
|------|------|-------|----------------|-----|
| **Parent** | `.claude/agents/parent.md` | opus | **Yes — all of it** | Decomposes the goal, writes the code, dispatches children, integrates results, makes the final call. |
| **Architect** *(optional)* | `.claude/agents/architect.md` | opus | Reads full context (not blind) | Plans complex work: units, dependencies, interfaces, **parallelizable** pieces + advisory fleet. The throughput multiplier; skipped on small tasks. |
| **Researcher** | `.claude/agents/researcher.md` | haiku→sonnet (auto) | No — only its brief | Gathers facts, reads docs/code, explores. Returns distilled findings, never opinions on direction. |
| **QA** | `.claude/agents/qa.md` | sonnet (escalates) | No — only the change + acceptance criteria | Runs it, tests it, reproduces it, files defects. Tight loop with parent. Games: also frame budget, save/load, determinism, asset integrity. |
| **Playtester** *(games)* | `.claude/agents/playtester.md` | sonnet→opus | No — only the build + goal | Plays it (or drives it headless) and judges **fun/feel** — response, juice, difficulty, readability — via measurable proxies + a scripted human playtest. The anti-"correct but boring" gate. |
| **Reviewer** | `.claude/agents/reviewer.md` | opus (+1 decorrelation seat on a different model) | **No — deliberately blind** | Sees only the artifact + the goal, never the parent's reasoning. Challenges assumptions, hunts bias, returns objections. Games: one seat reviews the **game-feel/design** lens. |
| **Optimizer** *(optional)* | `.claude/agents/optimizer.md` | sonnet→opus | No — only QA-passed code | Makes working code simpler/faster/cheaper **without changing behavior**; QA re-verifies. Runs after review, before ship. |

Loop: `PLAN (architect) → RESEARCH → BUILD → QA → REVIEW → OPTIMIZE (→re-QA) → SHIP`.

The split is deliberate:

- **The parent is the only one that accumulates context.** Children are
  near-stateless so each call is cheap and uncontaminated.
- **Compute is matched to the task.** Heavy reasoning (parent, reviewer) runs on
  Opus; lookup/verify work runs on the cheapest model that succeeds, chosen by
  the `optimize-model` skill.
- **The reviewer is starved of context on purpose.** Bias comes from sharing the
  author's rationale. A reviewer who only sees *goal + artifact* and is told to
  ask "why" catches what a context-soaked reviewer rubber-stamps.

> **On bias — honest framing.** These controls *reduce and surface* bias; they
> don't eliminate it. The parent both authors and aggregates review, and all
> agents share a base model (correlated blind spots). The system counters this
> with three hard rules: **blockers are non-waivable**, complex/high-stakes work
> gets **a panel seat on a different model family**, and risky/irreversible work
> needs **one exogenous check** (a human or different-model reviewer). The team
> cannot be the sole auditor of its own bias — and it says so.

## Commands

Real Claude Code **slash commands** live in `.claude/commands/` — type them in the
prompt:

| Command | What it does |
|---------|--------------|
| **`/build <goal>`** | Starts the team. Parent plans, sizes the fleet (how many of each child + tier), shows you the plan, and on your OK runs the full loop and logs the run. |
| **`/retro [focus]`** *(optional layer)* | The self-improvement module. Reads `runs/ledger.jsonl`, scores how the team was resourced, proposes incremental edits to the model chooser + agent standards, runs them past the **blind reviewer**, applies what isn't blocked, logs it. **Ignore it on day one** — run it once you have several runs to learn from. |
| **`/optimize-model <task>`** | Scores one task → picks the cheapest model tier that works. (Also used internally before each child dispatch.) |

> **To make `/build` etc. appear, run Claude Code with this folder as the working
> directory** so `.claude/commands/` registers and the commands' relative paths
> resolve:
> ```bash
> cd Operations-Agents && claude
> ```
> Then type `/build add a CSV export endpoint`. If you run Claude from a parent
> directory, the commands won't show up (Claude Code only loads `.claude/commands`
> from the project root + `~/.claude/commands`). To use them everywhere, copy the
> three files into `~/.claude/commands/` — but then run from this folder anyway so
> the agents/docs paths resolve. (`/` will list all available commands.)

## How it runs

1. You talk to the **parent** (your main Claude Code session, or
   `@parent`) — or run **`/build <goal>`**. It plans and starts building.
2. When it needs a fact it can't cheaply get itself, it runs `/optimize-model`
   to pick a tier, then dispatches the **researcher** with a brief.
3. After any meaningful change it dispatches **QA** to verify against acceptance
   criteria. Failures bounce back to the parent.
4. Before shipping a unit of work, it dispatches the **reviewer** (blind) to
   attack it. Surviving objections bounce back to the parent.
5. Loop until QA passes and the reviewer's objections are resolved.

The contracts that make this efficient — exactly what each agent receives and
returns — are in [`docs/HANDOFF-PROTOCOL.md`](docs/HANDOFF-PROTOCOL.md). Read
that next; it's the heart of the system.

## Self-improvement loop

The team tunes itself. Two configs are treated as living and adjustable:
`optimize-model` (which model per task) and `AGENT-STANDARDS` (how many of each
child per task class). `/retro` runs the team **on its own config**:

```
runs/ledger.jsonl ─► /retro: score signals (tier mismatches, QA rounds,
                              reviewer objections, fleet-vs-outcome)
                       │
                       ├─► PROPOSAL.md (small, evidence-backed diffs)
                       │
                       └─► BLIND reviewer signs off ─► auto-apply unblocked
                                                       changes ─► TUNING-LOG.md
```

Guardrails keep it from degrading **or self-confirming**: changes must be
justified by *outcome* signals (not the reviewer merely agreeing), incremental
only, ≥3-run pattern before moving a default, every change reversible via the
tuning log, a periodic **exogenous audit** (human or different-model) of the
tuning trend, and it refuses any change that breaks the invariants (blind
reviewer, context isolation, no self-approval, non-waivable blockers).

> This loop reviews its own config with its own model — a closed loop can drift
> in a direction all its parts agree on. The outcome-anchor + periodic external
> audit are what keep it honest. Treat `/retro` as assistive, not autonomous
> truth.

## Quick start

The whole thing uses **relative paths from this folder's root**, so the simplest
setup is to run Claude Code from inside `Operations-Agents/`, or copy the entire
folder into your project:

```bash
# run from inside the folder (everything resolves):
cd Operations-Agents && claude

# …or embed the whole module in an existing project:
cp -r Operations-Agents  your-project/
```

Then: `/build add a CSV export endpoint` → confirm the plan → it runs the loop.
After a few builds, run `/retro` to start tuning. For a one-off, invoke a child
directly: `@researcher find how X is configured`.

## Live dashboard

A zero-dependency, **project-agnostic** web view that auto-discovers your files
and polls them every 2s so you can watch work happen live — drop it in *any*
project, not just this one. Leave it open on a second monitor.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/start-dashboard.ps1
# serves the folder and opens http://127.0.0.1:8765/dashboard/
```

What it gives you:
- **Auto-crawled file tree** with live change dots, and an **overview** that
  detects the project type (Node/Python/Rust/Go/…), lists `package.json` scripts,
  charts file types, and shows a **session pulse** + **hotspots** (most-changed).
- **Inline diffs** — the activity feed shows *what* changed (added/removed lines),
  not just that something did. **Follow-latest** auto-opens the file being edited.
- **Proactive error surfacing** — scans changed logs/JSONL for error lines and
  raises a header alert + "Recent errors" view, so a failing run doesn't slip by.
- **Smart viewers** — Markdown rendered, JSONL/CSV → sortable tables, logs with
  level coloring, code with line numbers — plus a **TODO/FIXME scan** and
  **content search** (press `/`).
- If it finds a `.claude/agents/` team, an **Agent team panel** appears
  automatically.

> **Server note (important):** auto-discovery reads the server's directory
> listing, so use a server that produces one — **`python -m http.server`**
> (what the launcher uses) or **`npx serve`**. VS Code **Live Server does *not*
> serve directory listings**, so the tree won't populate there. Change detection
> uses HTTP `Last-Modified`/`If-Modified-Since` (cheap when idle) with a
> content-compare fallback, so it never reports phantom changes for text files.

> **Optional auto-logging:** a Stop hook can record every session as a backstop.
> It is shipped as `.claude/settings.example.json` (not active by default). To
> enable, review the command in that file and merge its `hooks` block into your
> real `.claude/settings.json`, or run `/update-config` and approve. The
> structured `runs/ledger.jsonl` row written by `/build` is the primary signal
> and needs no hook.

## How to mimic / extend

- **Add a role** = add one `.claude/agents/<name>.md`. Give it a sharp single
  responsibility and a strict return shape (copy the structure of an existing
  one).
- **Change model policy** = edit `.claude/skills/optimize-model/SKILL.md`. That
  rubric is the only place tier decisions live (or let `/retro` tune it).
- **Change fleet sizing** = edit `docs/AGENT-STANDARDS.md` (or let `/retro` tune
  it). How many of each child per task class lives only here.
- **Change how agents talk** = edit `docs/HANDOFF-PROTOCOL.md`. Every agent
  references it, so the protocol stays in one place.
- **Change the kickoff or learning behavior** = edit `.claude/skills/build/` or
  `.claude/skills/retro/`.

Keep the invariants: parent holds context, children are narrow, reviewer is
blind, every handoff is a structured brief → structured result.

