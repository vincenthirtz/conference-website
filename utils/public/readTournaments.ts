// utils/public/readTournaments.ts
//
// Lectures partagées pour l'API publique versionnée `/api/public/v1/tournaments*`.
//
// Toutes les fonctions PROJETTENT explicitement des colonnes déjà publiques
// (id, name, slug, game, status, dates, format) et scopent par tenant. Les
// jointures d'équipes / stages sont batchées via `.in(...)` (pas de N+1, pas
// de PostgREST embed — reste testable avec le mock in-memory).

import { supabaseAdmin } from '@/utils/supabase';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { logger } from '@/utils/logger';

/** Statuts publiquement visibles (jamais draft / archived). */
export const PUBLIC_TOURNAMENT_STATUSES = [
  'published',
  'running',
  'completed',
] as const;

export type PublicTournamentSummary = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  format: string | null;
};

export type PublicStageSummary = {
  id: string;
  name: string | null;
  stage_type: string | null;
  status: string;
};

export type PublicTournamentDetail = PublicTournamentSummary & {
  stages: PublicStageSummary[];
};

const TOURNAMENT_COLUMNS =
  'id, name, slug, game, status, start_date, end_date, format';

type TournamentRow = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  format: string | null;
};

function shapeSummary(r: TournamentRow): PublicTournamentSummary {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug ?? null,
    game: r.game ?? null,
    status: r.status,
    start_date: r.start_date ?? null,
    end_date: r.end_date ?? null,
    format: r.format ?? null,
  };
}

/**
 * Liste paginée des tournois publics d'un tenant, filtrable par status / game.
 * Renvoie `{ items, count }` où `count` est le total (avant pagination).
 */
export async function readPublicTournaments(
  tenantId: string,
  opts: {
    status?: string | null;
    game?: string | null;
    limit: number;
    offset: number;
  }
): Promise<{ items: PublicTournamentSummary[]; count: number }> {
  let query = supabaseAdmin
    .from('tournaments')
    .select(TOURNAMENT_COLUMNS, { count: 'exact' })
    .eq('tenant_id', tenantId);

  // Filtre status : soit un statut public précis, soit l'ensemble public.
  if (
    opts.status &&
    (PUBLIC_TOURNAMENT_STATUSES as readonly string[]).includes(opts.status)
  ) {
    query = query.eq('status', opts.status);
  } else {
    query = query.in(
      'status',
      PUBLIC_TOURNAMENT_STATUSES as unknown as string[]
    );
  }

  if (opts.game) {
    query = query.eq('game', opts.game);
  }

  query = query
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(opts.offset, opts.offset + opts.limit - 1);

  const { data, error, count } = await query;
  if (error) {
    logger.error('[readPublicTournaments] list error', error);
    throw new Error('Failed to load tournaments');
  }

  const items = ((data ?? []) as TournamentRow[]).map(shapeSummary);
  return { items, count: typeof count === 'number' ? count : items.length };
}

/**
 * Détail d'un tournoi public (accepte id OU slug) + résumé des stages.
 * `null` si inconnu / non-public (draft / archived).
 */
export async function readPublicTournamentDetail(
  idOrSlug: string,
  tenantId: string
): Promise<PublicTournamentDetail | null> {
  const row = await findTournamentByIdOrSlug<
    TournamentRow & { status: string }
  >(idOrSlug, TOURNAMENT_COLUMNS, tenantId);
  if (!row) return null;
  if (!(PUBLIC_TOURNAMENT_STATUSES as readonly string[]).includes(row.status)) {
    return null;
  }

  const { data: stageRows, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, name, stage_type, is_active, order_index')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', row.id);

  if (stageErr) {
    logger.error('[readPublicTournamentDetail] stages error', stageErr);
    throw new Error('Failed to load tournament stages');
  }

  const stages: PublicStageSummary[] = (
    (stageRows ?? []) as Array<{
      id: string;
      name: string | null;
      stage_type: string | null;
      is_active: boolean | null;
      order_index: number | null;
    }>
  )
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((s) => ({
      id: s.id,
      name: s.name ?? null,
      stage_type: s.stage_type ?? null,
      // `tournament_stages` n'a pas de colonne `status` — on dérive un statut
      // public simple depuis `is_active`.
      status: s.is_active ? 'active' : 'inactive',
    }));

  return { ...shapeSummary(row), stages };
}
