// utils/db/d1/functions/pool.ts — le vivier des joueuses sans équipe (lot 4e de
// conference-website docs/D1-MIGRATION.md), réécrit depuis les fonctions plpgsql de Postgres
// (database/schema-prod.sql) : pool_register, pool_place, pool_unplace, pool_move,
// pool_withdraw, pool_dissolve, pool_add_team, et leur appui pool_release_team.
//
// Postgres les sérialisait par un verrou consultatif par tournoi ; D1 exécute un envoi à la fois,
// et chaque fonction tient en un envoi (context.ts). Mêmes refus (P0001, message et indice), dans
// le même ordre ; mêmes écritures, dans le même ordre.

import { DB_ERROR_CODES as C } from '../../errors';
import { dbError } from '../errors';
import { SQL_NOW } from '../now';
import { parsePgArrayLiteral, toUuid } from '../values';
import { CLEAR_VARS, guard, intArg, readArgs, REQUIRED, runBatch, setVar, textArg, uuidArg, varOf, type D1Function } from './context';

const RAISED = C.raiseException;

/** L'équipe entre au tournoi et dans chacune de ses phases (rien si elle y est déjà). */
const enterTeam = (tenant: string | null, tournament: string | null, team: string | null) => [
  {
    sql: `INSERT INTO "tournament_teams" ("tenant_id", "tournament_id", "team_id", "status") VALUES (?, ?, ?, 'registered') ON CONFLICT ("tournament_id", "team_id") DO NOTHING`,
    params: [tenant, tournament, team],
  },
  {
    sql: 'INSERT INTO "stage_teams" ("stage_id", "team_id", "tenant_id") SELECT s."id", ?, ? FROM "tournament_stages" AS s WHERE s."tournament_id" = ? ON CONFLICT ("stage_id", "team_id") DO NOTHING',
    params: [team, tenant, tournament],
  },
];

/**
 * pool_release_team : l'équipe sort du tournoi (et de ses phases) si plus personne n'y est
 * placé, qu'elle n'a pas d'effectif et aucun match. Rend la variable `release` (l'équipe, ou
 * NULL si elle reste).
 */
const releaseTeam = (tournament: string | null, teamExpr: string) => [
  setVar(
    'release',
    `SELECT CASE WHEN ${teamExpr} IS NULL
      OR EXISTS (SELECT 1 FROM "tournament_pool_entries" WHERE "tournament_id" = ?1 AND "placed_team_id" = ${teamExpr} AND "status" = 'placed')
      OR EXISTS (SELECT 1 FROM "team_members" WHERE "team_id" = ${teamExpr})
      OR EXISTS (SELECT 1 FROM "matches" WHERE "tournament_id" = ?1 AND ("team1_id" = ${teamExpr} OR "team2_id" = ${teamExpr}))
      THEN NULL ELSE ${teamExpr} END`.replace(/\s+/g, ' '),
    [tournament]
  ),
  {
    sql: `DELETE FROM "stage_teams" WHERE "team_id" = ${varOf('release')} AND "stage_id" IN (SELECT "id" FROM "tournament_stages" WHERE "tournament_id" = ?)`,
    params: [tournament],
  },
  { sql: `DELETE FROM "tournament_teams" WHERE "tournament_id" = ? AND "team_id" = ${varOf('release')}`, params: [tournament] },
];

const released = `${varOf('release')} IS NOT NULL`;

