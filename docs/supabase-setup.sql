-- FATHOM global leaderboard — paste into Supabase Dashboard > SQL Editor > Run.
-- One table + one deduping view. Anonymous players INSERT runs with the anon
-- key; nobody can update or delete through the API. Sanity CHECKs keep casual
-- garbage out (client-submitted scores are never fully tamper-proof — fine for
-- a friendly community board).

create table public.scores (
  id         bigint generated always as identity primary key,
  guest_id   text  not null,
  name       text  not null,
  score      int   not null,
  depth      int   not null default 0,
  kills      int   not null default 0,
  stratum    int   not null default 0,
  won        boolean not null default false,
  created_at timestamptz not null default now(),
  -- sanity rails
  constraint name_len   check (char_length(name) between 1 and 20),
  constraint guest_len  check (char_length(guest_id) between 4 and 64),
  constraint score_sane check (score between 0 and 10000000),
  constraint depth_sane check (depth between 0 and 100000),
  constraint kills_sane check (kills between 0 and 100000),
  constraint stratum_sane check (stratum between 0 and 5)
);

create index scores_score_idx on public.scores (score desc);
create index scores_guest_idx on public.scores (guest_id, score desc);

alter table public.scores enable row level security;

-- Anyone may log a run; nobody may edit or erase history through the API.
create policy "anon can insert runs" on public.scores
  for insert to anon with check (true);
create policy "anyone can read runs" on public.scores
  for select to anon using (true);

-- One best entry per player for the TOP DIVERS board.
create view public.leaderboard as
  select distinct on (guest_id)
    name, score, depth, kills, stratum, won, created_at
  from public.scores
  order by guest_id, score desc;

grant select on public.leaderboard to anon;
