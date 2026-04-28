# Fixing Foreign Key Relationships for PostgREST

## Problem

The `/api/admin/demandes` endpoint is failing with errors like:

```
Could not find a relationship between 'demandes' and 'teams' in the schema cache
```

This happens because PostgREST cannot detect the foreign key relationships between tables.

## Solution

Follow these steps to properly configure the foreign key constraints:

### Step 1: Run the Migration Script

1. Go to your Supabase Dashboard: https://app.supabase.com
2. Navigate to: **SQL Editor** (left sidebar)
3. Click **New Query**
4. Copy and paste the contents of `database/demandes_fix_foreign_keys.sql`
5. Click **Run** (or press Ctrl/Cmd + Enter)

The script will:

- Check if foreign key constraints exist with the correct names
- Create them if missing
- Show you a list of all foreign keys on the `demandes` table

### Step 2: Verify Foreign Keys Were Created

After running the script, you should see output like:

```
constraint_name                 | table_name | column_name
--------------------------------|------------|-------------
demandes_user_id_fkey          | demandes   | user_id
demandes_team_id_fkey          | demandes   | team_id
demandes_tournament_id_fkey    | demandes   | tournament_id
```

### Step 3: Reload PostgREST Schema Cache

**This is the most important step!** PostgREST caches the database schema, so you must reload it:

#### Option A: Via Supabase Dashboard (Recommended)

1. Go to: **Settings** > **API** (in left sidebar)
2. Scroll down to find the **"Reload schema cache"** button
3. Click it and wait for confirmation

#### Option B: Via SQL (If available)

Run this in SQL Editor:

```sql
NOTIFY pgrst, 'reload schema';
```

Note: This might not work on all Supabase plans. Use Option A if this fails.

### Step 4: Test the API

After reloading the schema cache:

1. Restart your Next.js development server:

   ```bash
   npm run dev
   ```

2. Navigate to `/admin/demandes` in your browser

3. The page should now load successfully with team and tournament data included in each demande

## What Changed

### Before:

```javascript
// API tried to join but PostgREST couldn't find the relationship
select += `, team:teams(id, name, ...)`;
// Error: Could not find a relationship between 'demandes' and 'teams'
```

### After:

```javascript
// API uses explicit foreign key constraint name
select += `, team:teams!demandes_team_id_fkey(id, name, ...)`;
// Works! PostgREST knows to use the demandes_team_id_fkey constraint
```

## Troubleshooting

### Still Getting Errors?

1. **Verify foreign keys exist:**

   ```sql
   SELECT constraint_name, table_name, column_name
   FROM information_schema.key_column_usage
   WHERE table_name = 'demandes' AND constraint_name LIKE '%_fkey';
   ```

2. **Check if teams/tournaments tables exist:**

   ```sql
   SELECT table_name FROM information_schema.tables
   WHERE table_schema = 'public'
   AND table_name IN ('teams', 'tournaments');
   ```

3. **Verify PostgREST schema cache was reloaded:**
   - Look for the reload button in Settings > API
   - Make sure you clicked it AFTER running the migration

4. **Check Supabase logs:**
   - Go to: **Logs** > **Postgres Logs** in Supabase Dashboard
   - Look for any errors related to foreign keys

### Foreign Keys Exist But Still Not Working?

If the foreign keys exist but PostgREST still can't find them:

1. Try reloading the schema cache multiple times
2. Wait 1-2 minutes and try again (schema cache reload can take time)
3. Check if you're on the correct Supabase project
4. Verify the constraint names match exactly:
   - `demandes_team_id_fkey`
   - `demandes_tournament_id_fkey`

## Alternative: Temporary Workaround

If you can't fix the foreign keys right now, you can temporarily disable the joins:

In `pages/api/admin/demandes/index.ts`, comment out the team/tournament joins:

```javascript
if (withTeam) {
  // Temporarily disabled - fix foreign keys first
  // select += `, team:teams!demandes_team_id_fkey(...)`;
}
```

The API will still return `team_id` and `tournament_id`, just not the full objects.

## Additional Resources

- [Supabase Foreign Keys Documentation](https://supabase.com/docs/guides/database/tables#foreign-keys)
- [PostgREST Resource Embedding](https://postgrest.org/en/stable/api.html#resource-embedding)
- [Supabase Schema Cache](https://supabase.com/docs/guides/api#reloading-the-schema-cache)
