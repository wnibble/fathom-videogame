# FATHOM — Development Retrospective (video companion)

One person + AI agents, from empty folder to a deployed, community-ready
bullet-hell roguelite. All numbers below are pulled from the actual git
history and repo — receipts, not vibes.

---

## THE HEADLINE METRICS

| Metric | Value |
|---|---|
| Calendar time, first commit → latest | ~40 hours (Jul 12 15:45 → Jul 14 08:06) |
| Commits | 43 (every one built, QA'd green, and pushed) |
| **Day 1 alone** | **28 commits in ~8h15m — one shipped feature every ~18 minutes** |
| TypeScript written | 8,748 lines across 53 files |
| QA / pipeline tooling written | 1,162 lines across 9 tools |
| Total insertions | 28,305 lines |
| Game-ready sprites extracted | 341 (from 16 ChatGPT-generated sheets) |
| Headless QA playthroughs | 77 recorded runs, 433 screenshots |
| AI review/design agents convened | ~20 across 3 formal panels + blind playtests |
| Content shipped | 6 strata · 3 enemy archetypes + 1 boss · 19 upgrades · 6 weather climates · 15 badges · 5 market boons · 9+ bullet patterns |
| Deployment | Live on Vercel (auto-deploy per push) + serverless leaderboard |

---

## THE ARC (act structure for the video)

### Act 0 — The interview (before any code)
You didn't start with "make me a game." You started by having the AI **ask
YOU questions** about what game you wanted — genre, feel, fantasy, scope —
and answered in plain language. The output was the **build bible**: pillars
(readable danger, glow = weapon/treasure/beacon/identity), a content plan,
and acceptance criteria. Every later decision traced back to it.
> This was the single highest-leverage move of the project.

### Act 1 — The playable slice in one evening (Jul 12, 15:45–19:00)
- 16:34 — Pass 1: runnable vertical slice (49 min after repo init)
- Blind-review panel + playtest loop caught blockers before you ever did
- Passes 3–5: roguelite spine (XP/upgrades/score), enemy variety, audio,
  meta-progression with a station and 3 shops

### Act 2 — Identity and juice (Jul 12 evening)
- The "glow double-bind": graze to charge, bio-pulse, dread that hunts the bright
- Weather system (6 double-edged climates), elite mutations, hero landmarks
- Game-feel batch: trauma shake, hit-stop, squash & stretch, muzzle flash,
  floating damage numbers, camera lead (later dialed back — see "didn't work")

### Act 3 — The graphics hand-off (Jul 12, ~23:00)
The procedural placeholder art hit its ceiling. Instead of drawing, you asked
for a **ChatGPT sprite-generation prompt with a machine-readable contract**:
exact sheet layouts, a JSON manifest of bounding boxes ("locationing
protocol"), pivot rules, palette, animation frame conventions. ChatGPT
generated 16 sheets; a custom extraction pipeline (flood-fill background
removal, trimming, frame alignment, atlas merge) turned them into 341
game-ready sprites. **Diver, fauna, boss, companion dog, station — all real
art, integrated the same night.**

### Act 4 — World becomes a place (Jul 12 23:30 → Jul 13)
- Portal-gated descent (killed the "terrain randomly changes" complaint)
- Walkable Surface Station → then a full tiled substation deck with devices
- Deployed to Vercel; leaderboard built (Supabase → ported to Vercel
  functions + Upstash when the free tier was unavailable)

### Act 5 — The map revolution (Jul 13 evening)
Your note — "boundaries look incomplete… tunnels… rooms… make beyond the wall
darker… run the agents" — triggered the biggest system: a 3-specialist design
panel produced **carved-space caverns**: the world is solid rock, playable
space is carved as rooms + tunnels; darkness is baked beyond the walls;
bullets die on rock. Then your two follow-ups ("too small", "confining is
the worst") reshaped it into vast, per-run-varied expeditions with soft wall
contact. Iteration in public, guided by feel.

### Act 6 — The mirror (Jul 14)
A **10-agent panel** (6 visual lenses → 3 rule-writers → creative-director
judge) graded the game a brutal, specific **C** — "the player is the dimmest
thing on screen; Wreck and Vents are the same brown room" — and produced
MAP-RULES.md (30 testable generation rules) plus 8 fixes, implemented same
day: per-stratum palettes, hue-preserving darkness, figure-ground lighting,
ember-red Thermal Vents, on-screen spawn annulus, boss staging.

### Act 7 — The songbook (Jul 14)
New shot-pattern engine: gap-rings with dodge lanes, wave walls, spiral
fire-hoses, cross bursts for enemies; Seeker / Rebound (wall-ricochet) /
Rear Guard upgrades for the player.

---

## YOUR PROMPTS — WHAT YOU ASKED, WHY, WHAT HAPPENED

| Prompt (paraphrased) | Why | Result |
|---|---|---|
| "Ask me questions about the game I want" | Scope before code | The build bible — the project's constitution |
| "Build it / do another pass" ×many | Momentum | 43 shipped commits; the pass cadence became the whole method |
| Feel complaints in plain language ("glow annoying", "nauseating camera", "clunky", "stale wisp", "white blob") | You played, it felt wrong | Every one became a targeted, verified fix — this feedback loop was the co-op core |
| "Give me a ChatGPT prompt for sprites, include locationing protocol" | Real art without an artist | 16 sheets → extraction pipeline → 341 sprites |
| "Draft the next feature and run it in a full loop; agent permissions" | Trust the plan step | Living-world plan whose blind reviewers corrected the author |
| Bug reports ("accidental exit", "orbs not picked up", "enemies outside map") | QA by playing | Confirm-to-quit, magnet fix, carve confinement |
| "Make it community-driven, leaderboards, people go crazy" | Stakes | Zero-dependency leaderboard + callsigns + difficulty rebuff |
| "Revamp the map… run the agents to seek the best answer" | Ambition + delegation | Carved-cavern architecture (the game's biggest system) |
| "Assess how this game looks; as many agents as possible; create map rules" | Outside eyes | The C-grade audit + MAP-RULES.md + same-day fixes |
| "New shot patterns" | Combat depth | Pattern engine + 5 enemy patterns + 3 player upgrades |

---

## WHAT WORKED

1. **Questions before code.** The build bible meant every pass had a target.
2. **Small passes, always green.** Build → QA (headless playthrough) → commit
   → push. 43/43 commits shipped working. No broken-main days.
3. **Feel-language feedback.** "Nauseating," "clunky," "stale" — no jargon
   needed. Each mapped to concrete parameters.
4. **The art contract.** ChatGPT sprites *worked* because the ask included a
   machine-readable manifest + extraction rules — art became data.
5. **Agent panels at inflection points** (not constantly): blind reviewers
   killed bad assumptions; the 10-agent audit found what we'd gone blind to.
6. **Deploy early.** Vercel git-integration on day 2 meant every later push
   was instantly playable by anyone.
7. **Writing QA harnesses as features shipped.** 77 recorded playthroughs
   caught regressions the moment they happened.

## WHAT DIDN'T WORK (the honest reel)

1. **The magenta background (#ff00ff).** Right *idea* (trivial to key out),
   messy *execution*: anti-aliased pink fringes, neighbor sprites bleeding
   into generous crop boxes, magenta trapped in enclosed holes (the valve),
   fused "double" sprites. It took **four rounds** of extraction fixes
   (border flood-fill → global magenta sweep → stray-component filter →
   near-equal-bleed cut). Lesson: ask generators for true-alpha PNGs or
   strict padded grid cells; never trust "flat background" claims.
2. **Generated animation frames aren't aligned.** ChatGPT draws each frame at
   slightly different offsets — devices wobbled, the diver jittered. Fix:
   per-frame centering at extraction. Budget for it from the start.
3. **Auto depth-based level switching.** Felt like the world "randomly
   changed under you." Replaced with physical portals — night-and-day better.
4. **Hard confinement + small rooms** — your single worst-rated addition
   ("the worst addition thus far"). The fix wasn't removing walls; it was
   vast rooms + soft brush-contact. Cage → landscape.
5. **Additive glow stacking.** A loot-compounding build turned drop piles
   into white blobs and melted the frame rate. Merged pickups + FX caps.
6. **Assuming the Supabase free tier.** Yours was used up — ported the
   leaderboard to Vercel functions + Upstash mid-stream.
7. **Agent limits are real.** One judge agent died to a session cap mid-
   workflow; the three specialist specs had to be merged by hand.

## THE GAPS (what's honestly not done)

- **Leaderboard is one click from live** — Upstash still isn't connected to
  the Vercel project (`/api/lb-health` says `configured:false`).
- **Audio** is procedural blips + drone. No music, no layered mix.
- **One boss.** The Cradle guardian is solid but lonely; strata 4–5 (Abyssal
  Plain, Cradle) are the least visually distinct.
- **MAP-RULES backlog**: noise-perturbed wall silhouettes (kill the last
  perfect circles), room-role grammar (L1–L6), landmark rooms, ring-color
  language audit.
- **Balance beyond ~level 25** is lightly tested; the loot-compounding
  degenerate loop is tamed, not tuned.
- **No cloud saves / daily challenge / accounts** — designed, documented,
  not built.
- **Desktop-web only.** No touch controls, no gamepad.

## METRICS YOU DIDN'T KNOW YOU HAD

- **49 minutes**: empty repo → first playable build.
- **~18 minutes**: average time between shipped features on day 1.
- **4 extraction-pipeline rewrites** to tame ChatGPT's pink.
- **433 screenshots** taken by robots playing your game.
- **20 of 23** audit screenshots had zero bullets on screen — the finding
  that produced the spawn-annulus fix ("fights weren't arriving").
- **The difficulty bug you found by having fun**: portal descent had silently
  decoupled depth from danger; your "second round seemed slower" report was
  the only signal.
- **2 lines of channel data** (per-channel delta of 2/255) was the entire
  visual difference between The Wreck and Thermal Vents before the
  hue-preserving darkness fix.
