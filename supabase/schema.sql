-- Song Wars — Phase 2 schema
-- Run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
--
-- Requires Anonymous sign-ins enabled: Dashboard -> Authentication -> Sign In / Providers
-- -> Anonymous Sign-Ins -> Enable. Each browser tab gets its own anonymous auth.uid(),
-- which is what lets Row Level Security actually tell "your own row" apart from your
-- opponent's — a plain shared anon API key alone can't do that.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- games: one row per room. code is the 4-character join code shown to players.
-- ---------------------------------------------------------------------------
create table if not exists games (
  code text primary key,
  status text not null default 'lobby' check (status in ('lobby', 'wheel', 'playing', 'finished')),
  prompts jsonb not null default '[]'::jsonb,
  round_index int not null default 0,
  round_started_at timestamptz,
  -- Phase 3 [P1]-[P4]: shared timestamps for synced auto-play/replay/skip.
  -- All reset to their defaults on every round change.
  reveal_started_at timestamptz,
  skip_requested_at timestamptz,
  replay1_used boolean not null default false,
  replay2_used boolean not null default false,
  replay_active_at timestamptz,
  replay_active_song int,
  -- Phase 4/5: best of 5 + sudden death, Double or Nothing.
  match_type text not null default 'main' check (match_type in ('main', 'bonus')),
  match_start_round_index int not null default 0,
  bonus_offer_status text check (bonus_offer_status in ('pending', 'accepted', 'declined')),
  bonus_offer_started_at timestamptz,
  loser_player_id uuid,
  double_win boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- players: up to 2 per game. user_id ties a row to a specific browser's
-- anonymous auth session, which RLS uses below.
-- ---------------------------------------------------------------------------
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references games(code) on delete cascade,
  user_id uuid not null default auth.uid(),
  slot int not null check (slot in (0, 1)),
  name text not null,
  genre text,
  artist text,
  created_at timestamptz not null default now(),
  unique (game_code, slot)
);

alter table games add constraint games_loser_player_id_fkey
  foreign key (loser_player_id) references players(id);

-- Prevents a 3rd player from ever claiming a slot, even under a race.
create or replace function enforce_two_players()
returns trigger as $$
begin
  if (select count(*) from players where game_code = new.game_code) >= 2 then
    raise exception 'Room % is already full', new.game_code;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_two_players on players;
create trigger trg_enforce_two_players
  before insert on players
  for each row execute function enforce_two_players();

-- ---------------------------------------------------------------------------
-- submissions: one row per player per round. Hidden from the opponent until
-- both rows exist for that round — enforced by the trigger + RLS below, not
-- just by the client choosing not to render it.
-- ---------------------------------------------------------------------------
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references games(code) on delete cascade,
  round_index int not null,
  player_id uuid not null references players(id) on delete cascade,
  track jsonb not null,
  revealed boolean not null default false,
  submitted_at timestamptz not null default now(),
  unique (game_code, round_index, player_id)
);

create or replace function reveal_submissions_when_both_in()
returns trigger as $$
begin
  if (
    select count(*) from submissions
    where game_code = new.game_code and round_index = new.round_index
  ) >= 2 then
    update submissions set revealed = true
    where game_code = new.game_code and round_index = new.round_index;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_reveal_submissions on submissions;
create trigger trg_reveal_submissions
  after insert on submissions
  for each row execute function reveal_submissions_when_both_in();

-- ---------------------------------------------------------------------------
-- votes: same hidden-until-both-cast pattern as submissions, so a player
-- can't see the opponent's vote before casting their own.
-- ---------------------------------------------------------------------------
create table if not exists votes (
  id uuid primary key default gen_random_uuid(),
  game_code text not null references games(code) on delete cascade,
  round_index int not null,
  voter_player_id uuid not null references players(id) on delete cascade,
  voted_for_player_id uuid references players(id) on delete cascade, -- null = no vote cast
  revealed boolean not null default false,
  voted_at timestamptz not null default now(),
  unique (game_code, round_index, voter_player_id)
);

-- Postgres only auto-indexes primary/unique keys, not plain foreign-key
-- columns — every query here filters by game_code (and often round_index
-- too), so these are worth having from the start rather than as a
-- surprise-scan fix later.
create index if not exists idx_players_game_code on players(game_code);
create index if not exists idx_submissions_game_round on submissions(game_code, round_index);
create index if not exists idx_votes_game_round on votes(game_code, round_index);

