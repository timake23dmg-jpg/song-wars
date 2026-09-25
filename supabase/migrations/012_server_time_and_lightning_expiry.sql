-- Two bugs surfaced by Lightning Round's short timers, both pre-existing but
-- previously too small to notice:
--
-- 1. round_started_at/reveal_started_at were set from the WRITING CLIENT's
--    own Date.now(), not the database's clock. Any clock skew between two
--    players' devices became a constant offset baked into a timestamp every
--    device then schedules its own countdown against — invisible against a
--    60s/20s timer, but very visible against Lightning Round's 25s/12s ones
--    (reported as "the game seems a little faster on the host"). Moving
--    these writes into SECURITY DEFINER functions that use Postgres's own
--    now() removes per-device clock skew as a factor entirely.
--
-- 2. reveal_expired_round had a hardcoded 60-second window before it would
--    reveal a partial round's submissions. Lightning Round's client-side
--    submission timer is 25s, so a Lightning round with a partial forfeit
--    would call this RPC at 25s, have it silently no-op for another 35s,
--    and appear to hang. Now mode-aware, matching
--    src/hooks/useRoundState.js's DEFAULT_SUBMIT_SECONDS/
--    LIGHTNING_SUBMIT_SECONDS split.

create or replace function start_match(p_game_code text)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from players where game_code = p_game_code and user_id = auth.uid()
  ) then
    raise exception 'not a member of this game';
  end if;

  update games
  set status = 'playing', round_started_at = now()
  where code = p_game_code and status = 'wheel';
end;
$$;

grant execute on function start_match(text) to authenticated;

create or replace function advance_round(p_game_code text, p_from_round_index int, p_tiebreak_player_ids uuid[] default '{}')
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from players where game_code = p_game_code and user_id = auth.uid()
  ) then
    raise exception 'not a member of this game';
  end if;

  update games
  set round_index = p_from_round_index + 1,
      round_started_at = now(),
      reveal_started_at = null,
      skip_requested_at = null,
      replayed_slots = '{}',
      replay_active_at = null,
      replay_active_song = null,
      tiebreak_player_ids = p_tiebreak_player_ids
  where code = p_game_code and round_index = p_from_round_index;
end;
$$;

grant execute on function advance_round(text, int, uuid[]) to authenticated;

create or replace function start_reveal(p_game_code text, p_round_index int)
returns void
language plpgsql
security definer
as $$
begin
  if not exists (
    select 1 from players where game_code = p_game_code and user_id = auth.uid()
  ) then
    raise exception 'not a member of this game';
  end if;

  update games
  set reveal_started_at = now()
  where code = p_game_code and round_index = p_round_index and reveal_started_at is null;
end;
$$;

grant execute on function start_reveal(text, int) to authenticated;

create or replace function reveal_expired_round(p_game_code text, p_round_index int)
returns void
language plpgsql
security definer
as $$
declare
  v_started timestamptz;
  v_mode text;
  v_window interval;
begin
  select round_started_at, mode into v_started, v_mode from games where code = p_game_code;
  if v_started is null then
    return;
  end if;

  if not exists (
    select 1 from players where game_code = p_game_code and user_id = auth.uid()
  ) then
    raise exception 'not a member of this game';
  end if;

  v_window := case when v_mode = 'lightning_round' then interval '25 seconds' else interval '60 seconds' end;
  if now() < v_started + v_window then
    return;
  end if;

  update submissions set revealed = true
  where game_code = p_game_code and round_index = p_round_index;
end;
$$;

grant execute on function reveal_expired_round(text, int) to authenticated;
