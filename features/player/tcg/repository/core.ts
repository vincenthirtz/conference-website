// features/player/tcg/repository/core.ts — lectures directes du module TCG joueuse
// (lot P14). La base est REÇUE (`db`), toujours scopée tenant + joueuse.
//
// Le reste des lectures et TOUTES les écritures monétaires passent par les
// utils existants (`utils/tcg/*`) et leurs RPC : réservation atomique, registre
// à clé unique. Ce fichier n'en duplique aucune.

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Colonnes d'un mouvement du registre, rendues par `readWalletEntries`. */
export type WalletEntryRow = {
  id: string;
  amount: number;
  source_kind: string;
  source_ref: string;
  note: string | null;
  created_at: string;
};

/** Les `limit` derniers mouvements du porte-monnaie, du plus récent au plus ancien. */
export async function readWalletEntries(
  db: AdminDb,
  k: { tenantId: string; userId: string; limit: number }
): Promise<{ rows: WalletEntryRow[]; error: { message: string } | null }> {
  const { data, error } = await db
    .from('tcg_wallet_entries')
    .select('id, amount, source_kind, source_ref, note, created_at')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .order('created_at', { ascending: false })
    .limit(k.limit);
  return { rows: (data ?? []) as WalletEntryRow[], error };
}

/* -------------------------------------------------------------------------
 * Recyclage d'un doublon (`service/recycle.ts`). Les deux garde-fous contre
 * le double recyclage sont PORTÉS PAR LE SCHÉMA, pas par ce code :
 *   1. réservation ATOMIQUE — le marquage exige `recycled_at IS NULL` ;
 *   2. registre UNIQUE par source — `(tenant_id, user_id, source_kind,
 *      source_ref)` interdit de créditer deux fois la même carte.
 * ---------------------------------------------------------------------- */

type CardRef = { packIds: string[]; packId: string; position: number };

/** Marque la carte recyclée SI elle ne l'est pas déjà ; rend les lignes touchées. */
export async function markCardRecycled(
  db: AdminDb,
  k: CardRef & { recycledAt: string }
) {
  const { data, error } = await db
    .from('tcg_pack_cards')
    .update({ recycled_at: k.recycledAt })
    .in('pack_id', k.packIds)
    .eq('pack_id', k.packId)
    .eq('position', k.position)
    .is('recycled_at', null)
    .select('pack_id');
  return { marked: data ?? [], error };
}

/** Relâche NOTRE marquage (même horodatage) — pas celui d'un autre appel. */
export async function releaseOwnMark(
  db: AdminDb,
  k: CardRef & { recycledAt: string }
) {
  const { error } = await db
    .from('tcg_pack_cards')
    .update({ recycled_at: null })
    .in('pack_id', k.packIds)
    .eq('pack_id', k.packId)
    .eq('position', k.position)
    .eq('recycled_at', k.recycledAt);
  return { error };
}

/** Relâche le marquage d'une carte dont le crédit a échoué. */
export async function releaseMark(
  db: AdminDb,
  k: { packId: string; position: number }
) {
  const { error } = await db
    .from('tcg_pack_cards')
    .update({ recycled_at: null })
    .eq('pack_id', k.packId)
    .eq('position', k.position);
  return { error };
}

type RecycleCredit = {
  tenantId: string;
  userId: string;
  sourceRef: string;
};

/** Écrit le crédit au registre (unique par source). */
export async function insertRecycleCredit(
  db: AdminDb,
  k: RecycleCredit & { amount: number }
) {
  const { error } = await db.from('tcg_wallet_entries').insert({
    tenant_id: k.tenantId,
    user_id: k.userId,
    amount: k.amount,
    source_kind: 'card_recycled',
    source_ref: k.sourceRef,
  });
  return { error };
}

/** Le crédit de CETTE carte existe-t-il déjà (erreur après commit) ? */
export async function findRecycleCredit(db: AdminDb, k: RecycleCredit) {
  const { data, error } = await db
    .from('tcg_wallet_entries')
    .select('id')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .eq('source_kind', 'card_recycled')
    .eq('source_ref', k.sourceRef)
    .maybeSingle();
  return { existing: data, error };
}

/** Les montants du REGISTRE de la joueuse — c'est lui qui fait foi (forge). */
export async function readLedgerAmounts(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { data, error } = await db
    .from('tcg_wallet_entries')
    .select('amount')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId);
  return { amounts: (data ?? []).map((r) => Number(r.amount ?? 0)), error };
}

/**
 * La forge, en UNE transaction (`tcg_forge_card`) : retirer les cartes,
 * débiter, créer le paquet, y poser la carte — tout ou rien. Elle DOUBLE les
 * contrôles du service (une autre requête a pu consommer la même carte).
 */
