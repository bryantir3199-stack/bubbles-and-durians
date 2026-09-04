-- Bubbles & Durians leaderboard schema
-- Run this in the Supabase SQL editor for your project.
--
-- If scores already exists with 1–16 character names:
--   alter table public.scores drop constraint if exists scores_player_name_check;
--   alter table public.scores add check (char_length(player_name) = 3);
--
-- If scores already exists with mode in ('endless', 'timed'):
--   alter table public.scores drop constraint if exists scores_mode_check;
--   alter table public.scores add check (mode in ('endless', 'timed', 'timed-short', 'timed-medium'));
-- Legacy mode='timed' rows stay in the table but new scores use timed-short / timed-medium.

create table if not exists public.scores (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) = 3),
  score int not null check (score >= 0),
  mode text not null check (mode in ('endless', 'timed', 'timed-short', 'timed-medium')),
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

-- Ranking boards keep the best 100 scores per mode (newest wins ties).
-- Re-run this block in SQL Editor to cap an existing project.
delete from public.scores
where id in (
  select id from (
    select id,
      row_number() over (partition by mode order by score desc, created_at desc) as rn
    from public.scores
  ) ranked
  where rn > 100
);

create or replace function public.trim_scores_to_ranking_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.scores
  where id in (
    select id from public.scores
    where mode = NEW.mode
    order by score desc, created_at desc
    offset 100
  );
  return null;
end;
$$;

drop trigger if exists scores_trim_ranking_cap on public.scores;
create trigger scores_trim_ranking_cap
after insert on public.scores
for each row
execute procedure public.trim_scores_to_ranking_cap();
