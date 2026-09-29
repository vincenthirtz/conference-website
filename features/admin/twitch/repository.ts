// features/admin/twitch/repository.ts — lectures/écritures de la connexion
// broadcaster et des cartes TCG, toutes scopées par l'espace DU staff.
//
// Les jetons (même chiffrés) ne sont JAMAIS lus ici : seul
// `getValidBroadcasterToken` (utils/twitchBroadcaster) les déchiffre, et ce
// qu'il rend ne sort pas du service.

import type { AdminDb } from '@/utils/admin/serviceContext';
import {
  CONNECTION_STATUS_COLUMNS,
  FANART_CANDIDATE_COLUMNS,
  FANART_TITLE_COLUMNS,
  TCG_REWARD_COLUMNS,
} from './schemas';

const TABLE = 'twitch_broadcaster_connections' as const;

export async function findConnectionStatus(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from(TABLE)
    .select(CONNECTION_STATUS_COLUMNS)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data ?? null, error };
}

export async function deleteConnection(db: AdminDb, tenantId: string) {
  const { error } = await db.from(TABLE).delete().eq('tenant_id', tenantId);
  return { error };
}

export async function findTcgRewardIds(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from(TABLE)
    .select(TCG_REWARD_COLUMNS)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data ?? null;
}

/** Désigne la récompense du drop (ordinaire ou mise en avant). */
export async function saveTcgReward(
  db: AdminDb,
  tenantId: string,
  rewardId: string,
  featuredFanartId: string | undefined
) {
  const { error } = await db
    .from(TABLE)
    .update({
      ...(featuredFanartId
        ? {
            tcg_featured_reward_id: rewardId,
            tcg_featured_fanart_id: featuredFanartId,
          }
        : { tcg_reward_id: rewardId }),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId);
  return { error };
}

/** Carte « L'association » PUBLIÉE de l'espace (récompense mise en avant). */
export async function findPublishedAssociationCard(
  db: AdminDb,
  tenantId: string,
  fanartId: string
) {
  const { data } = await db
    .from('tcg_fanart_cards')
    .select(FANART_TITLE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', fanartId)
    // « L'association » seulement : l'œuvre d'une autrice n'est pas mise aux
    // enchères de points (même règle que la liste de l'écran).
    .eq('category', 'association')
    .eq('status', 'approved')
    .maybeSingle();
  return data ?? null;
}

/** Cartes qu'une récompense mise en avant peut garantir. */
export async function listFeaturedCandidates(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tcg_fanart_cards')
    .select(FANART_CANDIDATE_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('category', 'association')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}
