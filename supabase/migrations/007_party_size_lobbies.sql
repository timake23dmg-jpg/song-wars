-- v3 Phase 1: party-size lobbies. Removes the hardcoded 2-player cap and
-- "both in" == 2 assumptions, replaces them with "up to a generous safety
-- ceiling" and "everyone currently in the room," and adds mode/difficulty
-- columns for the lobby's host-picked settings.

alter table games add column if not exists mode text not null default 'points_league';
alter table games add column if not exists difficulty text not null default 'hard';
alter table games add constraint games_difficulty_check check (difficulty in ('easy', 'medium', 'hard'));

-- Replace the hardcoded "slot in (0,1)" check with an open-ended one. The
-- original constraint was unnamed, so find it by definition rather than
-- guessing Postgres's auto-generated name.
do $$
declare
  r record;
begin
  for r in
    select conname from pg_constraint
    where conrelid = 'players'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%slot%'
  loop
    execute format('alter table players drop constraint %I', r.conname);
  end loop;
end $$;

alter table players add constraint players_slot_range_check check (slot >= 0);

-- Replace the 2-player trigger with a generous technical safety ceiling
-- (not the actual party-size business rule, which lives in the UI/modes).
create or replace function enforce_max_players()
returns trigger as $$
declare
  v_max constant int := 16;
begin
  if (select count(*) from players where game_code = new.game_code) >= v_max then
    raise exception 'Room % is already full (max % players)', new.game_code, v_max;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists trg_enforce_two_players on players;
drop trigger if exists trg_enforce_max_players on players;
create trigger trg_enforce_max_players
  before insert on players
  for each row execute function enforce_max_players();

-- "Both in" now means "everyone currently in the room," not a hardcoded 2.
create or replace function reveal_submissions_when_both_in()
returns trigger as $$
declare
  v_player_count int;
  v_submission_count int;
begin
  select count(*) into v_player_count from players where game_code = new.game_code;
  select count(*) into v_submission_count from submissions
    where game_code = new.game_code and round_index = new.round_index;

  if v_submission_count >= v_player_count then
    update submissions set revealed = true
    where game_code = new.game_code and round_index = new.round_index;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create or replace function reveal_votes_when_both_in()
returns trigger as $$
declare
  v_player_count int;
  v_vote_count int;
begin
  select count(*) into v_player_count from players where game_code = new.game_code;
  select count(*) into v_vote_count from votes
    where game_code = new.game_code and round_index = new.round_index;

  if v_vote_count >= v_player_count then
    update votes set revealed = true
    where game_code = new.game_code and round_index = new.round_index;
  end if;
  return new;
end;
$$ language plpgsql security definer;
