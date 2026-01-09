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
  // eslint-disable-next-line no-console
  console.warn(
    '[tests] Supabase env manquants (TEST_SUPABASE_URL / TEST_SUPABASE_SERVICE_ROLE_KEY ou NEXT_SUPABASE_SERVICE_ROLE_KEY). Auth e2e tests seront ignorés.'
  );
}

export const supabaseTestClient =
  envReady ? createClient(supabaseUrl, serviceRoleKey) : null;

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
  const user = data?.users?.find(
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
  role: 'owner' | 'admin' | 'manager' | 'referee' | 'caster' | 'helper' = 'helper'
) {
  if (!supabaseTestClient) return null;

  // Create user first
  const { data: userData, error: userError } =
    await supabaseTestClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'staff',
        display_name: `Test ${role}`,
      },
    });

  if (userError) throw userError;
  if (!userData.user) return null;

  // Add to staff table
  const { error: staffError } = await supabaseTestClient.from('staff').insert({
    user_id: userData.user.id,
    role,
    display_name: `Test ${role}`,
    is_active: true,
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

  const { data } = await supabaseTestClient.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  const user = data?.users?.find(
    (u) => u.email?.toLowerCase() === email.toLowerCase()
  );

  if (user) {
    // Delete from staff table first
    await supabaseTestClient.from('staff').delete().eq('user_id', user.id);
    // Then delete user
    await supabaseTestClient.auth.admin.deleteUser(user.id);
  }
}
