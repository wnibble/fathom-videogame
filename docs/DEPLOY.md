# Deploying FATHOM

The game is a fully static Vite build (`npm run build` → `dist/`). Saves are
localStorage. No server, env vars, or database are required for v1.
`vite.config.ts` uses `base: "./"` so the build runs from any host or subpath.
`vercel.json` pins the framework/build/output + cache headers.

## Vercel (recommended: git integration)

1. vercel.com → **Add New… → Project** → Import `wnibble/fathom-videogame`.
2. Vercel auto-detects Vite (build `npm run build`, output `dist`) — accept and **Deploy**.
3. Done. Every push to `main` auto-deploys; PRs get preview URLs.

### CLI alternative
```bash
npx vercel login          # one-time browser auth
npx vercel --prod         # from the repo root
```

## Global leaderboard (BUILT — one setup step, all inside Vercel)

The game ships the full client: every finished run auto-submits (callsign,
score, depth, kills, stratum, won) and the menu shows a TOP DIVERS board. With
no storage configured it silently no-ops and the game stays offline-playable.

**Primary path — Upstash Redis via Vercel Marketplace ($0, no extra account):**

1. Vercel Dashboard → your project → **Storage** tab → **Create Database** →
   **Upstash for Redis** (Marketplace) → free plan → **Connect to project**.
   That injects `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (or
   `KV_REST_API_*`) automatically.
2. **Redeploy.** Done — `api/lb-submit.ts` + `api/lb-top.ts` (serverless
   functions in this repo) handle writes/reads; a Redis sorted set keeps each
   player's best run. Keys never reach the browser.

Players get a default callsign (`DIVER-XXXX`) editable from the main menu.

**Alternative — Supabase** (if you have a free project slot): run
`docs/supabase-setup.sql` in its SQL editor and set `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY` in Vercel env vars; the client auto-prefers Supabase
when those exist.

### Later, if wanted
- **Cloud saves** — mirror localStorage `SaveData` into `saves(guest_id, data
  jsonb, updated_at)`; last-write-wins.
- **Auth** — Supabase magic-link to carry saves across devices.
- **Daily challenge** — a shared daily seed + per-day leaderboard view.
