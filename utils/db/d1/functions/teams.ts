// utils/db/d1/functions/teams.ts — les 5 fonctions d'équipe (lot 4e de
// conference-website docs/D1-MIGRATION.md), réécrites depuis les fonctions plpgsql de Postgres
// (database/schema-prod.sql) : accept_invitation, approve_join_request,
// approve_transfer_request, transfer_captain, reassign_captain.
//
// Chacune en UN envoi (context.ts) : le verrou FOR UPDATE de Postgres devient inutile, D1
// n'exécutant qu'un envoi à la fois. Mêmes refus, dans le même ordre, avec le même code
// (P0002 introuvable, P0001 sinon) et le même message, que mapTeamRpcError (utils/teams/rpcErrors.ts)
// lit. Les déclencheurs de team_members (lot 4b : limite de joueuses, BattleTag vérifié,
// étiquette supporter, meubles prêtés) et le temps réel des demandes (lot 4c) jouent seuls.

import { DB_ERROR_CODES as C } from '../../errors';
import { foldCase } from '../collation';
import { SQL_NOW } from '../now';
import { CLEAR_VARS, decodeTableRow, guard, readArgs, REQUIRED, runBatch, setVar, touchSql, uuidArg, varOf, type D1Function, type D1FunctionContext } from './context';

const NOT_FOUND = C.noDataFound; // ERRCODE no_data_found
const RAISED = C.raiseException; // ERRCODE raise_exception

/** Les refus communs aux demandes, dans l'ordre des fonctions plpgsql. */
function demandeGuards(id: string | null, type: string, owner?: { user: string | null }) {
  const exists = (cond: string) => `EXISTS (SELECT 1 FROM "demandes" WHERE "id" = ? AND ${cond})`;
  return [
    guard(NOT_FOUND, 'demande_not_found', 'NOT EXISTS (SELECT 1 FROM "demandes" WHERE "id" = ?)', [id]),
    guard(RAISED, 'demande_wrong_type', exists(`"type" <> '${type}'`), [id]),
    guard(RAISED, 'demande_not_pending', exists(`"status" <> 'pending'`), [id]),
    ...(owner ? [guard(RAISED, 'not_owner', exists('"user_id" IS NOT ?'), [id, owner.user])] : []),
    guard(RAISED, 'demande_no_team', exists('"team_id" IS NULL'), [id]),
  ];
}

/**
 * La demande, avec le rôle voulu : `lower(coalesce(payload->>'desired_role', 'player'))`, ramené
 * à 'player' hors de la liste permise.
 */
function demandeWithRole(allowed: string[]) {
  const role = `CASE WHEN x."r" IN (${allowed.map((r) => `'${r}'`).join(', ')}) THEN x."r" ELSE 'player' END`;
  const from = `(SELECT d.*, ${foldCase(`coalesce(json_extract(d."payload", '$.desired_role'), 'player')`)} AS "r" FROM "demandes" AS d WHERE d."id" = ?) AS x`;
  return { role, from };
}

const approveDemande = (ctx: D1FunctionContext, id: string | null) => ({
  sql: `UPDATE "demandes" SET "status" = 'approved', "processed_at" = ${SQL_NOW}${touchSql(ctx, 'demandes')} WHERE "id" = ?`,
  params: [id],
});

const MEMBER_COLUMNS = '"tenant_id", "team_id", "user_id", "role", "battle_tag", "is_substitute", "accepted_at"';