export async function forgeCardRpc(
  db: AdminDb,
  k: {
    tenantId: string;
    userId: string;
    cards: { packId: string; position: number }[];
    fee: number;
    rarity: string;
    targetUserId: string;
  }
) {
  const { data, error } = await db.rpc('tcg_forge_card', {
    p_tenant_id: k.tenantId,
    p_user_id: k.userId,
    p_cards: k.cards,
    p_fee: k.fee,
    p_rarity: k.rarity,
    p_subject_kind: 'player',
    p_card_user_id: k.targetUserId,
  });
  return {
    result: (data ?? {}) as { packId?: string; balance?: number },
    error,
  };
}

/** La ligne de vitrine (habillages), `null` si elle n'existe pas encore. */
export async function readShowcaseCosmetics(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { data, error } = await db
    .from('tcg_showcases')
    .select('frame, background, unlocked_cosmetics')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .maybeSingle();
  return { row: data, error };
}

/**
 * L'achat d'un habillage, en UNE transaction (`tcg_buy_cosmetic`) : débit au
 * registre + déblocage, tout ou rien, refus « déjà possédé » / « solde
 * insuffisant » levés par la base.
 */
export async function buyCosmeticRpc(
  db: AdminDb,
  k: { tenantId: string; userId: string; key: string; price: number }
) {
  const { data, error } = await db.rpc('tcg_buy_cosmetic', {
    p_tenant_id: k.tenantId,
    p_user_id: k.userId,
    p_key: k.key,
    p_price: k.price,
  });
  return { balance: (data as { balance?: number } | null)?.balance, error };
}