export const poolRegister: D1Function = async (ctx, raw) => {
  const a = readArgs('pool_register', raw, {
    p_tenant_id: REQUIRED,
    p_tournament_id: REQUIRED,
    p_user_id: REQUIRED,
    p_display_name: REQUIRED,
    p_battle_tag: REQUIRED,
    p_origin_team_id: REQUIRED,
    p_team_size: 5,
  });
  const [tenant, tournament, user, origin] = [uuidArg(a.p_tenant_id), uuidArg(a.p_tournament_id), uuidArg(a.p_user_id), uuidArg(a.p_origin_team_id)];
  const size = intArg(a.p_team_size);
  const results = await runBatch(
    ctx,
    [
      CLEAR_VARS,
      // Nouvelle inscription, ou mise à jour : placée, elle garde son placement ; sinon elle
      // revient en attente avec son équipe d'origine.
      {
        sql:
          'INSERT INTO "tournament_pool_entries" ("tenant_id", "tournament_id", "user_id", "display_name", "battle_tag", "origin_team_id") VALUES (?, ?, ?, ?, ?, ?) ' +
          'ON CONFLICT ("tournament_id", "user_id") DO UPDATE SET "display_name" = excluded."display_name", "battle_tag" = excluded."battle_tag", ' +
          `"origin_team_id" = CASE WHEN "tournament_pool_entries"."status" = 'placed' THEN "tournament_pool_entries"."origin_team_id" ELSE excluded."origin_team_id" END, ` +
          `"status" = CASE WHEN "tournament_pool_entries"."status" = 'placed' THEN 'placed' ELSE 'waitlist' END, "updated_at" = ${SQL_NOW}`,
        params: [tenant, tournament, user, textArg(a.p_display_name), textArg(a.p_battle_tag), origin],
      },
      // Sans compte (user_id NULL), aucune unicité : c'est la ligne tout juste insérée.
      setVar(
        'entry',
        'SELECT CASE WHEN ?1 IS NULL THEN (SELECT "id" FROM "tournament_pool_entries" WHERE rowid = last_insert_rowid()) ELSE (SELECT "id" FROM "tournament_pool_entries" WHERE "tournament_id" = ?2 AND "user_id" = ?1) END',
        [user, tournament]
      ),
      // L'équipe d'origine a-t-elle maintenant assez de joueuses en attente pour entrer ?
      {
        sql:
          `INSERT INTO "_d1_vars" ("k", "v") SELECT 'register', e."origin_team_id" FROM "tournament_pool_entries" AS e WHERE e."id" = ${varOf('entry')} ` +
          `AND e."status" = 'waitlist' AND e."origin_team_id" IS NOT NULL ` +
          'AND NOT EXISTS (SELECT 1 FROM "tournament_teams" WHERE "tournament_id" = ?1 AND "team_id" = e."origin_team_id") ' +
          `AND (SELECT count(*) FROM "tournament_pool_entries" WHERE "tournament_id" = ?1 AND "origin_team_id" = e."origin_team_id" AND "status" = 'waitlist') >= ?2`,
        params: [tournament, size],
      },
      {
        sql:
          `UPDATE "tournament_pool_entries" SET "status" = 'placed', "placed_team_id" = "origin_team_id", "placed_at" = ${SQL_NOW}, "updated_at" = ${SQL_NOW} ` +
          `WHERE "id" IN (SELECT "id" FROM "tournament_pool_entries" WHERE "tournament_id" = ? AND "origin_team_id" = ${varOf('register')} AND "status" = 'waitlist' ORDER BY "created_at", "id" LIMIT ?)`,
        params: [tournament, size],
      },
      {
        sql: `INSERT INTO "tournament_teams" ("tenant_id", "tournament_id", "team_id", "status") SELECT ?, ?, "v", 'registered' FROM "_d1_vars" WHERE "k" = 'register' ON CONFLICT ("tournament_id", "team_id") DO NOTHING`,
        params: [tenant, tournament],
      },
      {
        sql: `INSERT INTO "stage_teams" ("stage_id", "team_id", "tenant_id") SELECT s."id", v."v", ? FROM "tournament_stages" AS s, "_d1_vars" AS v WHERE v."k" = 'register' AND s."tournament_id" = ? ON CONFLICT ("stage_id", "team_id") DO NOTHING`,
        params: [tenant, tournament],
      },
      {
        sql: `SELECT e."id" AS "entry_id", e."status" AS "entry_status", EXISTS (SELECT 1 FROM "_d1_vars" WHERE "k" = 'register') AS "team_registered" FROM "tournament_pool_entries" AS e WHERE e."id" = ${varOf('entry')}`,
        params: [],
      },
      CLEAR_VARS,
    ],
    { table: 'tournament_pool_entries', operation: 'upsert' }
  );
  const row = results[results.length - 2]?.[0];
  return row ? [{ entry_id: row.entry_id, entry_status: row.entry_status, team_registered: Number(row.team_registered) === 1 }] : [];
};

/** uuid[] : un tableau JSON, ou un littéral Postgres « {…} » ; sinon l'erreur de Postgres. */
function uuidList(v: unknown): Array<string | null> | null {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v) && typeof v !== 'string') throw dbError(C.invalidTextRepresentation, `malformed array literal: "${String(v)}"`);
  const list: unknown[] = Array.isArray(v) ? v : parsePgArrayLiteral(v);
  return list.map((x) => (x === null ? null : toUuid(x)));
}

