// scripts/db-auth-trial.mjs — essaie les migrations du lot 4 de Better Auth
// (docs/AUTH-BETTER-AUTH.md) sur la base jetable de db-restore-test.yml, restaurée
// depuis une vraie sauvegarde. Jamais sur la production : l'adresse est celle du
// Supabase local de la machine GitHub.
//
// 1. Empreintes des 7 fonctions de lecture, sur tous les comptes.
// 2. Migrations appliquées, durée relevée ; comptages, clés, droits ; empreintes égales.
// 3. Rejouées : idempotentes. Retour arrière : clés et empreintes reviennent, puis
//    réapplication.
// 4. Le miroir sous le rôle de GoTrue : inscription, connexion, mot de passe, compte
//    lié, erreur du miroir qui ne bloque pas, effacement complet d'un vrai compte.
//
// DÉPÔT PUBLIC, journaux publics : n'affiche que des nombres et des oui/non, et
// aucune valeur de la base. Les erreurs de Postgres sont masquées.
//
// Usage : node scripts/db-auth-trial.mjs <url de la base jetable> <dossier des migrations>

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const [db, dir] = process.argv.slice(2);
if (!db || !dir || !/127\.0\.0\.1|localhost/.test(db)) {
  console.error(
    'Usage : node scripts/db-auth-trial.mjs <url locale> <dossier>'
  );
  process.exit(2);
}
// Le rôle de GoTrue sur le Supabase local (mot de passe par défaut, base jetable).
const authDb = db.replace(/\/\/[^@]+@/, '//supabase_auth_admin:postgres@');

const MIGRATIONS = [
  'add_auth_accounts_mirror',
  'repoint_auth_fks_to_auth_user',
  'rewrite_auth_read_functions',
];
const TABLES = [
  'auth_user',
  'auth_account',
  'auth_session',
  'auth_verification',
  'auth_two_factor',
  'auth_jwks',
  'auth_rate_limit',
];
const EXPECTED_FKS = 44;

const lines = [];
let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  const text = `${label}${detail === '' ? '' : ` — ${detail}`}`;
  console.log(`${ok ? '✓' : '✗'} ${text}`);
  lines.push(`- ${ok ? '✅' : '❌'} ${text}`);
  return ok;
};

/** Masque toute valeur qu'un message de Postgres recopierait. */
const mask = (raw) =>
  (
    String(raw)
      .split('\n')
      .find((l) => /ERROR|FATAL/.test(l)) ?? 'erreur psql'
  )
    .replace(/"[^"]*"/g, '"…"')
    .replace(/'[^']*'/g, "'…'")
    .replace(/\([^)]*\)=\([^)]*\)/g, '(…)=(…)')
    .slice(0, 240);

