# Database setup

**`schema.sql`** is the canonical, always-current fresh-install script — run this top to bottom in a new Supabase project's SQL Editor and it creates everything the app needs (tables, RLS, triggers, RPCs, indexes) in its current, up-to-date form.

**`migrations/`** is the historical record of incremental changes already applied to the live database, in order. You generally don't need to run these — they exist so it's clear how the schema got to its current state, and `schema.sql` already reflects the end result of all of them.

## Making a schema change going forward

1. Add a new file to `migrations/` as `NNN_short_description.sql` (next number after whatever's already there), containing just the incremental change (e.g. `alter table ... add column ...`).
2. Apply it to the live database via the Supabase SQL Editor.
3. Update `schema.sql` to include the same change in the right place, so a brand-new install still ends up matching the live database exactly.

This keeps `schema.sql` as the one file that answers "what does the database actually look like," without needing to replay migration history to find out.