export const poolPlace: D1Function = async (ctx, raw) => {
  const a = readArgs('pool_place', raw, { p_tenant_id: REQUIRED, p_tournament_id: REQUIRED, p_entry_ids: REQUIRED, p_team_id: REQUIRED, p_team_size: 5 });
  const ids = uuidList(a.p_entry_ids) ?? [];
  if (ids.length === 0) throw dbError(C.raiseException, 'pool_place: no entries', null, 'empty');
  const [tenant, tournament, team] = [uuidArg(a.p_tenant_id), uuidArg(a.p_tournament_id), uuidArg(a.p_team_id)];
  const size = intArg(a.p_team_size);
  const idsJson = JSON.stringify(ids);
  const placedCount = 'SELECT count(*) AS "n" FROM "tournament_pool_entries" WHERE "tournament_id" = ? AND "placed_team_id" = ? AND "status" = \'placed\'';
  const results = await runBatch(
    ctx,
    [
      guard(
        RAISED,
        'pool_place: entries not waiting',
        `(SELECT count(*) FROM "tournament_pool_entries" WHERE "tournament_id" = ? AND "tenant_id" = ? AND "id" IN (SELECT "value" FROM json_each(?)) AND "status" = 'waitlist') <> ?`,
        [tournament, tenant, idsJson, ids.length],
        'not_waiting'
      ),
      guard(RAISED, 'pool_place: team full', `(${placedCount}) + ? > ?`, [tournament, team, ids.length, size], 'team_full'),
      {
        sql: `UPDATE "tournament_pool_entries" SET "status" = 'placed', "placed_team_id" = ?, "placed_at" = ${SQL_NOW}, "updated_at" = ${SQL_NOW} WHERE "tournament_id" = ? AND "id" IN (SELECT "value" FROM json_each(?))`,
        params: [team, tournament, idsJson],
      },
      ...enterTeam(tenant, tournament, team),
      // v_placed + v_n : toutes les entrées étaient en attente et distinctes (gardes ci-dessus).
      { sql: placedCount, params: [tournament, team] },
    ],
    { table: 'tournament_pool_entries', operation: 'update' }
  );
  return Number(results[results.length - 1]?.[0]?.n);
};

/** La ligne d'une inscription du tournoi et de l'espace. */
const entryValue = (column: string) => `SELECT "${column}" FROM "tournament_pool_entries" WHERE "id" = ?1 AND "tournament_id" = ?2 AND "tenant_id" = ?3`;

export const poolUnplace: D1Function = async (ctx, raw) => {
  const a = readArgs('pool_unplace', raw, { p_tenant_id: REQUIRED, p_tournament_id: REQUIRED, p_entry_id: REQUIRED });
  const [tenant, tournament, entry] = [uuidArg(a.p_tenant_id), uuidArg(a.p_tournament_id), uuidArg(a.p_entry_id)];
  const results = await runBatch(
    ctx,
    [
      CLEAR_VARS,
      setVar('team', `${entryValue('placed_team_id')} AND "status" = 'placed'`, [entry, tournament, tenant]),
      guard(RAISED, 'pool_unplace: entry not placed', `${varOf('team')} IS NULL`, [], 'not_placed'),
      {
        sql: `UPDATE "tournament_pool_entries" SET "status" = 'waitlist', "placed_team_id" = NULL, "placed_at" = NULL, "updated_at" = ${SQL_NOW} WHERE "id" = ?`,
        params: [entry],
      },
      ...releaseTeam(tournament, varOf('team')),
      { sql: `SELECT CASE WHEN ${released} THEN 'team_unregistered' ELSE 'unplaced' END AS "r"`, params: [] },
      CLEAR_VARS,
    ],
    { table: 'tournament_pool_entries', operation: 'update' }
  );
  return results[results.length - 2]?.[0]?.r ?? null;
};

export const poolMove: D1Function = async (ctx, raw) => {
  const a = readArgs('pool_move', raw, { p_tenant_id: REQUIRED, p_tournament_id: REQUIRED, p_entry_id: REQUIRED, p_team_id: REQUIRED, p_team_size: 5 });
  const [tenant, tournament, entry, team] = [uuidArg(a.p_tenant_id), uuidArg(a.p_tournament_id), uuidArg(a.p_entry_id), uuidArg(a.p_team_id)];
  const size = intArg(a.p_team_size);
  // « v_old = p_team_id » : une cible NULL ne vaut pas « inchangé ».
  const moving = `${varOf('old')} IS NOT ?`;
  const results = await runBatch(
    ctx,
    [
      CLEAR_VARS,
      setVar('old', `${entryValue('placed_team_id')} AND "status" = 'placed'`, [entry, tournament, tenant]),
      guard(RAISED, 'pool_move: entry not placed', `${varOf('old')} IS NULL`, [], 'not_placed'),
      guard(
        RAISED,
        'pool_move: target not entered',
        `${moving} AND NOT EXISTS (SELECT 1 FROM "tournament_teams" WHERE "tournament_id" = ? AND "team_id" = ? AND "tenant_id" = ?)`,
        [team, tournament, team, tenant],
        'invalid_target'
      ),
      guard(
        RAISED,
        'pool_move: team full',
        `${moving} AND (SELECT count(*) FROM "tournament_pool_entries" WHERE "tournament_id" = ? AND "placed_team_id" = ? AND "status" = 'placed') + 1 > ?`,
        [team, tournament, team, size],
        'team_full'
      ),
      {
        sql: `UPDATE "tournament_pool_entries" SET "placed_team_id" = ?, "placed_at" = ${SQL_NOW}, "updated_at" = ${SQL_NOW} WHERE "id" = ? AND ${moving}`,
        params: [team, entry, team],
      },
      // L'ancienne équipe, seulement si la joueuse a bougé.
      setVar('moved_from', `SELECT CASE WHEN ${moving} THEN ${varOf('old')} END`, [team]),
      ...releaseTeam(tournament, varOf('moved_from')),
      {
        sql: `SELECT CASE WHEN NOT (${moving}) THEN 'unchanged' WHEN ${released} THEN 'moved_team_unregistered' ELSE 'moved' END AS "r"`,
        params: [team],
      },
      CLEAR_VARS,
    ],
    { table: 'tournament_pool_entries', operation: 'update' }
  );
  return results[results.length - 2]?.[0]?.r ?? null;
};