/** accept_invitation / approve_join_request : la membre rejoint l'équipe de la demande. */
function joinFromDemande(kind: 'invite' | 'join'): D1Function {
  const name = kind === 'invite' ? 'accept_invitation' : 'approve_join_request';
  const allowed = kind === 'invite' ? ['player', 'substitute', 'coach', 'manager'] : ['player', 'substitute', 'coach'];
  const tagKey = kind === 'invite' ? 'battle_tag' : 'user_battle_tag';
  return async (ctx, raw) => {
    const a = readArgs(name, raw, kind === 'invite' ? { p_demande_id: REQUIRED, p_user_id: REQUIRED } : { p_demande_id: REQUIRED });
    const id = uuidArg(a.p_demande_id);
    const owner = kind === 'invite' ? { user: uuidArg(a.p_user_id) } : undefined;
    const { role, from } = demandeWithRole(allowed);
    const results = await runBatch(
      ctx,
      [
        ...demandeGuards(id, kind, owner),
        {
          sql: `INSERT INTO "team_members" (${MEMBER_COLUMNS}) SELECT x."tenant_id", x."team_id", x."user_id", ${role}, nullif(json_extract(x."payload", '$.${tagKey}'), ''), (${role}) = 'substitute', ${SQL_NOW} FROM ${from}`,
          params: [id],
        },
        approveDemande(ctx, id),
        // La ligne écrite, relue APRÈS les déclencheurs (to_jsonb de Postgres les voyait déjà).
        {
          sql: 'SELECT tm.* FROM "team_members" AS tm JOIN "demandes" AS d ON tm."team_id" = d."team_id" AND tm."user_id" = d."user_id" WHERE d."id" = ?',
          params: [id],
        },
      ],
      { table: 'team_members', operation: 'insert' }
    );
    return decodeTableRow(ctx, 'team_members', results[results.length - 1]?.[0]);
  };
}

export const acceptInvitation = joinFromDemande('invite');
export const approveJoinRequest = joinFromDemande('join');

/**
 * approve_transfer_request : déjà dans l'équipe visée → la demande est seulement approuvée ;
 * sinon l'ancien rattachement de l'espace part (BattleTag gardé si la demande n'en donne pas),
 * le nouveau arrive.
 */
export const approveTransferRequest: D1Function = async (ctx, raw) => {
  const a = readArgs('approve_transfer_request', raw, { p_demande_id: REQUIRED });
  const id = uuidArg(a.p_demande_id);
  const { role, from } = demandeWithRole(['player', 'substitute', 'coach']);
  const current = (column: string) =>
    `SELECT tm."${column}" FROM "team_members" AS tm JOIN "demandes" AS d ON tm."tenant_id" = d."tenant_id" AND tm."user_id" = d."user_id" WHERE d."id" = ? LIMIT 1`;
  // « v_current_team = v_demande.team_id » : NULL compte comme différent.
  const moving = `coalesce(${varOf('team')} = (SELECT "team_id" FROM "demandes" WHERE "id" = ?), 0) = 0`;
  const results = await runBatch(
    ctx,
    [
      CLEAR_VARS,
      ...demandeGuards(id, 'transfer'),
      setVar('team', current('team_id'), [id]),
      setVar('tag', current('battle_tag'), [id]),
      {
        sql: `DELETE FROM "team_members" WHERE "tenant_id" = (SELECT "tenant_id" FROM "demandes" WHERE "id" = ?) AND "user_id" = (SELECT "user_id" FROM "demandes" WHERE "id" = ?) AND ${varOf('team')} IS NOT NULL AND ${moving}`,
        params: [id, id, id],
      },
      {
        sql: `INSERT INTO "team_members" (${MEMBER_COLUMNS}) SELECT x."tenant_id", x."team_id", x."user_id", ${role}, coalesce(nullif(json_extract(x."payload", '$.user_battle_tag'), ''), ${varOf('tag')}), (${role}) = 'substitute', ${SQL_NOW} FROM ${from} WHERE ${moving}`,
        params: [id, id],
      },
      approveDemande(ctx, id),
      {
        sql: 'SELECT tm.* FROM "team_members" AS tm JOIN "demandes" AS d ON tm."tenant_id" = d."tenant_id" AND tm."user_id" = d."user_id" WHERE d."id" = ? ORDER BY tm."team_id" IS d."team_id" DESC LIMIT 1',
        params: [id],
      },
      CLEAR_VARS,
    ],
    { table: 'team_members', operation: 'insert' }
  );
  return decodeTableRow(ctx, 'team_members', results[results.length - 2]?.[0]);
};

