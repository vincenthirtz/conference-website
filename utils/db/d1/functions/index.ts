// utils/db/d1/functions/index.ts — les fonctions de la base réécrites pour D1, par nom (lot 4 de
// conference-website docs/D1-MIGRATION.md). `client.rpc(nom, …)` de la façade les appelle ;
// une fonction absente d'ici rend encore PGRST202, comme une fonction inconnue de PostgREST.

import type { DbFunctionName } from '../../rpc';
import { adminGetUserProfiles, adminListUsers, adminSearchTcgPlayers, adminSearchUsers, countConfirmedAuthUsers, getUserIdByEmail } from './accounts';
import type { D1Function } from './context';
import { libraryArenaClaimWeeklyPack, libraryBuyFurniture, libraryLendRoomItem, libraryReturnRoomItem, librarySaveRoomItems } from './library';
import { poolAddTeam, poolDissolve, poolMove, poolPlace, poolRegister, poolUnplace, poolWithdraw } from './pool';
import { tcgAcceptTrade, tcgProposeTrade, tcgTradeEligibility } from './tcgTrades';
import { tcgAdminDebit, tcgBuyCosmetic, tcgForgeCard, tcgPurchaseBooster, tcgRefreshWalletBalance } from './tcgWallet';
import { acceptInvitation, approveJoinRequest, approveTransferRequest, reassignCaptain, transferCaptain } from './teams';
import { consumeApiUsage, consumeRateLimit, cronLockAcquire, cronLockRelease, realtimeTicketSecret } from './technical';

export const D1_FUNCTIONS: Partial<Record<DbFunctionName, D1Function>> = {
  // Lot 4d : lectures de comptes
  admin_list_users: adminListUsers,
  admin_search_users: adminSearchUsers,
  admin_get_user_profiles: adminGetUserProfiles,
  admin_search_tcg_players: adminSearchTcgPlayers,
  get_user_id_by_email: getUserIdByEmail,
  count_confirmed_auth_users: countConfirmedAuthUsers,
  // Lot 4d : quotas, limites, verrous des tâches, secret des tickets
  consume_api_usage: consumeApiUsage,
  consume_rate_limit: consumeRateLimit,
  cron_lock_acquire: cronLockAcquire,
  cron_lock_release: cronLockRelease,
  realtime_ticket_secret: realtimeTicketSecret,
  // Lot 4e : équipes
  accept_invitation: acceptInvitation,
  approve_join_request: approveJoinRequest,
  approve_transfer_request: approveTransferRequest,
  transfer_captain: transferCaptain,
  reassign_captain: reassignCaptain,
  // Lot 4e : joueuses sans équipe (vivier)
  pool_register: poolRegister,
  pool_place: poolPlace,
  pool_unplace: poolUnplace,
  pool_move: poolMove,
  pool_withdraw: poolWithdraw,
  pool_dissolve: poolDissolve,
  pool_add_team: poolAddTeam,
  // Lot 4f-1 : TCG (argent virtuel et échanges)
  tcg_propose_trade: tcgProposeTrade,
  tcg_accept_trade: tcgAcceptTrade,
  tcg_trade_eligibility: tcgTradeEligibility,
  tcg_forge_card: tcgForgeCard,
  tcg_buy_cosmetic: tcgBuyCosmetic,
  tcg_purchase_booster: tcgPurchaseBooster,
  tcg_admin_debit: tcgAdminDebit,
  tcg_refresh_wallet_balance: tcgRefreshWalletBalance,
  // Lot 4f-2 : Women's Library (meubles, salles, QG d'équipe, arène)
  library_buy_furniture: libraryBuyFurniture,
  library_save_room_items: librarySaveRoomItems,
  library_lend_room_item: libraryLendRoomItem,
  library_return_room_item: libraryReturnRoomItem,
  library_arena_claim_weekly_pack: libraryArenaClaimWeeklyPack,
};
