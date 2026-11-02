// utils/db/rpc.ts — la porte des fonctions SQL appelées par l'API (lot 1 de
// conference-website docs/D1-MIGRATION.md).
//
// Tout appel d'une fonction de la base passe par `dbFunctions(db)(nom, arguments)`, qui rend
// exactement ce que rendrait `db.rpc(nom, arguments)` : mêmes types, même réponse. Aucun
// `.rpc(` ailleurs (garde-fou : tests/unit/dbDoorGuard.test.ts). Le jour du moteur suivant,
// une fonction se remplace ICI seul : réécrite en TypeScript sur D1, ou appelée telle quelle sur
// un autre Postgres.
//
// La liste ci-dessous est celle des fonctions que l'API appelle. En ajouter une, c'est ajouter
// une fonction à porter : le garde-fou refuse un nom absent.

/** Les fonctions de la base appelées par l'API, par domaine. */
export const DB_FUNCTIONS = [
  // Comptes (lecture, tables de Better Auth)
  'admin_list_users',
  'admin_search_users',
  'admin_get_user_profiles',
  'admin_search_tcg_players',
  'get_user_id_by_email',
  'count_confirmed_auth_users',
  // Équipes
  'accept_invitation',
  'approve_join_request',
  'approve_transfer_request',
  'transfer_captain',
  'reassign_captain',
  // Joueuses sans équipe (pool)
  'pool_register',
  'pool_place',
  'pool_unplace',
  'pool_move',
  'pool_withdraw',
  'pool_dissolve',
  'pool_add_team',
  // TCG
  'tcg_propose_trade',
  'tcg_accept_trade',
  'tcg_trade_eligibility',
  'tcg_forge_card',
  'tcg_buy_cosmetic',
  'tcg_purchase_booster',
  'tcg_admin_debit',
  'tcg_refresh_wallet_balance',
  // Women's Library
  'library_buy_furniture',
  'library_save_room_items',
  'library_lend_room_item',
  'library_return_room_item',
  'library_arena_claim_weekly_pack',
  // Quotas, limites, verrous des tâches
  'consume_api_usage',
  'consume_rate_limit',
  'cron_lock_acquire',
  'cron_lock_release',
  // Temps réel (secret des tickets)
  'realtime_ticket_secret',
] as const;

export type DbFunctionName = (typeof DB_FUNCTIONS)[number];

type RpcCapable = { rpc: unknown };

/**
 * Les fonctions de la base, vues par ce client. `dbFunctions(db)('pool_place', args)` ≡
 * `db.rpc('pool_place', args)`.
 */
export function dbFunctions<Db extends RpcCapable>(db: Db): Db['rpc'] {
  const rpc = db.rpc as (...args: unknown[]) => unknown;
  return rpc.bind(db) as Db['rpc'];
}
