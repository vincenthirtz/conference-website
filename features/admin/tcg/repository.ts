// features/admin/tcg/repository.ts — accès base du TCG côté staff, scopé par
// tenant (paramètre OBLIGATOIRE). Les lectures « métier » (catalogue,
// engagement, faces de cartes, registre) restent dans utils/tcg/*, partagés
// avec les routes joueuses : le service les appelle, il ne les recopie pas.

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Même bucket public que les logos d'équipe (photos de cartes joueuses). */
export const PHOTO_BUCKET = 'teams-images';

export function publicUrl(db: AdminDb, bucket: string, path: string) {
  return db.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? null;
}

/* --- Recherche de joueuses (cantonnée à l'espace, en base) --- */

export async function searchTenantPlayers(
  db: AdminDb,
  tenantId: string,
  query: string
) {
  const { data, error } = await db.rpc('admin_search_tcg_players', {
    p_tenant_id: tenantId,
    p_query: query,
  });
  return { rows: (data ?? []) as Array<Record<string, unknown>>, error };
}

/* --- Correction de solde (`admin_grant`) --- */

const GRANT_SOURCE_KIND = 'admin_grant';

/** L'écriture déjà portée par cette clé (`error` distinct de « rien »). */
export async function findGrantByKey(
  db: AdminDb,
  tenantId: string,
  idempotencyKey: string,
  userId?: string
) {
  let query = db
    .from('tcg_wallet_entries')
    .select('id, user_id, amount')
    .eq('tenant_id', tenantId)
    .eq('source_kind', GRANT_SOURCE_KIND)
    .eq('source_ref', idempotencyKey);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query.limit(1);
  return { row: data?.[0] ?? null, error };
}

export async function insertGrantCredit(
  db: AdminDb,
  row: {
    tenantId: string;
    userId: string;
    amount: number;
    idempotencyKey: string;
    note: string;
  }
) {
  const { data, error } = await db
    .from('tcg_wallet_entries')
    .insert({
      tenant_id: row.tenantId,
      user_id: row.userId,
      amount: row.amount,
      source_kind: GRANT_SOURCE_KIND,
      source_ref: row.idempotencyKey,
      note: row.note,
    })
    .select('id')
    .maybeSingle();
  return { id: data?.id ?? null, error };
}

export async function cachedBalance(
  db: AdminDb,
  tenantId: string,
  userId: string
) {
  const { data } = await db
    .from('tcg_wallets')
    .select('balance')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return data?.balance ?? 0;
}

/* --- File des photos --- */

export async function listPendingPhotos(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tcg_player_cards')
    .select('user_id, photo_path, photo_status, opted_in_at, updated_at')
    .eq('tenant_id', tenantId)
    .eq('photo_status', 'pending')
    .order('updated_at', { ascending: true })
    .limit(100);
  return { rows: data ?? [], error };
}

export async function readPhotoState(
  db: AdminDb,
  tenantId: string,
  userId: string
) {
  const { data, error } = await db
    .from('tcg_player_cards')
    .select('photo_path, photo_status')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .maybeSingle();
  return { row: data ?? null, error };
}

/**
 * L'écriture CONDITIONNELLE — la seule garantie : `pending` ET le chemin
 * affiché. Zéro ligne rendue = la photo a changé entre-temps.
 */
export async function writePhotoDecision(
  db: AdminDb,
  tenantId: string,
  userId: string,
  photoPath: string,
  patch: {
    photo_status: 'approved' | 'rejected';
    photo_path: string | null;
    photo_reviewed_by: string;
    photo_reviewed_at: string;
    photo_rejected_reason: string | null;
    updated_at: string;
  }
) {
  const { data, error } = await db
    .from('tcg_player_cards')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .eq('photo_status', 'pending')
    .eq('photo_path', photoPath)
    .select('user_id');
  return { rows: data, error };
}

/* --- Fan arts de la communauté (`category = 'fanart'`) --- */

export const FANART_COLUMNS =
  'id, title, artist_name, artist_url, image_path, status, rarity, review_notes, created_at, reviewed_at' as const;

export async function listFanart(
  db: AdminDb,
  tenantId: string,
  status: string
) {
  const { data, error } = await db
    .from('tcg_fanart_cards')
    .select(FANART_COLUMNS)
    .eq('tenant_id', tenantId)
    // Les cartes de l'association ont leur propre panneau.
    .eq('category', 'fanart')
    .eq('status', status)
    // La file de modération se prend par le bas ; les autres vues, récentes d'abord.
    .order('created_at', { ascending: status === 'pending' })
    .limit(100);
  return { rows: data ?? [], error };
}

/** Écriture conditionnée au statut de DÉPART (deux relectrices simultanées). */
export async function decideFanart(
  db: AdminDb,
  tenantId: string,
  id: string,
  fromStatus: string,
  patch: {
    status: string;
    review_notes: string | null;
    reviewed_by: string;
    reviewed_at: string;
    updated_at: string;
    rarity?: string;
  }
) {
  const { data, error } = await db
    .from('tcg_fanart_cards')
    .update(patch)
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .eq('category', 'fanart')
    .eq('status', fromStatus)
    .select(FANART_COLUMNS);
  return { rows: data ?? [], error };
}

