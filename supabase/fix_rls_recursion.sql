-- Patch for a database that already ran the original supabase/schema.sql.
-- Fixes "infinite recursion detected in policy for relation players" by
-- routing the players-table checks through security definer helper
-- functions instead of a policy that queries its own table. Safe to run
-- more than once. Run this in Supabase: SQL Editor -> New query -> paste -> Run.

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

drop policy if exists "players in the game can update it" on games;
create policy "players in the game can update it" on games
  for update using (games.code in (select my_game_codes()));

drop policy if exists "players in a room can see each other" on players;
create policy "players in a room can see each other" on players
  for select using (players.game_code in (select my_game_codes()));

drop policy if exists "read own submission always, opponent's once revealed" on submissions;
create policy "read own submission always, opponent's once revealed" on submissions
  for select using (
    revealed = true or submissions.player_id in (select my_player_ids())
  );

drop policy if exists "a player can submit for themself" on submissions;
create policy "a player can submit for themself" on submissions
  for insert with check (submissions.player_id in (select my_player_ids()));

drop policy if exists "read own vote always, opponent's once revealed" on votes;
create policy "read own vote always, opponent's once revealed" on votes
  for select using (
    revealed = true or votes.voter_player_id in (select my_player_ids())
  );

drop policy if exists "a player can cast their own vote" on votes;
create policy "a player can cast their own vote" on votes
  for insert with check (votes.voter_player_id in (select my_player_ids()));