const teamGuard = (team: string | null, tenant: string | null) =>
  guard(NOT_FOUND, 'team_not_found', 'NOT EXISTS (SELECT 1 FROM "teams" WHERE "id" = ? AND "tenant_id" = ?)', [team, tenant]);
/** La cible doit être membre de l'équipe, encadrement « coach » exclu (role <> 'coach'). */
const notMember = 'NOT EXISTS (SELECT 1 FROM "team_members" WHERE "team_id" = ? AND "tenant_id" = ? AND "user_id" = ? AND "role" <> \'coach\')';
const readCaptain = (team: string | null, tenant: string | null) => ({
  sql: 'SELECT "captain_id" FROM "teams" WHERE "id" = ? AND "tenant_id" = ?',
  params: [team, tenant],
});

/** transfer_captain : la capitaine en place cède à une membre de l'équipe. */
export const transferCaptain: D1Function = async (ctx, raw) => {
  const a = readArgs('transfer_captain', raw, { p_team_id: REQUIRED, p_new_captain: REQUIRED, p_tenant: REQUIRED, p_actor: REQUIRED });
  const [team, next, tenant, actor] = [uuidArg(a.p_team_id), uuidArg(a.p_new_captain), uuidArg(a.p_tenant), uuidArg(a.p_actor)];
  const results = await runBatch(
    ctx,
    [
      teamGuard(team, tenant),
      guard(RAISED, 'not_captain', 'EXISTS (SELECT 1 FROM "teams" WHERE "id" = ? AND "tenant_id" = ? AND "captain_id" IS NOT ?)', [team, tenant, actor]),
      guard(RAISED, 'same_user', '? = ?', [next, actor]),
      guard(RAISED, 'target_not_member', notMember, [team, tenant, next]),
      readCaptain(team, tenant),
      { sql: `UPDATE "teams" SET "captain_id" = ?, "updated_at" = ${SQL_NOW} WHERE "id" = ? AND "tenant_id" = ?`, params: [next, team, tenant] },
    ],
    { table: 'teams', operation: 'update' }
  );
  const previous = results[4]?.[0]?.captain_id ?? null;
  return { team_id: team, captain_id: next, previous_captain: previous };
};

/** reassign_captain (staff) : rien à faire si c'est déjà elle ; sinon une membre de l'équipe. */
export const reassignCaptain: D1Function = async (ctx, raw) => {
  const a = readArgs('reassign_captain', raw, { p_team_id: REQUIRED, p_new_captain: REQUIRED, p_tenant: REQUIRED });
  const [team, next, tenant] = [uuidArg(a.p_team_id), uuidArg(a.p_new_captain), uuidArg(a.p_tenant)];
  const changing = 'EXISTS (SELECT 1 FROM "teams" WHERE "id" = ? AND "tenant_id" = ? AND "captain_id" IS NOT ?)';
  const results = await runBatch(
    ctx,
    [
      teamGuard(team, tenant),
      readCaptain(team, tenant),
      guard(RAISED, 'target_not_member', `${changing} AND ${notMember}`, [team, tenant, next, team, tenant, next]),
      {
        sql: `UPDATE "teams" SET "captain_id" = ?, "updated_at" = ${SQL_NOW} WHERE "id" = ? AND "tenant_id" = ? AND "captain_id" IS NOT ?`,
        params: [next, team, tenant, next],
      },
    ],
    { table: 'teams', operation: 'update' }
  );
  const previous = (results[1]?.[0]?.captain_id as string | null | undefined) ?? null;
  return { team_id: team, captain_id: next, previous_captain: previous, unchanged: previous === next };
};