function psql(args, url) {
  try {
    return execFileSync(
      'psql',
      [url, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', ...args],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    ).trim();
  } catch (e) {
    throw new Error(mask(e.stderr ?? e.message));
  }
}
const sql = (text, url = db) => psql(['-c', text], url);
const applyFile = (name) => psql(['-f', join(dir, `${name}.sql`)], db);
const applyAll = () => MIGRATIONS.forEach(applyFile);
const revertAll = () =>
  [...MIGRATIONS].reverse().forEach((m) => applyFile(`${m}_revert`));
const count = (text, url = db) => Number(sql(text, url));

/* ---------------------------------------------------------------- empreintes --- */

const sorted = (from) =>
  `select coalesce(md5(string_agg(t::text, '|' order by t::text)), '') from ${from}`;
const ordered = (args) =>
  `select coalesce(md5(string_agg(t::text, '|')), '') from admin_list_users(${args}) t`;
const FILTERS = [
  'staff',
  'community',
  'no_team',
  'never_signed_in',
  'inactive_6m',
  'suspended',
  'no_discord',
  'battletag_mismatch',
];
const FINGERPRINTS = {
  'liste, par date': ordered(
    `null, null, 100000, 0, 'created_at', 'desc', null`
  ),
  'liste, par adresse': ordered(`null, null, 100000, 0, 'email', 'asc', null`),
  'liste, par nom': ordered(
    `null, null, 100000, 0, 'display_name', 'desc', null`
  ),
  'liste, par connexion': ordered(
    `null, null, 100000, 0, 'last_sign_in_at', 'asc', null`
  ),
  'liste, par rôle': ordered(`null, 'admin', 100000, 0, 'role', 'asc', null`),
  'liste, recherche': ordered(
    `'a', null, 100000, 0, 'created_at', 'desc', null`
  ),
  ...Object.fromEntries(
    FILTERS.map((f) => [
      `liste, filtre ${f}`,
      ordered(`null, null, 100000, 0, 'created_at', 'desc', array['${f}']`),
    ])
  ),
  'recherche par adresse': sorted(
    `auth.users u cross join lateral admin_search_users(u.email) t`
  ),
  'recherche par nom': sorted(
    `auth.users u cross join lateral admin_search_users(u.raw_user_meta_data->>'display_name') t where u.raw_user_meta_data->>'display_name' is not null`
  ),
  'recherche de cartes': sorted(
    `auth.users u cross join tenants x cross join lateral admin_search_tcg_players(x.id, u.raw_user_meta_data->>'display_name') t where u.raw_user_meta_data->>'display_name' is not null`
  ),
  profils: sorted(
    `admin_get_user_profiles(array(select id from auth.users)) t`
  ),
  'comptes confirmés': `select count_confirmed_auth_users()`,
  'compte par adresse': sorted(
    `(select u.id, get_user_id_by_email(upper(u.email)) as found from auth.users u) t`
  ),
  'échanges, sans délai': sorted(
    `(select x.id as tenant, u.id as usr, tcg_trade_eligibility(x.id, u.id, 0, 0) as r from auth.users u cross join tenants x) t`
  ),
  'échanges, long délai': sorted(
    `(select x.id as tenant, u.id as usr, tcg_trade_eligibility(x.id, u.id, 90000, 0) as r from auth.users u cross join tenants x) t`
  ),
};
const fingerprints = () =>
  Object.fromEntries(
    Object.entries(FINGERPRINTS).map(([name, q]) => [name, sql(q)])
  );
const sameFingerprints = (label, a, b) => {
  const different = Object.keys(a).filter((k) => a[k] !== b[k]);
  check(
    different.length === 0,
    label,
    different.length
      ? `différentes : ${different.join(', ')}`
      : `${Object.keys(a).length} égales`
  );
};

/* --------------------------------------------------------------- l'état de la base --- */

const fksTo = (target, onlyPublicOutsideAuthTables = false) =>
  count(
    `select count(*) from pg_constraint c where c.contype = 'f' and c.confrelid = '${target}'::regclass and c.connamespace = 'public'::regnamespace${
      onlyPublicOutsideAuthTables
        ? ` and c.conrelid::regclass::text not in ('auth_account', 'auth_session', 'auth_two_factor')`
        : ''
    }`
  );

function checkInstalled(label) {
  check(
    count(`select count(*) from public.auth_user`) ===
      count(`select count(*) from auth.users`),
    `${label} : autant de comptes`,
    count(`select count(*) from public.auth_user`)
  );
  check(
    count(
      `select count(*) from public.auth_account where provider_id = 'credential'`
    ) ===
      count(
        `select count(*) from auth.users where coalesce(encrypted_password, '') <> ''`
      ),
    `${label} : autant de mots de passe`,
    count(
      `select count(*) from public.auth_account where provider_id = 'credential'`
    )
  );
  check(
    count(
      `select count(*) from public.auth_account where provider_id <> 'credential'`
    ) ===
      count(`select count(*) from auth.identities where provider <> 'email'`),
    `${label} : autant de comptes liés`,
    count(
      `select count(*) from public.auth_account where provider_id <> 'credential'`
    )
  );
  check(
    count(
      `select count(*) from auth.users u join public.auth_account c on c.user_id = u.id and c.provider_id = 'credential' where c.password is distinct from u.encrypted_password`
    ) === 0,
    `${label} : mots de passe identiques, sans en lire aucun ici`
  );
  check(
    count(
      `select count(*) from auth.users u join public.auth_user a using (id) where a.metadata is distinct from coalesce(u.raw_user_meta_data, '{}'::jsonb) or a.email is distinct from u.email::text or a.created_at is distinct from u.created_at or a.last_sign_in_at is distinct from u.last_sign_in_at or a.banned_until is distinct from u.banned_until or a.email_verified is distinct from (u.email_confirmed_at is not null)`
    ) === 0,
    `${label} : comptes identiques, champ par champ`
  );
  const moved = fksTo('public.auth_user', true);
  check(moved === EXPECTED_FKS, `${label} : clés vers auth_user`, moved);
  check(
    fksTo('auth.users') === 0,
    `${label} : plus aucune clé vers auth.users`
  );
  check(
    count(
      `select count(*) from pg_constraint where contype = 'f' and confrelid = 'public.auth_user'::regclass and not convalidated`
    ) === 0,
    `${label} : toutes validées`
  );
}

function checkPrivileges() {
  for (const role of ['anon', 'authenticated']) {
    const open = TABLES.filter((t) =>
      ['SELECT', 'INSERT', 'UPDATE', 'DELETE'].some(
        (p) =>
          sql(
            `select has_table_privilege('${role}', 'public.${t}', '${p}')`
          ) === 't'
      )
    );
    check(open.length === 0, `aucun droit pour ${role}`, open.join(', '));
  }
  const col = (c) =>
    sql(
      `select has_column_privilege('service_role', 'public.auth_account', '${c}', 'SELECT')`
    ) === 't';
  check(
    sql(
      `select has_table_privilege('service_role', 'public.auth_user', 'SELECT')`
    ) === 't' &&
      sql(
        `select has_table_privilege('service_role', 'public.auth_user', 'UPDATE')`
      ) === 'f',
    'la clé de service lit auth_user, sans y écrire'
  );
  check(
    col('account_id') &&
      col('identity_data') &&
      !col('password') &&
      !col('access_token') &&
      !col('refresh_token') &&
      !col('id_token'),
    'la clé de service ne lit ni mots de passe ni jetons'
  );
  const closed = TABLES.slice(2).filter(
    (t) =>
      sql(
        `select has_table_privilege('service_role', 'public.${t}', 'SELECT')`
      ) === 't'
  );
  check(
    closed.length === 0,
    'la clé de service ne lit ni sessions ni secrets',
    closed.join(', ')
  );
  check(
    count(
      `select count(*) from pg_class where oid in (${TABLES.map((t) => `'public.${t}'::regclass`).join(', ')}) and relrowsecurity`
    ) === TABLES.length,
    'RLS active sur les 7 tables'
  );
  check(
    count(
      `select count(*) from pg_policies where schemaname = 'public' and tablename in (${TABLES.map((t) => `'${t}'`).join(', ')})`
    ) === 0,
    'aucune règle d’accès sur ces tables'
  );
  const callable = [
    'auth_mirror_user(uuid)',
    'auth_mirror_identity(uuid)',
    'auth_mirror_users_trigger()',
    'auth_mirror_identities_trigger()',
  ].filter((f) =>
    ['anon', 'authenticated', 'service_role'].some(
      (r) =>
        sql(
          `select has_function_privilege('${r}', 'public.${f}', 'EXECUTE')`
        ) === 't'
    )
  );
  check(
    callable.length === 0,
    'fonctions du miroir fermées aux appels directs',
    callable.join(', ')
  );
}

/* ------------------------------------------------------- le miroir, sous le rôle de GoTrue --- */

function checkMirror() {
  try {
    sql('select 1', authDb);
  } catch (e) {
    check(false, 'connexion sous le rôle de GoTrue', e.message);
    return;
  }
  const whoami = sql('select current_user', authDb);
  check(
    whoami === 'supabase_auth_admin',
    'les écritures passent par le rôle de GoTrue'
  );

  const id = randomUUID();
  const email = `essai-${id.slice(0, 8)}@example.invalid`;
  const other = `autre-${id.slice(0, 8)}@example.invalid`;
  const rogue = randomUUID();
  const row = (col, table = 'public.auth_user', key = 'id') =>
    sql(`select ${col} from ${table} where ${key} = '${id}'`);

  sql(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated', '${email}',
             '{"display_name":"Essai","role":"player"}', '{}', now(), now())`,
    authDb
  );
  check(row('name') === 'Essai', 'inscription : compte visible dans le miroir');
  check(
    row('email_verified') === 'f',
    'inscription : adresse pas encore confirmée'
  );
  check(
    count(
      `select count(*) from public.auth_account where user_id = '${id}'`
    ) === 0,
    'inscription sans mot de passe : aucun compte de connexion'
  );

  sql(
    `update auth.users set encrypted_password = '$2a$10$essaiessaiessaiessaiesO', email_confirmed_at = now(),
       last_sign_in_at = now(), updated_at = now(),
       raw_user_meta_data = '{"display_name":"Essai 2","role":"player"}' where id = '${id}'`,
    authDb
  );
  check(row('name') === 'Essai 2', 'mise à jour du profil : suivie');
  check(row('email_verified') === 't', 'confirmation de l’adresse : suivie');
  check(row('last_sign_in_at is not null') === 't', 'connexion : date suivie');
  check(
    sql(
      `select password = '$2a$10$essaiessaiessaiessaiesO' from public.auth_account where user_id = '${id}' and provider_id = 'credential'`
    ) === 't',
    'mot de passe : repris tel quel'
  );
  check(
    sql(
      `select metadata->>'display_name' from public.auth_user where id = '${id}'`
    ) === 'Essai 2' &&
      sql(
        `select display_name from admin_get_user_profiles(array['${id}'::uuid])`
      ) === 'Essai 2',
    'les fonctions de lecture voient le changement'
  );

  sql(
    `insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
     values ('999000${id.slice(0, 8)}', '${id}', '{"username":"essai"}', 'discord', now(), now())`,
    authDb
  );
  check(
    sql(
      `select identity_data->>'username' from public.auth_account where user_id = '${id}' and provider_id = 'discord'`
    ) === 'essai',
    'liaison Discord : suivie, pseudo compris'
  );
  sql(
    `delete from auth.identities where user_id = '${id}' and provider = 'discord'`,
    authDb
  );
  check(
    count(
      `select count(*) from public.auth_account where user_id = '${id}' and provider_id = 'discord'`
    ) === 0,
    'retrait de la liaison : suivi'
  );

  // Une erreur du miroir ne doit jamais bloquer une connexion.
  sql(
    `insert into public.auth_user (id, email) values ('${rogue}', '${other}')`
  );
  sql(
    `update auth.users set email = '${other}', updated_at = now() where id = '${id}'`,
    authDb
  );
  check(
    sql(`select email from auth.users where id = '${id}'`) === other &&
      row('email') === email,
    'miroir en échec : l’écriture de GoTrue passe quand même'
  );
  sql(`delete from public.auth_user where id = '${rogue}'`);
  sql(`update auth.users set updated_at = now() where id = '${id}'`, authDb);
  check(row('email') === other, 'la prochaine écriture du compte répare');

  // Une clé repointée accepte un compte neuf du miroir.
  sql(
    `insert into public.player_follows (follower_id, followee_id) select '${id}', id from auth.users where id <> '${id}' limit 1`
  );
  check(
    count(
      `select count(*) from public.player_follows where follower_id = '${id}'`
    ) === 1,
    'une table de public accepte le compte neuf'
  );
  sql(`delete from auth.users where id = '${id}'`, authDb);
  check(
    count(`select count(*) from public.auth_user where id = '${id}'`) === 0 &&
      count(
        `select count(*) from public.auth_account where user_id = '${id}'`
      ) === 0 &&
      count(
        `select count(*) from public.player_follows where follower_id = '${id}'`
      ) === 0,
    'suppression : compte, connexion et données partent ensemble'
  );

  // L'effacement d'un VRAI compte restauré : celui qui a le plus de liens.
  const fks = sql(
    `select string_agg(c.conrelid::regclass::text || ':' || a.attname::text || ':' || c.confdeltype::text, ' ')
     from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
     where c.contype = 'f' and c.confrelid = 'public.auth_user'::regclass and c.connamespace = 'public'::regnamespace`
  )
    .split(' ')
    .map((f) => f.split(':'));
  const refs = fks
    .map(
      ([t, col]) =>
        `select ${col}::text as uid from ${t} where ${col} is not null`
    )
    .join(' union all ');
  const victim = sql(
    `select uid from (${refs}) r join auth.users u on u.id::text = r.uid group by uid order by count(*) desc limit 1`
  );
  const links = () =>
    fks.reduce(
      (n, [t, col]) =>
        n + count(`select count(*) from ${t} where ${col} = '${victim}'`),
      0
    );
  const before = links();
  const deleted = fks.reduce(
    (n, [t, col, action]) =>
      action === 'c'
        ? n + count(`select count(*) from ${t} where ${col} = '${victim}'`)
        : n,
    0
  );
  sql(`delete from auth.users where id = '${victim}'`, authDb);
  check(
    links() === 0 &&
      count(`select count(*) from public.auth_user where id = '${victim}'`) ===
        0,
    'effacement d’un vrai compte : plus aucun lien',
    `${before} liens, dont ${deleted} lignes supprimées`
  );
  check(
    count(`select count(*) from public.auth_user`) ===
      count(`select count(*) from auth.users`),
    'après l’effacement : autant de comptes des deux côtés'
  );
}

/* ------------------------------------------------------------ le rôle de Better Auth --- */

function checkAuthAppRole() {
  applyFile('add_auth_app_role');
  applyFile('add_auth_app_role');
  check(
    sql(
      `select rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb from pg_roles where rolname = 'auth_app'`
    ) === 'f',
    'rôle de Better Auth : sans connexion ni passe-droit à sa création'
  );

  // Mot de passe jetable, sur la base jetable : le vrai reste hors de ce script.
  const pw = randomUUID().replaceAll('-', '');
  sql(`alter role auth_app login password '${pw}'`);
  const url = db.replace(/\/\/[^@]+@/, `//auth_app:${pw}@`);
  const runs = (q) => {
    try {
      sql(q, url);
      return true;
    } catch {
      return false;
    }
  };
  const uid = sql(`select id from public.auth_user limit 1`);
  const token = randomUUID();
  const allowed = {
    'lire un compte': `select id, metadata from public.auth_user limit 1`,
    'lire un hachage': `select count(password) from public.auth_account`,
    'ouvrir une session': `insert into public.auth_session (user_id, token, expires_at) values ('${uid}', '${token}', now() + interval '1 hour')`,
    'marquer le niveau': `update public.auth_session set aal = 'aal2' where token = '${token}'`,
    'fermer la session': `delete from public.auth_session where token = '${token}'`,
    'poser une vérification': `insert into public.auth_verification (identifier, value, expires_at) values ('${token}', 'x', now())`,
    'compter une limite': `insert into public.auth_rate_limit (key, count, last_request) values ('${token}', 1, 1)`,
    'poser une clé': `insert into public.auth_jwks (public_key, private_key) values ('x', 'y')`,
    'poser un code': `insert into public.auth_two_factor (user_id, secret, backup_codes) values ('${uid}', 'x', 'y')`,
  };
  const refused = Object.entries(allowed)
    .filter(([, q]) => !runs(q))
    .map(([name]) => name);
  check(
    refused.length === 0,
    'rôle de Better Auth : travaille sur ses tables, malgré la RLS',
    refused.join(', ')
  );
  const denied = {
    'une table du site': `select count(*) from public.team_members`,
    'le staff': `select count(*) from public.staff`,
    'auth.users': `select count(*) from auth.users`,
    'auth.identities': `select count(*) from auth.identities`,
    'une fonction de lecture': `select count(*) from public.admin_list_users()`,
    'le miroir': `select public.auth_mirror_user('${uid}')`,
  };
  const open = Object.entries(denied)
    .filter(([, q]) => runs(q))
    .map(([name]) => name);
  check(
    open.length === 0,
    'rôle de Better Auth : refusé partout ailleurs',
    open.join(', ')
  );
  check(
    sql(
      `select has_table_privilege('anon', 'public.auth_account', 'SELECT')`
    ) === 'f' &&
      sql(
        `select has_table_privilege('authenticated', 'public.auth_user', 'SELECT')`
      ) === 'f',
    'le navigateur reste dehors'
  );
  sql(`delete from public.auth_two_factor where secret = 'x'`);
  sql(`delete from public.auth_jwks where public_key = 'x'`);

  applyFile('add_auth_app_role_revert');
  check(
    count(`select count(*) from pg_roles where rolname = 'auth_app'`) === 0 &&
      count(
        `select count(*) from pg_policies where policyname = 'auth_app_all'`
      ) === 0,
    'rôle de Better Auth : retour arrière complet'
  );
}

/* ------------------------------------------------------------------------ l'essai --- */

function run() {
  // Base jetable, mais restaurée avec les réglages de production : aucun
  // déclencheur ne doit prévenir les vrais salons pendant l'essai.
  sql(
    `create or replace function public.realtime_notify(p_room text, p_table text, p_op text, p_id text)
     returns void language plpgsql as $$ begin return; end $$`
  );

  check(
    fksTo('auth.users') === EXPECTED_FKS,
    'avant : clés vers auth.users',
    fksTo('auth.users')
  );
  const before = fingerprints();
  check(true, 'avant : empreintes relevées', Object.keys(before).length);

  const start = Date.now();
  applyFile(MIGRATIONS[0]);
  const mirrored = Date.now();
  applyFile(MIGRATIONS[1]);
  const repointed = Date.now();
  applyFile(MIGRATIONS[2]);
  check(
    true,
    'migrations appliquées',
    `miroir ${mirrored - start} ms, clés ${repointed - mirrored} ms, fonctions ${Date.now() - repointed} ms`
  );
  checkInstalled('appliquées');
  checkPrivileges();
  sameFingerprints(
    'mêmes résultats après les migrations',
    before,
    fingerprints()
  );

  applyAll();
  checkInstalled('rejouées');
  sameFingerprints(
    'mêmes résultats après les avoir rejouées',
    before,
    fingerprints()
  );

  revertAll();
  check(
    fksTo('auth.users') === EXPECTED_FKS,
    'retour arrière : clés vers auth.users',
    fksTo('auth.users')
  );
  check(
    count(
      `select count(*) from pg_tables where schemaname = 'public' and tablename in (${TABLES.map((t) => `'${t}'`).join(', ')})`
    ) === 0,
    'retour arrière : tables retirées'
  );
  check(
    count(
      `select count(*) from pg_trigger where tgname in ('auth_mirror_users', 'auth_mirror_identities')`
    ) === 0,
    'retour arrière : déclencheurs retirés'
  );
  sameFingerprints(
    'mêmes résultats après le retour arrière',
    before,
    fingerprints()
  );

  applyAll();
  checkInstalled('réappliquées');
  checkMirror();
  checkAuthAppRole();
}

try {
  run();
} catch (e) {
  check(false, 'essai interrompu', e.message);
}

lines.push(
  '',
  bad === 0 ? '**Tout est conforme.**' : `**${bad} contrôle(s) en écart.**`
);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    ['## Essai des migrations du lot 4', '', ...lines, ''].join('\n')
  );
}
process.exit(bad === 0 ? 0 : 1);
