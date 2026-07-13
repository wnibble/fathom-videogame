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

## Supabase — global leaderboard (BUILT, needs 3 setup steps)

The game already ships the client (`src/online/leaderboard.ts`): every finished
run auto-submits (callsign, score, depth, kills, stratum, won) and the menu
shows a TOP DIVERS board. With no keys configured it all silently no-ops and the
game stays fully offline-playable. To turn it on:

1. **Create a project** at supabase.com (free tier is plenty).
2. **Run the schema**: Dashboard → SQL Editor → paste `docs/supabase-setup.sql`
   → Run. (Table + RLS: anon can insert/read runs, never update/delete; a
   `leaderboard` view keeps one best entry per player.)
3. **Add env vars** in Vercel → Project → Settings → Environment Variables:
   - `VITE_SUPABASE_URL` = your project URL (Settings → API)
   - `VITE_SUPABASE_ANON_KEY` = the anon/public key (safe to expose under RLS)
   Then **Redeploy**. Local testing: put the same two lines in `.env.local`.

Players get a default callsign (`DIVER-XXXX`) editable from the main menu.

### Later, if wanted
- **Cloud saves** — mirror localStorage `SaveData` into `saves(guest_id, data
  jsonb, updated_at)`; last-write-wins.
- **Auth** — Supabase magic-link to carry saves across devices.
- **Daily challenge** — a shared daily seed + per-day leaderboard view.