create or replace function reveal_votes_when_both_in()
returns trigger as $$
begin
  if (
    select count(*) from votes
    where game_code = new.game_code and round_index = new.round_index
  ) >= 2 then
    update votes set revealed = true
    where game_code = new.game_code and round_index = new.round_index;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_reveal_votes on votes;
create trigger trg_reveal_votes
  after insert on votes
  for each row execute function reveal_votes_when_both_in();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table games enable row level security;
alter table players enable row level security;
alter table submissions enable row level security;
alter table votes enable row level security;

-- Helper functions used by the policies below instead of inline subqueries on
-- `players`. A policy that queries the same table it's attached to (or that
-- indirectly queries `players` while a `players` policy is itself being
-- evaluated) causes Postgres to report "infinite recursion detected in
-- policy". These are security definer, so they run as the function owner and
-- bypass RLS internally, breaking that recursion.
create or replace function my_player_ids()
returns setof uuid
language sql
security definer
stable
as $$
  select id from players where user_id = auth.uid();
$$;

create or replace function my_game_codes()
returns setof text
language sql
security definer
stable
as $$
  select game_code from players where user_id = auth.uid();
$$;

-- games: any signed-in (anonymous) client can create a room or read/update
-- one it's already part of. Room codes are short-lived and not sensitive.
drop policy if exists "games are readable by anyone signed in" on games;
create policy "games are readable by anyone signed in" on games
  for select using (auth.uid() is not null);

drop policy if exists "anyone signed in can host a room" on games;
create policy "anyone signed in can host a room" on games
  for insert with check (auth.uid() is not null);

drop policy if exists "players in the game can update it" on games;
create policy "players in the game can update it" on games
  for update using (games.code in (select my_game_codes()));

-- players: visible to the other player in the same room (genre/artist picks
-- aren't secret — only the per-round song submission is).
drop policy if exists "players in a room can see each other" on players;
create policy "players in a room can see each other" on players
  for select using (players.game_code in (select my_game_codes()));

drop policy if exists "a signed-in client can join a room as itself" on players;
create policy "a signed-in client can join a room as itself" on players
  for insert with check (auth.uid() = user_id);

drop policy if exists "a player can update their own row" on players;
create policy "a player can update their own row" on players
  for update using (auth.uid() = user_id);

-- submissions: you can always read your own row. The opponent's row is only
-- readable once `revealed` is true, which only the trigger above can set.
drop policy if exists "read own submission always, opponent's once revealed" on submissions;
create policy "read own submission always, opponent's once revealed" on submissions
  for select using (
    revealed = true or submissions.player_id in (select my_player_ids())
  );

drop policy if exists "a player can submit for themself" on submissions;
create policy "a player can submit for themself" on submissions
  for insert with check (submissions.player_id in (select my_player_ids()));

-- votes: same pattern as submissions.
drop policy if exists "read own vote always, opponent's once revealed" on votes;
create policy "read own vote always, opponent's once revealed" on votes
  for select using (
    revealed = true or votes.voter_player_id in (select my_player_ids())
  );

drop policy if exists "a player can cast their own vote" on votes;
create policy "a player can cast their own vote" on votes
  for insert with check (votes.voter_player_id in (select my_player_ids()));

-- ---------------------------------------------------------------------------
-- Lets a client reveal a round's submissions once the 60s pick timer has
-- genuinely expired, even if only one (or zero) players submitted — see
-- supabase/reveal_expired_round.sql for the full rationale.
-- ---------------------------------------------------------------------------
create or replace function reveal_expired_round(p_game_code text, p_round_index int)
returns void
language plpgsql
security definer
as $$
declare
  v_started timestamptz;
  v_is_member boolean;
begin
  select round_started_at into v_started from games where code = p_game_code;
  if v_started is null then
    return;
  end if;

  select exists(
    select 1 from players where game_code = p_game_code and user_id = auth.uid()
  ) into v_is_member;
  if not v_is_member then
    raise exception 'not a member of this game';
  end if;

  if now() < v_started + interval '60 seconds' then
    return;
  end if;

  update submissions set revealed = true
  where game_code = p_game_code and round_index = p_round_index;
end;
$$;

grant execute on function reveal_expired_round(text, int) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes on these tables to subscribed clients.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'games') then
    alter publication supabase_realtime add table games;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'players') then
    alter publication supabase_realtime add table players;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'submissions') then
    alter publication supabase_realtime add table submissions;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'votes') then
    alter publication supabase_realtime add table votes;
  end if;
end $$;
