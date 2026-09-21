import { createClient } from '@supabase/supabase-js';

const supabaseUrl =
  process.env.TEST_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey =
  process.env.TEST_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_SUPABASE_SERVICE_ROLE_KEY ||
  '';

// RÈGLE DURE : les tests e2e ne doivent JAMAIS seeder la Supabase de PRODUCTION.
// Ce module est le SEUL point d'accès service-role des e2e, donc on bloque ici,
// à la source. Politique :
//   - Supabase LOCALE (supabase start)      → autorisé
//   - projet PROD (owwomenscup / yhfdhp…)    → REFUSÉ EN ABSOLU (aucun override)
//   - tout autre remote (projet de test)     → refusé sauf ALLOW_E2E_REMOTE_SUPABASE=1
//
// LA DÉCISION EST SORTIE DANS UNE FONCTION PURE, et ce n'est pas de l'élégance :
// la règle vivait dans un `if` au chargement du module, donc elle ne pouvait
// être vérifiée qu'en important le module avec un environnement truqué — c'est
//-à-dire jamais. Elle n'avait aucun test. Une règle qu'on ne peut pas exécuter
// est une règle qu'on ne peut pas savoir cassée : il suffisait d'une refonte,
// ou d'un nouveau ref de projet, pour qu'elle devienne décorative sans que rien
// ne le signale. `tests/unit/e2eSeedGuard.test.ts` l'exerce maintenant cas par cas.

/** Ref/hôte du projet de PRODUCTION — jamais seedable par les e2e. */
export const PROD_SUPABASE_MARKERS = ['yhfdhpqgmazfxyyklomp', 'owwomenscup'];

export type SeedTargetVerdict =
  | { allowed: true; reason: 'local' | 'remote-allowed' | 'no-credentials' }
  | {
      allowed: false;
      reason: 'production' | 'remote-not-allowed';
      message: string;
    };

export function isLocalSupabaseUrl(url: string): boolean {
  // `(?=[:/?#]|$)` ancre la FIN du nom d'hôte, et ce n'est pas du zèle : sans
  // cette ancre, `https://localhost.evil.example.com` passait pour local. Or
  // « local » fait sauter TOUS les contrôles suivants, production comprise —
  // le trou le plus large possible dans ce garde-fou, ouvert par une regex qui
  // se contentait d'un préfixe.
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|kong)(:\d+)?(?=[/?#]|$)/i.test(
      url
    ) || /(^|\.)supabase\.internal(:\d+)?(?=[/?#]|$)/i.test(url)
  );
}

/**
 * La cible de seed est-elle autorisée ?
 *
 * PURE : elle ne lit ni `process.env` ni le réseau, tout lui est passé. C'est
 * ce qui la rend testable — et donc ce qui rend la règle vérifiable.
 *
 * Sans clé service-role, aucune écriture n'est possible : le verdict est
 * « autorisé » parce qu'il n'y a rien à interdire, et l'appelant n'instancie
 * de toute façon aucun client.
 */
export function seedTargetVerdict(
  url: string,
  serviceRoleKey: string,
  allowRemote: boolean
): SeedTargetVerdict {
  if (!serviceRoleKey || !url)
    return { allowed: true, reason: 'no-credentials' };
  if (isLocalSupabaseUrl(url)) return { allowed: true, reason: 'local' };

  const masked = url.replace(/(https?:\/\/[a-z0-9]{6}).*/i, '$1…');

  if (PROD_SUPABASE_MARKERS.some((m) => url.includes(m))) {
    return {
      allowed: false,
      reason: 'production',
      message:
        `[tests] REFUS ABSOLU: les tests e2e ne doivent JAMAIS seeder la Supabase de PRODUCTION (${masked}). ` +
        'Lancez une Supabase LOCALE (`supabase start`) et pointez ' +
        'TEST_SUPABASE_URL + TEST_SUPABASE_SERVICE_ROLE_KEY dessus. ' +
        'Aucun override ne débloque la prod.',
    };
  }

  if (!allowRemote) {
    return {
      allowed: false,
      reason: 'remote-not-allowed',
      message:
        `[tests] REFUS: seed e2e contre une Supabase distante (${masked}). ` +
        'Utilisez une Supabase LOCALE, ou un projet de TEST dédié avec ' +
        'ALLOW_E2E_REMOTE_SUPABASE=1 (jamais la prod).',
    };
  }

  return { allowed: true, reason: 'remote-allowed' };
}

const verdict = seedTargetVerdict(
  supabaseUrl,
  serviceRoleKey,
  process.env.ALLOW_E2E_REMOTE_SUPABASE === '1'
);
if (!verdict.allowed) {
  throw new Error(verdict.message);
}

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
  role: 'owner' | 'admin' | 'caster' = 'caster'
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
