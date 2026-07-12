---
description: Operations-Agents — run the self-improvement retro: score the ledger, propose tuning, blind-review, apply, log.
argument-hint: (optional focus area)
model: opus
---

Run the Operations-Agents self-improvement module per
`.claude/skills/retro/SKILL.md`.

Optional focus for this cycle: $ARGUMENTS

Steps:
1. Read `runs/ledger.jsonl`; compute signals (tier mismatches, QA rounds, reviewer
   objections, fleet-vs-outcome, repeated deviations).
2. Draft `runs/PROPOSAL.md` — small, **outcome-anchored**, evidence-backed diffs.
   Respect the ≥3-run guardrail; a **no-op retro is a valid result**.
3. Gate the proposal through the **blind reviewer**; apply ONLY changes it doesn't
   block, to `optimize-model` / `docs/AGENT-STANDARDS.md`.
4. Log every applied change to `runs/TUNING-LOG.md`; append heartbeats to
   `runs/activity.jsonl`.
5. **Request my ratification** for any bias-control change (the loop cannot
   self-certify those — that's the exogenous check).
