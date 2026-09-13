// utils/tcg/overlayFeed.ts
//
// Ce qu'une source navigateur OBS a le droit de montrer du TCG.
//
// CE MODULE EST LA FRONTIÈRE DE CONFIDENTIALITÉ, et c'est sa seule raison
// d'être. L'overlay est servi sur une URL PUBLIQUE — une source navigateur ne
// peut pas se connecter, donc quiconque a le lien voit ce qui s'affiche. Tout
// ce qui sort d'ici se retrouve potentiellement à l'écran d'un direct, puis
// dans un VOD, puis dans un clip.
//
// D'où UNE SEULE identité autorisée : le PSEUDO TWITCH. Il est déjà public par
// nature — il s'affiche dans le chat de la chaîne, la personne l'a choisi pour
// y apparaître. Le nom du compte du site, lui, ne sort JAMAIS d'ici : une
// joueuse a pu le choisir pour un espace connecté sans vouloir le voir passer
// en surimpression d'un stream. Le lecteur de faces
// (`utils/tcg/readCardFaces.ts`) n'est délibérément pas appelé : il sait servir
// des photos, et une photo n'a rien à faire sur un overlay public.
//
// SANS PSEUDO TWITCH, PAS DE NOM. Une victoire de match peut revenir à
// quelqu'un qui n'a jamais rattaché son compte Twitch : `twitchLogin` vaut
// alors `null` et l'interface affiche un libellé neutre. Inventer un nom, ou se
// rabattre sur le nom du site, trahirait la règle ci-dessus.
//
// FENÊTRE COURTE, PAS D'HISTORIQUE. L'overlay annonce ce qui vient de se
// passer ; il n'est pas un journal. Une fenêtre bornée évite qu'un rechargement
// d'OBS en plein direct rejoue une heure d'événements d'un coup, et limite ce
// qu'une URL fuitée révèle.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { readTwitchLoginsByUserIds } from '@/utils/auth/twitchLinks';

/** Origines annoncées par l'overlay. Les autres ne sont pas des événements de direct. */
const SHOWN_SOURCE_KINDS = ['twitch_drop', 'match_win', 'scrim_win'] as const;

export type OverlayFeedKind = (typeof SHOWN_SOURCE_KINDS)[number];

export type OverlayFeedItem = {
  /** Identifiant de l'écriture : l'overlay s'en sert pour n'annoncer qu'une fois. */
  id: string;
  kind: OverlayFeedKind;
  /** Pseudo Twitch, ou `null` si la personne n'a pas rattaché son compte. */
  twitchLogin: string | null;
  /** Horodatage ISO de l'événement. */
  at: string;
};

/** Au-delà, on ne remonte pas : l'overlay annonce le direct, pas l'histoire. */
export const OVERLAY_WINDOW_MS = 15 * 60 * 1000;

/** Bornage dur du nombre d'éléments rendus. */
export const OVERLAY_MAX_ITEMS = 20;

/**
 * Les événements TCG récents d'un tenant, prêts à l'affichage public.
 *
 * Ne lève jamais : un overlay tourne pendant un direct, et une liste vide vaut
 * infiniment mieux qu'une source navigateur en erreur au milieu du stream.
 */
export async function readTcgOverlayFeed(
  tenantId: string,
  opts: { now?: number; windowMs?: number; limit?: number } = {}
): Promise<OverlayFeedItem[]> {
  if (!supabaseAdmin || !tenantId) return [];

  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? OVERLAY_WINDOW_MS;
  const limit = Math.min(opts.limit ?? OVERLAY_MAX_ITEMS, OVERLAY_MAX_ITEMS);
  const since = new Date(now - windowMs).toISOString();

  const { data, error } = await supabaseAdmin
    .from('tcg_wallet_entries')
    .select('id, user_id, source_kind, created_at')
    .eq('tenant_id', tenantId)
    .in('source_kind', [...SHOWN_SOURCE_KINDS])
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    logger.warn('[tcg/overlay] flux illisible: %s', error.message);
    return [];
  }

  const rows = (data ?? []) as Array<{
    id: string;
    user_id: string;
    source_kind: OverlayFeedKind;
    created_at: string;
  }>;
  if (rows.length === 0) return [];

  // UNE seule requête d'identité, et elle ne peut rendre que des pseudos
  // Twitch : c'est ce qui rend la règle de confidentialité vérifiable d'un
  // coup d'œil plutôt que dispersée dans des conditions.
  const logins = await readTwitchLoginsByUserIds(rows.map((r) => r.user_id));

  return rows.map((row) => ({
    id: row.id,
    kind: row.source_kind,
    twitchLogin: logins.get(row.user_id) ?? null,
    at: row.created_at,
  }));
}
