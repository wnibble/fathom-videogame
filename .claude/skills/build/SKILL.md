---
name: build
description: Kick off the Operations-Agents team on a goal. Plans the work, sizes the fleet (how many of each child and at what model tier), shows you the plan, and on your confirmation runs the full PLAN→RESEARCH→BUILD→QA→REVIEW→SHIP loop. Use this to start any non-trivial build with the parent/child team.
---

# /build <goal>

You are now acting as the **Parent** (see `.claude/agents/parent.md`). Drive the
full operations loop for the user's goal. **Plan first, then confirm, then run.**

## Step 1 — Plan & size the fleet (do NOT build yet)
1. Restate the goal in one sentence.
2. Decompose into a short ordered plan.
3. Consult `docs/AGENT-STANDARDS.md` to size the fleet for this task class:
   - how many **researcher** dispatches, and the model tier for each
     (run the `optimize-model` skill to choose each tier).
   - whether **QA** runs per-change or once at the end, and its tier.
   - how many **reviewer** passes, and on what units.
   - **games:** if the goal touches game feel/controls/difficulty/core loop, add a
     **playtester** after QA and a **game-feel lens** to the reviewer panel, and put
     one review seat on a different model (see the "game" row + "Games" section in
     `docs/AGENT-STANDARDS.md`).
4. Present a compact plan block and **stop for confirmation**:

```
GOAL:    <one sentence>
PLAN:    1. … 2. … 3. …
FLEET:   researcher ×N (haiku/sonnet …) · qa ×M (sonnet) · reviewer ×K (opus)
RATIONALE: <one line on why this sizing, citing AGENT-STANDARDS class>
RISKS:   <top 1–2>
```
Ask: "Run this, or adjust?" Wait for the user.

## Step 2 — Run the loop (after confirmation)
Execute `PLAN → RESEARCH → BUILD → QA → REVIEW → SHIP` per the parent profile and
`docs/HANDOFF-PROTOCOL.md`:
- Dispatch children with **Brief** format; expect **Result** format.
- Run `optimize-model` before each researcher dispatch; pass the tier as the
  Agent call's `model` override.
- **Fan out in parallel:** independent researchers/reviewers go in ONE message
  with multiple Agent calls. **Pipeline:** push finished units to QA/review while
  building the next.
- QA after every meaningful change; fix FAILs before proceeding.
- **Games:** after QA passes on a feel-touching change, dispatch the **playtester**;
  treat its `blocker` feel-defects like any blocker. Before shipping a
  feel-changing build, run its **PLAYTEST SCRIPT** by hand (or have the user do it)
  — that hands-on session is the non-waivable exogenous check.
- **Declare your assumptions**, then dispatch the **reviewer panel** (2–3 lenses
  per the task class) blind — give each only goal + artifact + assumptions.
  Aggregate by panel rules (any safety/correctness blocker stands; majority
  stands; record a reason before waiving a lone objection).
- Resolve standing objections; loop back to BUILD as needed.

## Step 3 — Close out the run (always)
After SHIP (or abort), append one structured outcome row to
`runs/ledger.jsonl` so the self-improvement module can learn. Use this schema
(one JSON object per line, no comments):

```json
{"ts":"<ISO8601>","goal":"<short>","task_class":"<from AGENT-STANDARDS>","fleet":{"researcher":N,"qa":M,"reviewer":K},"models":{"researcher":["haiku","sonnet"],"qa":["sonnet"],"reviewer":["opus"]},"qa":{"rounds":R,"final":"PASS|FAIL"},"reviewer":{"objections":{"blocker":0,"major":0,"minor":0},"verdict":"ship|revise|reject"},"tier_mismatches":[{"agent":"researcher","scored":"haiku","needed":"sonnet"}],"outcome":"shipped|abandoned","notes":"<1 line: what was over/under-resourced>"}
```

Fill `tier_mismatches` whenever a child reported (in GAPS/COVERAGE) that its tier
was too low or obviously overkill — this is the primary fuel for `/retro`.

Then tell the user it's shipped and that a ledger row was written.
