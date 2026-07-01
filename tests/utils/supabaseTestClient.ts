import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
  '';

const envReady = Boolean(supabaseUrl && serviceRoleKey);

if (!envReady) {
  console.warn(
    '[tests] Supabase env manquants (TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY ou NEXT_SUPABASE_SERVICE_ROLE_KEY). Auth e2e tests seront ignorés.'
  );
}

export const supabaseTestClient = envReady
  ? createClient(supabaseUrl, serviceRoleKey)
  : null;

/**
 * Default tenant UUID — the "conference" tenant. Mirrors `DEFAULT_TENANT_ID`
 * in `utils/tenant.ts` (same env override, same hardcoded fallback). Several
 * tables (incl. `tournaments`) now carry a NOT NULL `tenant_id` after the
 * multi-tenant migration, so any direct-supabase seed MUST set it. Use this
 * constant (or `seedTournament`) instead of inlining a literal UUID.
 */
export const DEFAULT_TENANT_ID: string =
  process.env.DEFAULT_TENANT_ID || 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

/**
 * Insert a tournament fixture scoped to the default tenant and return its id.
 * Centralises the `tenant_id` requirement so specs don't each re-discover the
 * NOT NULL constraint. Extra columns can be passed via `overrides`.
 * Returns `null` when service-role env is missing (caller should be skipped).
 */
export async function seedTournament(
  fields: {
    name: string;
    slug: string;
    status?: string;
    game?: string;
  } & Record<string, unknown>
): Promise<string | null> {
  if (!supabaseTestClient) return null;
  const {
    name,
    slug,
    status = 'draft',
    game = 'overwatch',
    ...overrides
  } = fields;
  const { data, error } = await supabaseTestClient
    .from('tournaments')
    .insert({
      name,
      slug,
      status,
      game,
      tenant_id: DEFAULT_TENANT_ID,
      ...overrides,
    })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return data!.id as string;
}

export async function createTestUser(email: string, password: string) {
  if (!supabaseTestClient) return null;
  const { data, error } = await supabaseTestClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  return data.user;
}

export async function deleteTestUser(email: string) {
  if (!supabaseTestClient) return;
  const { data, error } = await supabaseTestClient.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });
  if (error) throw error;
  const users = (data as any)?.users as
    | { id: string; email?: string }[]
    | undefined;
  const user = users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );
  if (user) {
    const { error: delErr } = await supabaseTestClient.auth.admin.deleteUser(
      user.id
    );
    if (delErr) throw delErr;
  }
}

export async function deleteTeamsByName(name: string | string[]) {
  if (!supabaseTestClient) return;
  const patterns = Array.isArray(name) ? name : [name];

  const { data: teams, error } = await supabaseTestClient
    .from('teams')
    .select('id')
    .or(patterns.map((p) => `name.ilike.${p}`).join(','));

  if (error || !teams || teams.length === 0) return;
  const teamIds = teams.map((t) => t.id);

  await supabaseTestClient.from('team_members').delete().in('team_id', teamIds);
  await supabaseTestClient.from('teams').delete().in('id', teamIds);
}

/**
 * Create a test user with player role (not staff)
 */
export async function createTestPlayer(email: string, password: string) {
  if (!supabaseTestClient) return null;
  const { data, error } = await supabaseTestClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role: 'player',
      display_name: 'Test Player',
    },
  });
  if (error) throw error;
  return data.user;
}

/**
 * Create a test staff user with specified role
 */
export async function createTestStaff(
  email: string,
  password: string,
  role: 'owner' | 'admin' | 'manager' | 'caster' = 'caster'
) {
  if (!supabaseTestClient) return null;

  // Create user first with the staff role in metadata
  const { data: userData, error: userError } =
    await supabaseTestClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role,
        display_name: `Test ${role}`,
      },
    });

  if (userError) throw userError;
  if (!userData.user) return null;

  // Add to staff table (auth_user_id is the correct column name)
  const { error: staffError } = await supabaseTestClient.from('staff').insert({
    auth_user_id: userData.user.id,
    role,
    display_name: `Test ${role}`,
    email,
  });

  if (staffError) {
    // If staff insert fails, delete the user
    await supabaseTestClient.auth.admin.deleteUser(userData.user.id);
    throw staffError;
  }

  return userData.user;
}

/**
 * Delete staff entry for a user
 */
export async function deleteTestStaff(email: string) {
  if (!supabaseTestClient) return;

  // Idempotent, orphan-proof cleanup. A crashed prior run can leave a `staff`
  // row (unique on `email`) whose `auth_user_id` no longer resolves to a live
  // auth user — the leftover row then trips a duplicate-key on the next
  // createTestStaff insert. So delete by EMAIL first (independent of any
  // auth_user_id), then remove every matching auth user (scanning all pages).
  await supabaseTestClient.from('staff').delete().ilike('email', email);

  const emailLc = email.toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data } = await supabaseTestClient.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    const users = (data as any)?.users as
      | { id: string; email?: string }[]
      | undefined;
    if (!users || users.length === 0) break;
    for (const u of users) {
      if (u.email?.toLowerCase() === emailLc) {
        // Belt-and-braces: also clear any staff row still keyed on this user.
        await supabaseTestClient
          .from('staff')
          .delete()
          .eq('auth_user_id', u.id);
        await supabaseTestClient.auth.admin.deleteUser(u.id);
      }
    }
    if (users.length < 200) break;
  }
}