/** Pose les habillages équipés (clés PRÉSENTES seulement). */
export async function upsertEquippedCosmetics(
  db: AdminDb,
  k: {
    tenantId: string;
    userId: string;
    patch: { frame?: string | null; background?: string | null };
  }
) {
  const { error } = await db.from('tcg_showcases').upsert(
    {
      tenant_id: k.tenantId,
      user_id: k.userId,
      ...k.patch,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,user_id' }
  );
  return { error };
}

/* -------------------------------------------------------------------------
 * Paquets (`service/packs.ts`). L'ouverture est protégée PAR LE SCHÉMA :
 * la réservation n'aboutit que si `opened_at IS NULL` — deux clics simultanés
 * ne peuvent pas ouvrir deux fois le même paquet.
 * ---------------------------------------------------------------------- */

export type PackRow = {
  id: string;
  source_kind: string;
  granted_at: string;
  opened_at: string | null;
};

/** Une page de paquets reçus, ordre (granted_at DESC, id DESC), `limit + 1` lignes. */
export async function readPacksPage(
  db: AdminDb,
  k: {
    tenantId: string;
    userId: string;
    status?: 'unopened' | 'opened';
    /** « Strictement après » ce paquet ; valeurs validées par le décodeur. */
    after: { grantedAt: string; id: string } | null;
    limit: number;
  }
) {
  let q = db
    .from('tcg_packs')
    .select('id, source_kind, granted_at, opened_at')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    // Un paquet `trade` recueille les cartes d'un échange accepté, ouvert
    // d'emblée : ce n'est pas un paquet REÇU.
    .neq('source_kind', 'trade');
  if (k.status === 'unopened') q = q.is('opened_at', null);
  if (k.status === 'opened') q = q.not('opened_at', 'is', null);
  if (k.after) {
    q = q.or(
      `granted_at.lt.${k.after.grantedAt},and(granted_at.eq.${k.after.grantedAt},id.lt.${k.after.id})`
    );
  }
  const { data, error } = await q
    .order('granted_at', { ascending: false })
    // Second critère : des paquets distribués en lot partagent leur date.
    .order('id', { ascending: false })
    // Une ligne de plus : c'est elle qui dit s'il reste une page.
    .limit(k.limit + 1);
  return { rows: (data ?? []) as PackRow[], error };
}

/** Le solde en CACHE (`tcg_wallets`) ; `null` = pas encore de porte-monnaie. */
export async function readWalletBalance(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { data, error } = await db
    .from('tcg_wallets')
    .select('balance')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .maybeSingle();
  return { balance: data?.balance ?? null, error };
}

/** Nombre de paquets fermés (compte exact, aucune ligne rapatriée). */
export async function countUnopenedPacks(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { count, error } = await db
    .from('tcg_packs')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .is('opened_at', null);
  return { count, error };
}

/** La récompense Twitch désignée pour le drop, s'il y en a une. */
export async function readTwitchTcgRewardId(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('twitch_broadcaster_connections')
    .select('tcg_reward_id')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { rewardId: data?.tcg_reward_id ?? null, error };
}

/** MON paquet (tenant + joueuse) : absent = pas le mien, ou inexistant. */
export async function readOwnPack(
  db: AdminDb,
  k: { tenantId: string; userId: string; packId: string }
) {
  const { data, error } = await db
    .from('tcg_packs')
    .select('id, opened_at, guaranteed_fanart_id')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .eq('id', k.packId)
    .maybeSingle();
  return { pack: data, error };
}

/** RÉSERVATION ATOMIQUE : n'aboutit que si le paquet est encore fermé. */
export async function claimPack(
  db: AdminDb,
  k: { tenantId: string; userId: string; packId: string; openedAt: string }
) {
  const { data, error } = await db
    .from('tcg_packs')
    .update({ opened_at: k.openedAt })
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .eq('id', k.packId)
    .is('opened_at', null)
    .select('id');
  return { claimed: data ?? [], error };
}

/** Relâche la réservation : un paquet ouvert et vide ne se rejoue pas. */
export async function releasePackClaim(
  db: AdminDb,
  k: { tenantId: string; userId: string; packId: string }
) {
  const { error } = await db
    .from('tcg_packs')
    .update({ opened_at: null })
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .eq('id', k.packId);
  return { error };
}

export type PackCardInsert = {
  pack_id: string;
  position: number;
  subject_kind: 'player' | 'team' | 'map' | 'fanart' | 'mascot';
  card_user_id: string | null;
  card_team_id: string | null;
  card_map_slug: string | null;
  card_mascot_slug: string | null;
  card_fanart_id: string | null;
  rarity: string;
  is_foil: boolean;
};

/** Fige les cartes tirées du paquet. */
export async function insertPackCards(db: AdminDb, cards: PackCardInsert[]) {
  const { error } = await db.from('tcg_pack_cards').insert(cards);
  return { error };
}

/** Rareté décidée à la validation d'une fan art ENCORE publiable. */
export async function readApprovedFanartRarity(
  db: AdminDb,
  k: { tenantId: string; fanartId: string }
) {
  const { data, error } = await db
    .from('tcg_fanart_cards')
    .select('rarity')
    .eq('tenant_id', k.tenantId)
    .eq('id', k.fanartId)
    .eq('status', 'approved')
    .maybeSingle();
  return { rarity: data?.rarity ?? null, error };
}

/** Réglage de la vitrine (visible ou non, cartes montrées). */
export async function upsertShowcaseSettings(
  db: AdminDb,
  k: { tenantId: string; userId: string; enabled: boolean; keys: string[] }
) {
  const { error } = await db.from('tcg_showcases').upsert(
    {
      tenant_id: k.tenantId,
      user_id: k.userId,
      enabled: k.enabled,
      subject_keys: k.keys,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'tenant_id,user_id' }
  );
  return { error };
}

/** La joueuse a-t-elle une fiche publique (classée, ou sur un roster) ? */
export async function hasPublicPlayerPage(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const [ratingRes, memberRes] = await Promise.all([
    db
      .from('player_ratings')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', k.tenantId)
      .eq('user_id', k.userId),
    db
      .from('team_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', k.tenantId)
      .eq('user_id', k.userId),
  ]);
  return (
    (!ratingRes.error && (ratingRes.count ?? 0) > 0) ||
    (!memberRes.error && (memberRes.count ?? 0) > 0)
  );
}

/* -------------------------------------------------------------------------
 * « Ne pas figurer dans le TCG » (`service/exclusion.ts`).
 * ---------------------------------------------------------------------- */

/** `excluded_at` et `photo_path` de ma carte, `null` si elle n'existe pas. */
export async function readPlayerCardConsent(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { data, error } = await db
    .from('tcg_player_cards')
    .select('excluded_at, photo_path')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .maybeSingle();
  return { card: data, error };
}

/**
 * Pose le retrait ; avec une photo, coupe AUSSI le pointeur (la purge du
 * fichier a été mise en file AVANT, par le chemin existant).
 */
export async function markExcluded(
  db: AdminDb,
  k: { tenantId: string; userId: string; nowIso: string; hadPhoto: boolean }
) {
  const { error } = await db.from('tcg_player_cards').upsert(
    {
      tenant_id: k.tenantId,
      user_id: k.userId,
      excluded_at: k.nowIso,
      ...(k.hadPhoto
        ? {
            revoked_at: k.nowIso,
            photo_path: null,
            photo_status: 'none',
            photo_reviewed_by: null,
            photo_reviewed_at: null,
            photo_rejected_reason: null,
          }
        : {}),
      updated_at: k.nowIso,
    },
    { onConflict: 'tenant_id,user_id' }
  );
  return { error };
}

/** Revenir dans le TCG (la photo purgée ne revient pas). */
export async function clearExcluded(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { error } = await db
    .from('tcg_player_cards')
    .update({ excluded_at: null, updated_at: new Date().toISOString() })
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId);
  return { error };
}

/** Le dernier cadeau d'accueil (les TROIS : édition, supportrice, staff). */
export async function readLatestWelcomeEntry(
  db: AdminDb,
  k: { tenantId: string; userId: string }
) {
  const { data, error } = await db
    .from('tcg_wallet_entries')
    .select('amount, created_at')
    .eq('tenant_id', k.tenantId)
    .eq('user_id', k.userId)
    .in('source_kind', ['welcome_gift', 'supporter_welcome', 'staff_welcome'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return { entry: data, error };
}
