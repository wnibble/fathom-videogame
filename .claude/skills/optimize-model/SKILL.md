---
name: optimize-model
description: Pick the cheapest model tier that will succeed for a given task. The parent runs this before dispatching a child (especially the researcher) and passes the chosen tier as the Agent call's model override. Use whenever you're about to delegate work and want to match compute to difficulty instead of defaulting to Opus.
---

# optimize-model

Match compute to the task. Don't pay the Opus tax on a doc lookup; don't send a
gnarly debugging job to Haiku and waste a round-trip on a wrong answer.

## How to use
1. Score the task on the five axes below (0–2 each).
2. Sum the scores.
3. Map the total to a tier.
4. Pass that tier as the `model` override in the Agent dispatch.

## Scoring rubric (0 = low, 1 = medium, 2 = high)

| Axis | 0 | 1 | 2 |
|------|---|---|---|
| **Reasoning depth** — chained inference needed | lookup / recall | some synthesis | multi-step reasoning, design, tricky debugging |
| **Context size** — how much must be held at once | one file / snippet | a few files | sprawling, cross-cutting |
| **Ambiguity** — how underspecified | crisp question | some interpretation | vague, needs judgment |
| **Stakes** — cost of a wrong answer | throwaway | rework | breaks the build / ships a bug |
| **Breadth** — how many things to track | single thread | a handful | many interacting parts |

## Total → tier

| Total | Tier | Typical use |
|-------|------|-------------|
| **0–3** | `haiku` | doc lookups, grep/find, "where is X", simple fact-finding |
| **4–6** | `sonnet` | multi-file research, routine QA runs, moderate synthesis |
| **7–10** | `opus` | design, subtle debugging, blind review, anything high-stakes |

## Standing overrides (skip scoring)
- **reviewer → always `opus`.** Adversarial reasoning is the point; never cheap.
- **parent → always `opus`.** It holds all context and makes final calls.
- **architect → `opus`.** Decomposition is high-reasoning. But don't dispatch it
  at all for trivial/small tasks — the cheapest plan is the parent's own.
- **qa → `sonnet` floor**, escalate to `opus` on repeated/subtle failures.
- **optimizer → `sonnet` floor**, escalate to `opus` for algorithmic / perf-
  critical work; pure simplify/dedup passes can run `sonnet`.
- **researcher → score it.** This is where the skill earns its keep — most
  research is haiku/sonnet.

## Output
State the decision in one line so the dispatch is auditable, e.g.:

> optimize-model: researcher task scored 2 (depth 0, ctx 1, ambig 0, stakes 1,
> breadth 0) → **haiku**

Then dispatch with that tier. When a child reports in GAPS/COVERAGE that the tier
was too low, re-dispatch one tier up — don't re-score from scratch.
