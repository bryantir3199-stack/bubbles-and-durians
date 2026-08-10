-- Bubbles & Durians leaderboard schema
-- Run this in the Supabase SQL editor for your project.

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 16),
  score int not null check (score >= 0),
  mode text not null check (mode in ('endless', 'timed')),
  created_at timestamptz default now()
);

create index if not exists scores_mode_score_idx on public.scores (mode, score desc);

alter table public.scores enable row level security;

-- Anyone can read the leaderboard
create policy "Public read scores"
  on public.scores
  for select
  to anon, authenticated
  using (true);

-- Anyone can insert a score (no updates/deletes from clients)
create policy "Public insert scores"
  on public.scores
  for insert
  to anon, authenticated
  with check (true);
