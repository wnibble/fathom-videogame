# FATHOM — YouTube Script (two-column A/V)

Narrative devlog, first person, past tense. Target runtime **~10–11 min**
(~1,500 words of voiceover at a conversational pace).

## How to use this script

Every visual is tagged with its source:

| Tag | Meaning |
|---|---|
| **[REC]** | Your screen recording, if you captured this moment. Highest value — spend them here. |
| **[GAME]** | Capture fresh from the live game (it's deployed; record in OBS at 60fps). |
| **[REPO]** | Artifact already in the repo — path given. Pan/zoom stills, scroll files on camera. |
| **[MAKE]** | Quick to generate (e.g. scrolling `git log`, before/after slider). |

**Where to spend your real recordings (priority order):**
1. Typing a prompt and the agent responding — *any* pass (the pass cadence is the thesis)
2. The Act 0 interview — the AI asking YOU questions
3. Agent panels running (especially the 10-agent visual audit)
4. The first playable build booting (Act 1)
5. The sprite extraction pipeline running / magenta debugging

If you don't have a recording for a beat, the [REPO]/[GAME]/[MAKE] fallback
is listed. Nothing in this script depends on footage you might not have.

---

## COLD OPEN (0:00 – 0:25)

**[VISUAL — GAME]** Best 5 seconds of gameplay you can capture: bullet-hell
chaos in Thermal Vents, ember-red, dodging through a gap-ring.

**VO:** Forty hours ago this was an empty folder. One person, no game
engine experience needed, working with AI agents. Forty-three commits.
Every single one built, tested, and shipped. On day one we averaged a
finished feature every eighteen minutes.

**[VISUAL — MAKE]** Hard cut to black. Text on screen: **"Grade: C"**.

**VO:** And then I asked a panel of ten AI critics what they honestly
thought of it… and they gave my game a C. This is the whole story —
including everything that went wrong.

**[VISUAL — MAKE]** Title card: **FATHOM** over gameplay.

---

## ACT 0 — THE INTERVIEW (0:25 – 1:45)

**[VISUAL — REC if you have it]** The very first session: the AI asking
questions, you typing answers. *Fallback [REPO]:* slow scroll of
`fathom-build-bible.md` with key pillars highlighted.

**VO:** Here's the thing I did differently, and honestly it was the
highest-leverage move of the entire project: I didn't start by saying
"make me a game." I started by making the AI interview *me*. What genre?
What's the fantasy? What should danger look like? I answered in plain
language — I wanted a deep-sea bullet-hell roguelite where light is
everything: your weapon, your treasure, and the thing that gets you killed.

**[VISUAL — REPO]** Zoom on the build bible's pillars: "readable danger,"
"glow = weapon / treasure / beacon / identity."

**VO:** The output was a build bible — pillars, a content plan, acceptance
criteria. It became the project's constitution. For the next forty hours,
every decision traced back to this document. Scope before code. Remember
that, because everything that worked later worked because of this.

---

## ACT 1 — 49 MINUTES (1:45 – 3:15)

**[VISUAL — REC]** Terminal running the first build pass. *Fallback
[MAKE]:* animated scroll of `git log --oneline --reverse` with timestamps.

**VO:** July 12th, 3:45 PM: first commit, empty repo. 4:34 PM — forty-nine
minutes later — a playable vertical slice. A diver, a cave, enemies,
bullets.

**[VISUAL — REPO]** Early QA screenshots: `qa-shots/01-loading.png` through
`04-combat-late.png` — the ugly procedural-art era, shown proudly.

**VO:** It was ugly. Programmer art, glowing circles. Didn't matter. From
that moment the method locked in: small passes, always green. Build a
feature, run an automated QA playthrough — an actual robot playing the
game headlessly, taking screenshots — commit, push. Repeat.

**[VISUAL — MAKE]** Fast montage synced to music: XP and upgrades appear,
enemy variety, audio, the station with three shops. Overlay a commit
counter ticking up: 5… 12… 20… 28.

**VO:** Twenty-eight commits in eight hours. Roguelite progression, three
enemy archetypes, meta-progression, a hub station with shops. Robots
played my game seventy-seven times and took four hundred and thirty-three
screenshots so that a broken build never — not once — reached the main
branch.

---

## ACT 2+3 — THE ART HANDOFF (and the pink disaster) (3:15 – 5:15)

**[VISUAL — GAME/REPO]** Side-by-side: procedural placeholder art vs. a
finished sprite.

**VO:** By eleven PM the placeholder art had hit its ceiling. I can't draw.
I didn't hire an artist. Instead, I asked my agent to write a *prompt for
ChatGPT* — but not "draw me a fish." A contract: exact sheet layouts, a
JSON manifest of bounding boxes, pivot rules, palette, animation frame
conventions. Art as data.

**[VISUAL — REPO]** The raw ChatGPT sheets from
`Game asset (pictures with guide)/` — glorious magenta backgrounds, grid
of sprites. Then `contact-sheet.png` showing 341 extracted sprites.

**VO:** ChatGPT generated sixteen sheets. A custom extraction pipeline —
flood-fill background removal, trimming, alignment, atlas merging — turned
them into three hundred and forty-one game-ready sprites. The diver, the
fauna, the boss, a companion dog. All integrated the same night.

**[VISUAL — REC if you have it]** Extraction pipeline runs / debugging.
*Fallback [MAKE]:* extreme zoom on a sprite edge showing pink fringing.

**VO:** Now, the honest part. That magenta background? Right idea —
trivially easy to key out. Miserable execution. Anti-aliased pink fringes
on every edge. Neighboring sprites bleeding into each other's crop boxes.
Magenta trapped *inside* enclosed shapes. It took four complete rewrites
of the extraction pipeline to tame it. If you ever do this: demand
true-alpha PNGs or a strict padded grid, and never believe a generator
that promises you a "flat background."

---

## ACT 4+5 — A WORLD, THEN A CAGE (5:15 – 7:00)

**[VISUAL — GAME]** Diving through a portal; the Surface Station,
walkable, with devices.

**VO:** Day two the game became a place. Early on, the world just…
changed under you as you descended — and it felt exactly as random as it
sounds. We replaced it with physical portals you swim into, and it was
night-and-day better. The game went live on Vercel, so from that point
every single push was instantly playable by anyone with the link.

**[VISUAL — REC]** The prompt: "boundaries look incomplete… tunnels…
rooms… run the agents." *Fallback [MAKE]:* the quote as on-screen text.

**VO:** Then I typed the note that triggered the biggest system in the
game. I told the agents the map boundaries looked incomplete, asked for
tunnels and rooms, and said: run the agents, seek the best answer. A
three-specialist design panel came back with carved-space caverns — the
world is solid rock, and playable space is *carved out* of it. Darkness
baked beyond the walls. Bullets die on rock.

**[VISUAL — GAME/REPO]** A cramped early carved room (QA screenshots from
`qa-cave`/`qa-cavern`), then cut to a vast open cavern (`qa-vast`).

**VO:** And I immediately hated it. Small rooms, hard walls — I called it,
quote, "the worst addition thus far." Here's the lesson: the fix wasn't
removing the walls. It was scale. Vast rooms, soft brush-contact instead
of hard collision. The same system went from cage to landscape in two
feedback passes. My entire job in this project was playing the game and
complaining accurately.

---

## ACT 6 — THE MIRROR (7:00 – 8:45)

**[VISUAL — REC]** The 10-agent panel running — the money shot if you have
it. *Fallback [MAKE]:* diagram: 6 visual lenses → 3 rule-writers → 1
creative-director judge.

**VO:** By day three the game worked. But I'd been staring at it for forty
hours, and I'd gone blind to it. So I asked for the harshest thing I
could think of: assess how this game *looks*. Use as many agents as
possible. Ten agents — six visual critics, three rule-writers, and a
creative director to judge it all.

**[VISUAL — MAKE]** The verdict as stark text on screen: **"C."** Then the
quotes, typed out one by one: *"The player is the dimmest thing on
screen."* *"Wreck and Vents are the same brown room."*

**VO:** The verdict: C. And it was *specific*. The player — the hero of a
game about light — was the dimmest thing on screen. Two entire zones were
visually the same brown room. In twenty of twenty-three audit screenshots
there were zero bullets on screen. My bullet-hell had no bullets. The
fights weren't arriving.

**[VISUAL — REPO]** Scroll `docs/MAP-RULES.md`. Then before/after sliders:
brown Vents → ember-red Vents; dim player → figure-ground lighting.

**VO:** But it didn't just criticize — it produced thirty testable
generation rules, and eight concrete fixes. All implemented the same day.
Per-stratum color palettes. Hue-preserving darkness — get this: before the
fix, the *entire* visual difference between The Wreck and Thermal Vents
was a per-channel difference of two, out of two fifty-five. A spawn ring
that guarantees the fight comes to you. Getting a C from your own robots
stings. Shipping the fixes eight hours later doesn't.

---

## ACT 7 — THE SONGBOOK (8:45 – 9:30)

**[VISUAL — GAME]** Pattern showcase: gap-rings with visible dodge lanes,
wave walls, spiral fire-hoses, a Rebound shot ricocheting off rock.

**VO:** The last pass gave the game its vocabulary. A shot-pattern engine:
rings with deliberate gaps you learn to read, walls that come in waves,
spiral fire-hoses. And the player got answers — seeker rounds, a rear
guard, and Rebound, which turns the carved rock itself into a weapon,
ricocheting shots around corners.

---

## ENDING — THE HONEST REEL (9:30 – 11:00)

**[VISUAL — MAKE]** Rapid-fire checklist over gameplay, items appearing
with ✓ / ✗ marks.

**VO:** So, honest scorecard. What's real: six strata, a boss, nineteen
upgrades, six weather climates, badges, market boons, deployed and
playable in your browser right now. What's not: there's one boss, and he's
lonely. The audio is procedural blips — no music. Balance past level
twenty-five is lightly tested. No touch controls. It is not a finished
game. It's a finished *foundation* — built in a weekend.

**[VISUAL — REC/GAME]** LIVE moment: open the Vercel dashboard, connect
Upstash, hit `/api/lb-health`, watch `configured:false` flip to `true`.
Then submit the first score with your callsign.

**VO:** And one thing has been sitting one click from live this whole
video: the leaderboard. Let's fix that right now… there. It's live. The
board is empty, and that first slot has my name on it. The game's linked
below — come take it from me.

**[VISUAL — MAKE]** End card: game URL + subscribe. Text: *"43 commits.
40 hours. 0 broken builds."*

**VO:** If you want the deeper breakdown — the exact prompts, the build
bible, the agent panels — that's the next video. Subscribe if you want to
see how deep this goes.

---

## Shot checklist (for editing day)

| # | Shot | Source | Status |
|---|---|---|---|
| 1 | Best-gameplay cold open (Vents, bullet chaos) | GAME | ☐ |
| 2 | Act 0 interview session | REC or build-bible scroll | ☐ |
| 3 | First-pass terminal / git log animation | REC or MAKE | ☐ |
| 4 | Ugly-era QA screenshots (`qa-shots/`) | REPO | ☐ |
| 5 | Day-1 feature montage + commit counter | GAME + MAKE | ☐ |
| 6 | Magenta ChatGPT sheets (`Game asset (pictures with guide)/`) | REPO | ☐ |
| 7 | `contact-sheet.png` — 341 sprites | REPO | ☐ |
| 8 | Pink-fringe zoom / extraction debugging | REC or MAKE | ☐ |
| 9 | Portal dive + Surface Station | GAME | ☐ |
| 10 | Cramped room vs. vast cavern (`qa-cave` vs `qa-vast`) | REPO | ☐ |
| 11 | 10-agent panel running | REC or diagram | ☐ |
| 12 | "Grade: C" card + critic quotes | MAKE | ☐ |
| 13 | Before/after: Vents color, player lighting | REPO/GAME | ☐ |
| 14 | `MAP-RULES.md` scroll | REPO | ☐ |
| 15 | Shot-pattern showcase | GAME | ☐ |
| 16 | Leaderboard flip-to-live + first score | REC live | ☐ |
| 17 | End card | MAKE | ☐ |
