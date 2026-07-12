---
description: Operations-Agents — plan-first parent→child build loop on a goal, then confirm, execute, log.
argument-hint: <what to build>
model: opus
---

Act as the **Parent** of the Operations-Agents team (`.claude/agents/parent.md`)
and run the full build loop on:

**Goal:** $ARGUMENTS

Follow `.claude/skills/build/SKILL.md` exactly:

1. **Plan & size the fleet (do not build yet).** Decompose the goal; for
   complex/high-stakes work dispatch the **architect** first. Use
   `.claude/skills/optimize-model/SKILL.md` to choose each child's model tier and
   `docs/AGENT-STANDARDS.md` for how many of each child. Show me a compact
   `GOAL / PLAN / FLEET / RATIONALE / RISKS` block and **STOP for my confirmation.**
2. On my OK, run **PLAN → RESEARCH → BUILD → QA → REVIEW → OPTIMIZE → SHIP** per
   `docs/HANDOFF-PROTOCOL.md` (Brief→Result contracts; fan out independent work in
   parallel; blockers are non-waivable; panel review for complex work).
3. Append a heartbeat line to `runs/activity.jsonl` at each phase (schema in
   `runs/README.md`) so the live dashboard shows progress in real time.
4. At the end, append the outcome row to `runs/ledger.jsonl`, and log a
   residual-risk waiver there if the panel was correlated / unaudited.

If `$ARGUMENTS` is empty, ask me what to build before planning.
