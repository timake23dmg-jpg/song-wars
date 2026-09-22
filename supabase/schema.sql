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
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'finished')),
  prompts jsonb not null default '[]'::jsonb,
  round_index int not null default 0,
  round_started_at timestamptz,
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

-- games: any signed-in (anonymous) client can create a room or read/update
-- one it's already part of. Room codes are short-lived and not sensitive.
create policy "games are readable by anyone signed in" on games
  for select using (auth.uid() is not null);

create policy "anyone signed in can host a room" on games
  for insert with check (auth.uid() is not null);

create policy "players in the game can update it" on games
  for update using (
    exists (select 1 from players where players.game_code = games.code and players.user_id = auth.uid())
  );

-- players: visible to the other player in the same room (genre/artist picks
-- aren't secret — only the per-round song submission is).
create policy "players in a room can see each other" on players
  for select using (
    exists (select 1 from players p2 where p2.game_code = players.game_code and p2.user_id = auth.uid())
  );

create policy "a signed-in client can join a room as itself" on players
  for insert with check (auth.uid() = user_id);

create policy "a player can update their own row" on players
  for update using (auth.uid() = user_id);

-- submissions: you can always read your own row. The opponent's row is only
-- readable once `revealed` is true, which only the trigger above can set.
create policy "read own submission always, opponent's once revealed" on submissions
  for select using (
    revealed = true
    or exists (select 1 from players where players.id = submissions.player_id and players.user_id = auth.uid())
  );

create policy "a player can submit for themself" on submissions
  for insert with check (
    exists (select 1 from players where players.id = submissions.player_id and players.user_id = auth.uid())
  );

-- votes: same pattern as submissions.
create policy "read own vote always, opponent's once revealed" on votes
  for select using (
    revealed = true
    or exists (select 1 from players where players.id = votes.voter_player_id and players.user_id = auth.uid())
  );

create policy "a player can cast their own vote" on votes
  for insert with check (
    exists (select 1 from players where players.id = votes.voter_player_id and players.user_id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- Realtime: broadcast row changes on these tables to subscribed clients.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table games, players, submissions, votes;
