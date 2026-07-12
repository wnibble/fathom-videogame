# Tuning Log

Auditable history of every change `/retro` applied to the team's config
(`optimize-model` rubric and `AGENT-STANDARDS`). Newest first. To revert a
regression, undo the most recent matching entry by hand.

<!-- /retro appends entries below this line -->

## 2026-06-22 — /retro cycle 2 (ledger n=2)
Outcome: NO default changes (below ≥3-run threshold). One guardrail clarification
applied, AFTER a blind reviewer rejected the first draft as overfit + unenforceable.

- DRAFT (rejected by blind review, verdict=revise): make a human exogenous check
  REQUIRED before shipping complex work when no different-model seat exists.
  Reviewer majors: (1) overfits n=2 self-builds; correlated panel is an environment
  property, not an outcome — no evidence the gap caused harm; (2) a gate that can
  never be satisfied hard-blocks all complex work → gets bypassed → erodes rule
  authority; (3) same loop can't credibly enforce a prose rule; (minor) report
  would fire 100% of runs → alert fatigue.
- APPLIED (reviewer-shaped):
  - FILE: docs/AGENT-STANDARDS.md ("Decorrelate the panel") — exogenous check is
    now GRACEFUL: if unavailable, log a one-line residual-risk waiver and ship
    (don't hard-block, don't pretend audited). before→after recorded here.
  - FILE: .claude/skills/retro/SKILL.md — report only the ACTIONABLE gap (check
    available but skipped), not the structural always-true case.
  EVIDENCE: 2/2 complex runs shipped with correlated all-Opus panels + no exogenous
    check; framed as a transparency/logging improvement, not a defaults move.
  REVIEWER: gate caught the overreach; lighter version applied.
- HUMAN RATIFICATION: requested (this is the standing exogenous check; the loop
  cannot self-certify a bias-control change).

## 2026-06-22 — v2.1, driven by blind 3-lens review of the v2 build
Source: build-time review (3 blind reviewers: assumptions/logic, simplicity/scope,
bias/blind-spot). All applied changes resolve standing blockers/majors.

- FILE: docs/HANDOFF-PROTOCOL.md
  CHANGE: panel aggregation — "only safety/correctness blockers stand" → **ANY
  blocker-severity objection stands, non-waivable by the parent**; added even-panel
  tie→standing rule; added note that same-model majority reduces variance not bias.
  EVIDENCE: assumptions+bias reviewers both rated the parent's waiver authority a
  blocker (author = aggregator = sole judge).
  REVIEWER: panel verdict revise; this is the primary fix.
- FILE: .claude/agents/parent.md
  CHANGE: "Panel, not pope (always 2–3)" → 1 blind reviewer on standard, panel only
  for complex/high-stakes; blockers non-waivable; decorrelate (diff model family) +
  one exogenous check on high-stakes; "bias controls" reframed to reduce/surface.
  EVIDENCE: simplicity reviewer (panel-by-default tripled Opus cost on standard work,
  against efficiency goal); bias reviewer (same-model correlation, overclaim).
  REVIEWER: majority.
- FILE: docs/AGENT-STANDARDS.md
  CHANGE: merged task-class + ceremony-tier into ONE table (removed duplication);
  standard defaults to 1 reviewer; added "decorrelate the panel" + exogenous check
  section; "blind review is where bias dies" → "highest-value seat"; WIP limit added.
  EVIDENCE: simplicity reviewer (three overlapping taxonomies; nearly 1:1 mapping).
  REVIEWER: major, applied.
- FILE: .claude/skills/retro/SKILL.md
  CHANGE: added anti-self-confirmation guardrails — anchor proposals on OUTCOME
  signals not reviewer agreement; periodic exogenous audit (human/diff-model) of the
  tuning trend; run retro's review seat on a different model family where available.
  EVIDENCE: bias reviewer blocker (closed loop: same author+model tunes own config).
  REVIEWER: blocker, applied.
- FILE: README.md
  CHANGE: added honest "On bias" limits note; marked /retro as optional day-one layer;
  documented self-confirmation risk + outcome-anchor.
  EVIDENCE: bias reviewer (overclaim "eliminate"); simplicity reviewer (retro weight
  vs "just markdown" promise).
  REVIEWER: minor/major, applied.

RESIDUAL / OPEN (named, not yet closed):
- This run's panel was all-opus → correlated blind spots. Future complex runs must
  put ≥1 seat on a different model family.
- No exogenous (human/diff-model) check was applied to v2.1 itself. **Exogenous audit
  due** when the ledger reaches ~10 rows, or on user request now.
