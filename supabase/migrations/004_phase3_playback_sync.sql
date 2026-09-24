-- Phase 3 [P1]-[P4]: adds the shared-timestamp fields synced playback needs.
-- All reset to their defaults on every round change (see advanceRound() in
-- src/lib/game.js) so they never leak into the next round.

alter table games add column if not exists reveal_started_at timestamptz;
alter table games add column if not exists skip_requested_at timestamptz;
alter table games add column if not exists replay1_used boolean not null default false;
alter table games add column if not exists replay2_used boolean not null default false;
alter table games add column if not exists replay_active_at timestamptz;
alter table games add column if not exists replay_active_song int;