/* --- Vue d'ensemble de l'économie (GET /overview) ---------------------------
 * Comptages exacts en `head: true` et lectures bornées. L'ORDRE du tuple est
 * un contrat avec le service (déstructuration positionnelle).
 * Les cartes n'ont PAS de tenant_id : on les cadre par les paquets du tenant.
 */

export const OVERVIEW_MAX_PACKS = 5000;
export const OVERVIEW_MAX_CARDS = 20000;
export const OVERVIEW_MAX_WALLETS = 2000;
export const OVERVIEW_MAX_ENTRIES = 10000;

const MAX_PACKS = OVERVIEW_MAX_PACKS;
const MAX_CARDS = OVERVIEW_MAX_CARDS;
const MAX_WALLETS = OVERVIEW_MAX_WALLETS;
const MAX_ENTRIES = OVERVIEW_MAX_ENTRIES;

export function overviewCounts(db: AdminDb, tenantId: string) {
  return Promise.allSettled([
    // `trade` exclu des deux compteurs : un paquet d'échange recueille des
    // cartes DÉJÀ distribuées (`tcg_card_trades.sql`), il ne sort d'aucune
    // victoire ni d'aucun achat. Ses cartes, elles, restent comptées une fois —
    // la ligne a changé de paquet, elle n'a pas été recopiée.
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .neq('source_kind', 'trade'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('opened_at', 'is', null)
      .neq('source_kind', 'trade'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'victory'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'purchase'),
    // Cadeau d'accueil d'une édition. COMPTÉ, pas déduit de
    // `granted - victory - purchase` : la convention `null` ≠ `0` de ce fichier
    // interdit l'arithmétique entre compteurs, puisqu'une clé en échec vaut
    // `null` et qu'une soustraction produirait un nombre inventé. C'est la même
    // raison qui fait compter `pending` au lieu de le déduire.
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'welcome'),
    // Les trois origines sans match (migration
    // `tcg_earn_sources_drop_streak_placement.sql`), comptées une à une pour la
    // même raison : aucune arithmétique entre compteurs. Écrites en toutes
    // lettres, pas en `.map` étalé : `Promise.allSettled` perdrait le typage
    // positionnel du tuple déstructuré plus haut.
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'drop'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'placement'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('source_kind', 'streak'),
    // Les mêmes origines, mais NON OUVERTES. Six requêtes de plus plutôt qu'un
    // `group by` : ce fichier compte chaque chiffre séparément, exprès — sa
    // convention `null` ≠ `0` veut qu'une lecture en échec se voie, et un
    // agrégat unique ferait tomber les six d'un coup.
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null)
      .eq('source_kind', 'victory'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null)
      .eq('source_kind', 'purchase'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null)
      .eq('source_kind', 'welcome'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null)
      .eq('source_kind', 'drop'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null)
      .eq('source_kind', 'placement'),
    db
      .from('tcg_packs')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('opened_at', null)
      .eq('source_kind', 'streak'),

    // La file de relecture : le même filtre que `photos.ts`, pour que le
    // compteur du tableau de bord et la file affichée ne se contredisent pas.
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('photo_status', 'pending'),
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('photo_status', 'approved'),
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('photo_status', 'rejected'),
    // Accord DONNÉ et TOUJOURS VALIDE : les deux conditions sont
    // indépendantes, et une seule des deux compterait des retraits comme des
    // accords en cours.
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('opted_in_at', 'is', null)
      .is('revoked_at', null),
    db
      .from('tcg_player_cards')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('revoked_at', 'is', null),

    // Porte-monnaie non vides : un solde à zéro est un compte, pas un
    // détenteur de pièces.
    db
      .from('tcg_wallets')
      .select('user_id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .gt('balance', 0),
  ]);
}

export function overviewSums(db: AdminDb, tenantId: string) {
  return Promise.allSettled([
    // Les identifiants des paquets OUVERTS du tenant : indispensables pour
    // cadrer les cartes (cf. l'en-tête — `tcg_pack_cards` ignore le tenant).
    // Un paquet scellé ne contient encore rien, ses cartes n'existent qu'à
    // l'ouverture.
    db
      .from('tcg_packs')
      .select('id')
      .eq('tenant_id', tenantId)
      .not('opened_at', 'is', null)
      .limit(MAX_PACKS),
    db
      .from('tcg_wallets')
      .select('balance')
      .eq('tenant_id', tenantId)
      .limit(MAX_WALLETS),
    db
      // `source_kind` en plus de `amount` : la ventilation des crédits se fait
      // dans la boucle qui suit, sans requête supplémentaire.
      .from('tcg_wallet_entries')
      .select('amount, source_kind')
      .eq('tenant_id', tenantId)
      .limit(MAX_ENTRIES),
  ]);
}

export async function overviewCards(db: AdminDb, packIds: string[]) {
  const { data, error } = await db
    .from('tcg_pack_cards')
    .select(
      'pack_id, subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug, rarity, is_foil, recycled_at'
    )
    .in('pack_id', packIds)
    .limit(MAX_CARDS);
  return { rows: data ?? [], error };
}
