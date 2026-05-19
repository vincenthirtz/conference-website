---
name: new-migration
description: Scaffold a new Supabase Postgres SQL migration under `database/migrations/` with the standard header comment, idempotent boilerplate, RLS enable for sensitive tables, and a schema-cache reload reminder if foreign keys are touched. Use when the user says "/new-migration <description>" or asks to scaffold a database migration. Arguments — the description (free text) becomes the file basename + drives the verb prefix choice.
---

# Scaffold a new migration

## Step 1 — ask for the missing details if not provided

The user typically passes a free-text description. Resolve these before writing the file:

1. **Verb** — pick the matching naming convention prefix:
   - `create_<table>_table` — new table
   - `add_<column>_to_<table>` — single-column addition
   - `add_<feature>` — feature-driven addition (table + index + RLS combo)
   - `extend_<table>_<reason>` — non-trivial extension
   - `fix_<thing>` — bug fix
   - `rename_<old>_to_<new>_on_<table>` — explicit rename (bridge in 2 PRs)
   - `enable_rls_<scope>` — RLS application
   - `enforce_<rule>_trigger` — trigger-based invariant
   - `seed_<thing>` — static data (prefer `database/seeds/` for reference data)
2. **Sensitivity** — does the table hold private/staff/bot-internal data? → answer yes ⇒ `ENABLE ROW LEVEL SECURITY` without any policy (default deny).
3. **FK changes?** — does the migration add or change a FOREIGN KEY? → answer yes ⇒ add the schema-cache reload reminder in the header.

If the user didn't specify enough, ask 1-2 targeted questions before scaffolding. Don't guess on FK + RLS.

## Step 2 — write the file

Filename: `database/migrations/<verb>_<subject>.sql` (snake_case, no timestamp prefix — the team applies in PR order).

Header skeleton (mirror existing migrations like `add_bot_idempotency_table.sql` and `enable_rls_baseline_tables.sql`):

```sql
-- database/migrations/<filename>.sql
-- <one-line summary of what this migration does>
--
-- <why — the motivation. constraint, deadline, stakeholder ask, incident.
--  match the bar set by existing migration comments: explain so future-you
--  debugging at 2 AM doesn't have to grep PRs to understand intent.>
--
-- <caveats — anything non-obvious: TTL behavior, partial backfill,
--  schema-cache reload required, sibling migration that must run first,
--  rollback strategy. Skip the block if there are none.>

-- 1) <step description>
<idempotent SQL>

-- 2) <next step description, if any>
<idempotent SQL>
```

Idempotent patterns (use exclusively):

```sql
CREATE TABLE IF NOT EXISTS <name> ( … );
CREATE INDEX IF NOT EXISTS idx_<table>_<col> ON <table> (<col>);
ALTER TABLE <name> ADD COLUMN IF NOT EXISTS <col> <type>;
ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS <name>;
```

Schema conventions to apply by default:

- **PK**: `BIGSERIAL PRIMARY KEY` or `UUID PRIMARY KEY DEFAULT gen_random_uuid()` — match adjacent tables when joining.
- **Timestamps**: `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`. Add `updated_at` if mutations are common.
- **Soft delete**: `deleted_at TIMESTAMPTZ NULL` (pattern in `deleted_at_migration.sql`).
- **FK**: `<col> <type> REFERENCES <table>(id) ON DELETE <action>` — pick CASCADE / SET NULL / RESTRICT deliberately.
- **FK index**: every FK column gets `CREATE INDEX IF NOT EXISTS idx_<table>_<col>`.
- **FK name**: PostgREST expects `<table>_<column>_fkey` — let Postgres default-name unless you need a specific name.
- **Sensitive table**: `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` with **no policies** unless there's a real public read path.
- **Enums**: prefer `TEXT + CHECK (col IN ('a','b','c'))` over Postgres `ENUM` types.

If FK was touched, append at the bottom:

```sql
-- ⚠ APPLY-TIME NOTE
-- After running this migration on production:
-- 1. Reload the PostgREST schema cache (Supabase Dashboard → Settings → API → "Reload schema cache",
--    or `NOTIFY pgrst, 'reload schema';`).
-- 2. Re-run any failing API endpoint that uses ?select=*,<related>(*) embeds to confirm.
-- Without this, embeds silently return null / "could not find relationship" errors.
```

## Step 3 — output a short post-write checklist

After writing the file, tell the user (concise — no walls of text):

- File path created.
- Whether RLS was applied (and why / why not).
- Whether the schema-cache reload note was included (and why).
- The next handoff: "Pair with the `api` agent for the consuming route" (if applicable) or "Pair with `unit-utils` to add the table key to `tests/unit/__helpers__/supabaseMock.ts`" (if the in-memory mock needs to know about it).
- The PR description should include: "Apply this migration before the consuming code is deployed" (and the schema-cache reload step if relevant).

## Step 4 — do NOT auto-apply

The migration is **never** applied as part of this skill. Supabase migrations are manual via the SQL Editor in the Dashboard — the operator runs the SQL when reviewing the PR.

## Notes

- One concern per migration file. Don't bundle a new table + a column rename + a seed.
- Reads / further conventions live in the `database` agent's doc (`.claude/agents/database.md`). When in doubt, defer to it for design decisions; this skill is the scaffold, not the designer.
