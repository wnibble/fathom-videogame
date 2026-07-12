# runs/ — the learning record

This is the memory the self-improvement module (`/retro`) learns from.

| File | Written by | Purpose |
|------|-----------|---------|
| `ledger.jsonl` | the parent at `/build` close-out | **Primary signal.** One structured row per run: fleet sizing, model tiers, QA rounds, reviewer objections, tier mismatches, outcome. |
| `raw-events.jsonl` | the Stop hook (optional backstop) | Records that a session ended (+ transcript path) even if it didn't go through `/build`, so `/retro` can notice un-logged runs. |
| `TUNING-LOG.md` | `/retro` after a change is applied | Auditable history of every config edit + the evidence and reviewer verdict behind it. Revert from here. |
| `PROPOSAL.md` | `/retro` (transient) | The current proposed changes, pre/post review. Cleared or marked applied each cycle. |
| `activity.jsonl` | the loop, as it works (heartbeat) | Live progress stream the **dashboard** renders as "⚡ Agent activity". One row per phase step. |

### activity.jsonl row schema
One JSON object per line. `phase` must be one of the styled set or it renders as a
neutral pill: **`plan` · `research` · `build` · `qa` · `review` · `ship` · `error` · `heartbeat`**.
```json
{"ts":"2026-06-22T03:01:00Z","phase":"build","agent":"parent","msg":"what is happening right now"}
```
The dashboard whitelists `phase` for the CSS class (untrusted values are safe), and
shows newest-first. Any producer (not just this team) can append to it.

## ledger.jsonl row schema
One JSON object per line, no comments:
```json
{"ts":"2026-06-22T14:00:00Z","goal":"add CSV export","task_class":"standard","fleet":{"researcher":1,"qa":1,"reviewer":1},"models":{"researcher":["haiku"],"qa":["sonnet"],"reviewer":["opus"]},"qa":{"rounds":2,"final":"PASS"},"reviewer":{"objections":{"blocker":0,"major":1,"minor":2},"verdict":"ship"},"tier_mismatches":[{"agent":"researcher","scored":"haiku","needed":"sonnet"}],"outcome":"shipped","notes":"researcher needed sonnet for API semantics"}
```

The `tier_mismatches` and `qa.rounds` fields are the highest-value learning
signals — fill them honestly.
