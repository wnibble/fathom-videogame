# Handoff Protocol

This is the contract that makes the team efficient. Every dispatch is a
**Brief** (parent → child) and every return is a **Result** (child → parent).
Structured in, structured out — so the parent can integrate without re-reading,
and each child gets exactly the context it needs and no more.

> Rule of thumb: **the brief is the prompt.** A vague brief wastes a model call;
> a sharp brief gets a usable answer on the first try. Spend tokens shaping the
> brief, not re-asking.

---

## Brief (parent → any child)

```
GOAL:        <one sentence — the outcome you want, not the steps>
CONTEXT:     <only what the child needs. MINIMIZE. For the reviewer, give
              almost none — see below.>
INPUTS:      <files, paths, links, prior findings the child should use>
CONSTRAINTS: <must / must-not / out-of-scope>
DELIVERABLE: <the exact shape you want back — match the Result template>
DONE WHEN:   <acceptance criteria; how the child knows it's finished>
LENS:        <reviewer only — which lens to review through>
ASSUMPTIONS: <reviewer only — the author's declared assumptions, as attack surface>
```

### Context discipline per child
- **Researcher** — task-relevant facts only. No project history.
- **QA** — the change, how to run it, and the acceptance criteria. Not *why* the
  change was made.
- **Reviewer** — **goal + artifact + declared assumptions ONLY.** Never the
  parent's reasoning, alternatives considered, or "it's fine because…".
  Blindness is the feature. Assign exactly one LENS per reviewer.

---

## Result (any child → parent)

```
SUMMARY:      <2–3 lines — the answer up front>
DETAIL:       <findings / changes / verdicts, structured>
CONFIDENCE:   <high | med | low> + one line of why
RISKS/GAPS:   <what you're unsure of, what you didn't cover>
NEXT:         <recommended next action for the parent>
```

Children return **data, not prose essays.** The parent does the synthesis.

---

## Role-specific shapes

### Researcher Result
```
SUMMARY:   <the answer>
FINDINGS:  - <fact> [source: file:line / url]
           - <fact> [source: ...]
CONFLICTS: <contradictions between sources, or "none">
CONFIDENCE: <…>
GAPS:      <what couldn't be found>
```
The researcher reports facts with sources. It does **not** recommend project
direction — that's the parent's job.

### QA Result
```
VERDICT:   PASS | FAIL
RAN:       <commands / steps actually executed>
EVIDENCE:  <output, screenshots, exit codes — proof, not claims>
DEFECTS:   - [sev: blocker|major|minor] <what broke> → <repro steps>
COVERAGE:  <what was tested / what was NOT>
```
QA never says "looks good" — it says what it ran and what it saw. A PASS with no
EVIDENCE is invalid.

### Playtester Result *(games)*
```
VERDICT:      ship-feel | needs-work | not-fun-yet
RAN:          <builds/scripts/headless runs actually executed>
MEASURED:     - <metric> = <value> [source: file:line / log] → reads as <feel>
FEEL-DEFECTS: - [sev: blocker|major|minor] <what feels wrong> → <concrete target fix>
NEEDS-HUMAN:  <the subjective calls it could NOT make from code/logs>
PLAYTEST SCRIPT: - <exact thing for a human to try> → <what to watch/feel for>
```
The playtester judges *fun*, not correctness — QA already covered "does it work."
Its `blocker` feel-defects (dead core verb, unfair death loop) stand like any
other blocker. Run its PLAYTEST SCRIPT by hand before shipping a feel-changing
build: that human session is the non-waivable exogenous check for a game.

### Reviewer Result
```
LENS:       <the lens this reviewer was assigned>
STEELMAN:   <one line: the strongest case FOR the artifact>
OBJECTIONS: - [sev: blocker|major|minor] <the concern, phrased as "Why X?">
              ASSUMPTION CHALLENGED: <the belief this attacks (declared or unstated)>
              WHAT WOULD CHANGE MY MIND: <evidence that resolves it>
STRENGTHS:  <what genuinely holds up — keeps the review honest>
VERDICT:    <ship | revise | reject> + one line
```
The reviewer's default posture is skepticism. It returns **objections, not
approval.** "No objections" is a valid result, but it must have tried.

### Panel aggregation (how the parent combines multiple reviewers)
Run reviewers with **different lenses**, in parallel, blind. Then:
- **Any `blocker`-severity objection stands, regardless of lens or who raised
  it.** The parent may NOT waive a blocker. It must be fixed, or — if the parent
  genuinely disputes it — escalated to the human / an exogenous check. "Blocker"
  includes correctness, safety, data-loss, robustness, and irreversibility.
- A **majority** of seats flagging the same issue → it stands.
- A **lone `major`/`minor` objection** → the parent may waive it, but must record
  a concrete reason (this record is what `/retro` audits for rubber-stamping).
- **Even panel, split decision (1–1)** → treat the objection as standing, or add
  a tie-break seat. Never let a tie default to "ship."
- Ship only when no standing blocker/major remains.

Diversity of lenses is the anti-bias mechanism — but reviewers on the same model
share blind spots, so **majority vote reduces variance, not shared bias.** For
complex/high-stakes work decorrelate the panel (a seat on a different model
family) and add one exogenous check (see `docs/AGENT-STANDARDS.md`). The parent
both authors and aggregates, so the hard blocker-gate above is what stops the
biased author from waiving away inconvenient findings.

---

## The loop the parent runs

```
PLAN ──► RESEARCH ──► BUILD ──► QA ──┬─ FAIL ─► back to BUILD
  (fan out)  (parallel)         │    └─ PASS ─► REVIEW (panel) ──┬─ objections ─► back to BUILD
                                │                                └─ clean ─► SHIP
                                └─ pipeline: next unit builds while this one is in QA/review

games: … ─► QA (works?) ─► PLAYTEST (fun?) ─┬─ feel-defects ─► back to BUILD
                                            └─ ship-feel ─► REVIEW (incl. game-feel lens) ─► SHIP
       (run the PLAYTEST SCRIPT by hand before shipping a feel-changing build)
```

- Research only when a fact is missing and not cheap to self-serve; fan out
  independent researchers in parallel (one message, many Agent calls).
- QA after every meaningful change.
- Review each unit through a **2–3 lens panel** before shipping it, never skipped
  to save time — blindness + diversity is what makes it worth running.
- **Pipeline:** push each finished unit to QA/review immediately and keep
  building the next; don't barrier the whole build behind one review.
- Each bounce-back to BUILD carries the Result verbatim so nothing is lost.

---

## Why this is "proper prompting"

Each role is a prompt with a fixed input contract and a fixed output contract.
Efficiency comes from three things:

1. **Right model for the work** (`/optimize-model`) — no Opus tax on a doc lookup.
2. **Minimal, targeted context** — children aren't paying to re-read the world.
3. **Structured returns** — the parent integrates results instead of re-deriving
   them, so context stays clean and the loop converges instead of drifting.
