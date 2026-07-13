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

## Phase 2 — Supabase (online features)

Nothing blocks shipping v1 without it. When ready, the natural additions:

1. **Global leaderboard** — table `runs(id, player_name, score, depth, kills,
   won, created_at)`; insert from the game-over screen via `@supabase/supabase-js`
   with the anon key + RLS (insert-only for anon, read for all). Render a "TOP
   DIVERS" board on the menu.
2. **Cloud saves** — mirror the localStorage `SaveData` into a `saves(guest_id,
   data jsonb, updated_at)` table keyed by the existing guestId; last-write-wins.
3. **Auth (optional)** — Supabase magic-link auth to carry saves across devices.

Supabase env vars would go in Vercel project settings as
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (safe to expose with RLS).