export const poolWithdraw: D1Function = async (ctx, raw) => {
  const a = readArgs('pool_withdraw', raw, { p_tenant_id: REQUIRED, p_tournament_id: REQUIRED, p_entry_id: REQUIRED });
  const [tenant, tournament, entry] = [uuidArg(a.p_tenant_id), uuidArg(a.p_tournament_id), uuidArg(a.p_entry_id)];
  const results = await runBatch(
    ctx,
    [
      CLEAR_VARS,
      setVar('status', entryValue('status'), [entry, tournament, tenant]),
      setVar('team', entryValue('placed_team_id'), [entry, tournament, tenant]),
      guard(RAISED, 'pool_withdraw: entry not active', `${varOf('status')} IS NULL OR ${varOf('status')} NOT IN ('waitlist', 'placed')`, [], 'not_active'),
      {
        sql: `UPDATE "tournament_pool_entries" SET "status" = 'withdrawn', "placed_team_id" = NULL, "placed_at" = NULL, "updated_at" = ${SQL_NOW} WHERE "id" = ?`,
        params: [entry],
      },
      ...releaseTeam(tournament, varOf('team')),
      { sql: `SELECT CASE WHEN ${released} THEN 'withdrawn_team_unregistered' ELSE 'withdrawn' END AS "r"`, params: [] },
      CLEAR_VARS,
    ],
    { table: 'tournament_pool_entries', operation: 'update' }
  );
  return results[results.length - 2]?.[0]?.r ?? null;
};

export const poolDissolve: D1Function = async (ctx, raw) => {
  const a = readArgs('pool_dissolve', raw, { p_tenant_id: REQUIRED, p_tournament_id: REQUIRED, p_team_id: REQUIRED });
  const [tenant, tournament, team] = [uuidArg(a.p_tenant_id), uuidArg(a.p_tournament_id), uuidArg(a.p_team_id)];
  const results = await runBatch(
    ctx,
    [
      guard(
        RAISED,
        'pool_dissolve: team not entered',
        'NOT EXISTS (SELECT 1 FROM "tournament_teams" WHERE "tournament_id" = ? AND "team_id" = ? AND "tenant_id" = ?)',
        [tournament, team, tenant],
        'invalid_target'
      ),
      guard(
        RAISED,
        'pool_dissolve: team has matches',
        'EXISTS (SELECT 1 FROM "matches" WHERE "tournament_id" = ? AND ("team1_id" = ? OR "team2_id" = ?))',
        [tournament, team, team],
        'has_matches'
      ),
      {
        sql: `UPDATE "tournament_pool_entries" SET "status" = 'waitlist', "placed_team_id" = NULL, "placed_at" = NULL, "updated_at" = ${SQL_NOW} WHERE "tournament_id" = ? AND "tenant_id" = ? AND "placed_team_id" = ? AND "status" = 'placed' RETURNING 1 AS "x"`,
        params: [tournament, tenant, team],
      },
      {
        sql: 'DELETE FROM "stage_teams" WHERE "team_id" = ? AND "stage_id" IN (SELECT "id" FROM "tournament_stages" WHERE "tournament_id" = ?)',
        params: [team, tournament],
      },
      { sql: 'DELETE FROM "tournament_teams" WHERE "tournament_id" = ? AND "team_id" = ?', params: [tournament, team] },
    ],
    { table: 'tournament_pool_entries', operation: 'update' }
  );
  return results[2]?.length ?? 0;
};

export const poolAddTeam: D1Function = async (ctx, raw) => {
  const a = readArgs('pool_add_team', raw, { p_tenant_id: REQUIRED, p_tournament_id: REQUIRED, p_team_id: REQUIRED });
  const [tenant, tournament, team] = [uuidArg(a.p_tenant_id), uuidArg(a.p_tournament_id), uuidArg(a.p_team_id)];
  await runBatch(ctx, enterTeam(tenant, tournament, team), { table: 'tournament_teams', operation: 'insert' });
  return null;
};
