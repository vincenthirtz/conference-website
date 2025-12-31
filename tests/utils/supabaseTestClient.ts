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
