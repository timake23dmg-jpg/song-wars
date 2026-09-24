-- Phase 4 [R1][S1] Best of 5 + sudden death, and Phase 5 [R2][S2] Double or
-- Nothing. Replaces the old fixed-10-rounds format.

alter table games add column if not exists match_type text not null default 'main'
  check (match_type in ('main', 'bonus'));
alter table games add column if not exists match_start_round_index int not null default 0;
alter table games add column if not exists bonus_offer_status text
  check (bonus_offer_status in ('pending', 'accepted', 'declined'));
alter table games add column if not exists bonus_offer_started_at timestamptz;
alter table games add column if not exists loser_player_id uuid references players(id);
alter table games add column if not exists double_win boolean not null default false;
