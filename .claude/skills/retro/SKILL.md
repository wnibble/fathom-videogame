---
name: retro
description: The self-improvement module. Runs the operations team ON ITSELF — reads run outcomes from runs/ledger.jsonl, scores how well the team was resourced, proposes incremental updates to the model chooser (optimize-model) and the agent-generation standards (AGENT-STANDARDS), sends the proposal through the BLIND reviewer, and auto-applies only changes the reviewer doesn't block. Every applied change is logged to runs/TUNING-LOG.md. Run after a task, or periodically across many runs.
---

# /retro

You are running the Operations-Agents loop **on the config itself**. The
"project" being improved is the team's own tuning: `optimize-model/SKILL.md` and
`docs/AGENT-STANDARDS.md`. Same discipline as a normal build — plan, propose,
blind-review, ship — applied reflexively. Make it **incrementally** better: small,
evidence-backed changes, not rewrites.

## Step 1 — Gather evidence
1. Read `runs/ledger.jsonl` (all rows; if huge, the most recent ~50).
2. If invoked right after a single task, also weight that latest row heavily.
3. Compute signals across rows:
   - **Tier mismatches** — how often `optimize-model` under/over-shot
     (`tier_mismatches`). Repeated under-shoots on a task pattern → raise that
     pattern's tier. Repeated over-shoots → lower it.
   - **QA rounds** — high average rounds for a task_class → QA under-resourced or
     starting tier too low.
   - **Reviewer objections** — blockers slipping to review on a class → that
     class needs more/earlier review or a stronger build step.
   - **Fleet vs outcome** — classes that ship clean with fewer children → trim
     defaults. Classes that abandon or thrash → add resource.
   - **Standing deviations** — parent repeatedly overriding a default with the
     same rationale → promote the deviation into the default.

## Step 2 — Draft a proposal (don't apply yet)
Write `runs/PROPOSAL.md` with a small set of concrete diffs, each as:
```
CHANGE:    <which file + what edit>
EVIDENCE:  <the rows/signal that justify it — cite counts>
EXPECTED:  <what should improve, and how the next ledger rows would show it>
RISK:      <what could regress>
```
Prefer 1–3 high-confidence changes per run over a big sweep. If evidence is thin,
say so and propose nothing — a no-op retro is a valid outcome.

## Step 3 — Blind review (the gate)
Dispatch the **reviewer** agent (`opus`, blind) with ONLY: the proposal, the
current contents of the two config files, and the goal "incrementally improve
team resourcing accuracy without overfitting to a few runs." Do NOT give it your
reasoning. Expect the reviewer **Result** (objections + verdict).

## Step 4 — Apply (auto, gated by review)
- For each proposed change with **no blocker/major objection**: apply the edit to
  the live config file.
- For changes the reviewer blocks: leave unapplied, record the objection.
- Append every applied change to `runs/TUNING-LOG.md`:
```
## <ISO8601>
- FILE: <path>
  CHANGE: <what changed, before → after>
  EVIDENCE: <signal cited>
  REVIEWER: <verdict / waived objection if any>
```
- Update `runs/PROPOSAL.md` status (applied / blocked) or clear it.

## Step 5 — Report
Tell the user: signals found, what was applied, what the reviewer blocked, and
what to watch in upcoming runs to confirm the change helped.

## Guardrails (avoid self-degradation AND self-confirmation)
- **Anchor on outcomes, not opinions.** The proposal must be justified by
  *outcome* signals in the ledger (QA pass rate, rounds, objections that turned
  out real, abandons) — NOT by the reviewer agreeing it sounds good. The blind
  reviewer is a veto, not the evidence. If the only support for a change is "the
  reviewer liked it," that's not evidence.
- **You are reviewing your own config with your own model.** This loop is
  closed — same author, same model family, judging its own rubric. It can drift
  in a direction all its parts agree on. To counter that:
  - Require an **exogenous audit** of `runs/TUNING-LOG.md` periodically (every
    ~10 applied changes, or monthly): a human, or a reviewer on a **different
    model family**, checks whether the tuning trend actually improved outcomes.
    Note in the report when this audit is due/overdue.
  - Where available, run the retro's review seat on a **different model family**
    than the parent, to decorrelate blind spots.
  - **Report the actionable gap, not the structural one.** Flag runs where an
    exogenous check was *available but skipped* (that's a real lapse). Do NOT
    alert on runs where it was structurally *unavailable* (single-model env) —
    that fires every time and trains everyone to ignore it; instead just confirm
    a residual-risk waiver was logged for those runs.
- **Incremental only.** Never rewrite a rubric wholesale in one retro.
- **Don't overfit.** Require a pattern across **≥3 runs** before changing a
  default, unless a single run shows an unambiguous error (e.g. a tier that
  literally failed).
- **Keep the invariants.** Never propose changes that: remove the blind reviewer
  from standard+ work, give children the parent's context, let any agent
  self-approve, make a `blocker` waivable, or remove the exogenous check on
  high-stakes work. These are load-bearing; flag and refuse such proposals.
- **Reversible.** Because every change is in TUNING-LOG with before→after, any
  regression can be reverted by reading the log and undoing the last entry.
