// utils/tournament/readPublicTournament.ts
//
// LECTURE D'EN-TÊTE des pages /tournament/[id]/* : la ligne du tournoi (UUID
// ou slug, même règle que `findTournamentByIdOrSlug`) ET sa playlist
// « Reviews », en UNE requête.
//
// POURQUOI. Chaque onglet relisait `tournaments.reviews_playlist_id` à part
// (`hasReviewsPlaylist`) juste après avoir lu la ligne du même tournoi : une
// requête de plus par régénération, sur chacune des onze pages (~130/jour
// mesurées en prod le 2026-10-15).
//
// TOLÉRANCE CONSERVÉE. Sur une base où la colonne n'existe pas (environnement
// non migré), la lecture élargie échoue (42703) : on relit sans elle et
// l'onglet Reviews reste masqué — exactement ce que faisait
// `hasReviewsPlaylist`. Le coût de la seconde lecture ne se paie que là.

import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { isMissingColumnError } from '@/utils/tournaments/reviewsPlaylist';
import { isValidPlaylistId } from '@/utils/youtube/playlist';

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const REVIEWS_COLUMN = 'reviews_playlist_id';

type Row = Record<string, unknown>;

export type PublicTournamentRead<T> = {
  tournament: T;
  /** Playlist validée (elle finit dans une URL), ou `null`. */
  reviewsPlaylistId: string | null;
};

/** UUID d'abord, slug ensuite. Rend l'erreur pour que l'appelant la juge. */
async function lookup(
  idOrSlug: string,
  columns: string,
  tenantId: string
): Promise<{ row: Row | null; error: unknown }> {
  if (UUID_RE.test(idOrSlug)) {
    const { data, error } = await supabaseAdmin
      .from('tournaments')
      .select(columns)
      .eq('id', idOrSlug)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (error) return { row: null, error };
    if (data) return { row: data as unknown as Row, error: null };
  }
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select(columns)
    .eq('slug', idOrSlug)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: (data as unknown as Row | null) ?? null, error: error ?? null };
}

/**
 * Le tournoi et sa playlist Reviews. `null` : introuvable (ou illisible). La
 * garde de visibilité reste à la page, comme avant.
 *
 * `columns` = la projection de la page, SANS la colonne Reviews : elle est
 * ajoutée ici puis retirée de la ligne rendue, pour que les props de la page
 * ne changent pas. `'*'` la contient déjà ; la ligne est alors rendue telle
 * quelle.
 */
export async function readPublicTournament<T>(
  idOrSlug: string,
  columns: string,
  tenantId: string = DEFAULT_TENANT_ID
): Promise<PublicTournamentRead<T> | null> {
  if (!supabaseAdmin || !idOrSlug) return null;

  const star = columns.trim() === '*';
  const wide = star ? columns : `${columns}, ${REVIEWS_COLUMN}`;
  const first = await lookup(idOrSlug, wide, tenantId);

  if (first.error && !star && isMissingColumnError(first.error)) {
    const plain = await lookup(idOrSlug, columns, tenantId);
    return plain.row
      ? { tournament: plain.row as T, reviewsPlaylistId: null }
      : null;
  }
  if (!first.row) return null;

  const raw = first.row[REVIEWS_COLUMN];
  const reviewsPlaylistId = isValidPlaylistId(raw) ? raw : null;
  if (star) return { tournament: first.row as T, reviewsPlaylistId };

  const rest = Object.fromEntries(
    Object.entries(first.row).filter(([key]) => key !== REVIEWS_COLUMN)
  );
  return { tournament: rest as T, reviewsPlaylistId };
}
