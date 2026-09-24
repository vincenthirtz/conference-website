// pages/api/overlay/day.ts
//
// GET (PUBLIC) — les matchs d'une journée d'un tournoi, tels qu'une source
// navigateur OBS les affiche (`/overlay/day`).
//
// Le pendant « programme » de /api/overlay/match/[matchId] : une URL collée
// le matin dans OBS, qui montre la journée entière — horaires, affiches,
// scores au fil de l'eau — et met en avant le match du moment.
//
// URL :
//   /api/overlay/day?tournament=<id|slug>[&date=YYYY-MM-DD][&tenant=<slug>]
// Sans `date`, c'est le jour FORCÉ par l'admin s'il y en a un encore valide
// (onglet Outils, cf. utils/overlay/dayOverride.ts), sinon aujourd'hui à Paris
// (cf. utils/overlay/dayOverlay.ts). Une `date` explicite prime toujours.
//
// MÊMES RESTRICTIONS que les sources par match, pour la même raison : le
// tournoi doit être `visibility='public'`, et l'espace doit porter la capacité
// `matchOverlays` (402 sinon). Une journée sans match répond 200 avec une
// liste vide : c'est un écran, pas une erreur.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { resolveEmbedTenantId } from '@/utils/embed';
import { readTenantBranding } from '@/utils/tenant';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import type {
  MatchRowForOverlay,
  TeamRowForOverlay,
} from '@/utils/overlay/matchOverlay';
import {
  buildDayOverlay,
  resolveDayBounds,
  selectDayMatches,
  type OverlayDayMatchView,
} from '@/utils/overlay/dayOverlay';
import { activeDayOverride } from '@/utils/overlay/dayOverride';

/** Strictement ce que l'écran affiche : ni notes, ni lobby, ni jetons. */
const MATCH_COLUMNS =
  'id, status, started_at, scheduled_at, completed_at, match_format, round_name, team1_id, team2_id, team1_score, team2_score, winner_team_id';

type TournamentRow = {
  id: string;
  tenant_id: string | null;
  slug: string | null;
  name: string | null;
  short_name: string | null;
  game: string | null;
  visibility: string | null;
  overlay_day_date: string | null;
  overlay_day_set_at: string | null;
};

export type OverlayDayResponse = {
  /** Jour affiché, `YYYY-MM-DD` à Paris. */
  date: string;
  matches: OverlayDayMatchView[];
  /** Le match mis en avant (en cours, sinon prochain, sinon dernier résultat). */
  currentMatchId: string | null;
  tournament: {
    id: string;
    slug: string | null;
    name: string | null;
    shortName: string | null;
    game: string | null;
  };
  branding: {
    name: string | null;
    logoUrl: string | null;
    accent: string | null;
  } | null;
  serverTime: string;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'overlay-day')) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const tournamentRef = (
    firstParam(req.query.tournament as string | string[] | undefined) ?? ''
  ).trim();
  if (!tournamentRef) {
    return res.status(400).json({
      error: 'Paramètre `tournament` requis (identifiant ou slug du tournoi).',
    });
  }

  const nowMs = Date.now();
  const explicitDate = firstParam(
    req.query.date as string | string[] | undefined
  );
  let bounds = resolveDayBounds(explicitDate, nowMs);
  if (!bounds) {
    return res
      .status(400)
      .json({ error: 'Paramètre `date` invalide (format AAAA-MM-JJ).' });
  }

  try {
    const tenantId = await resolveEmbedTenantId(req.query);
    const tournament = await findTournamentByIdOrSlug<TournamentRow>(
      tournamentRef,
      'id, tenant_id, slug, name, short_name, game, visibility, overlay_day_date, overlay_day_set_at',
      tenantId
    );
    // Un tournoi privé ne se diffuse pas, même à qui devine son slug.
    if (!tournament || tournament.visibility !== 'public') {
      return res.status(404).json({ error: 'Tournoi introuvable.' });
    }

    const ownerTenantId = tournament.tenant_id ?? tenantId;
    const denial = await capabilityDenial(
      ownerTenantId,
      'matchOverlays',
      'Les sources de stream font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    // Jour forcé depuis l'onglet Outils : la source déjà collée dans OBS le
    // suit, sans changer d'URL. Une `date` explicite prime.
    if (!explicitDate) {
      const forced = activeDayOverride(tournament, nowMs);
      if (forced) bounds = resolveDayBounds(forced, nowMs) ?? bounds;
    }

    // Filtré par jour ICI plutôt qu'en SQL : la journée se calcule à Paris et
    // un match sans horaire se range sur son coup d'envoi réel — deux règles
    // qui vivent dans le module pur, testées sans base. La borne à 500 est
    // celle des sources par match.
    const [{ data, error }, branding] = await Promise.all([
      supabaseAdmin
        .from('matches')
        .select(MATCH_COLUMNS)
        .eq('tournament_id', tournament.id)
        .is('deleted_at', null)
        .eq('is_bye', false)
        .order('scheduled_at', { ascending: true, nullsFirst: false })
        .limit(500),
      readTenantBranding(ownerTenantId),
    ]);
    if (error) {
      logger.error('[overlay/day] matches load error', error);
      return res.status(500).json({ error: 'Lecture impossible.' });
    }

    // Les équipes des seuls matchs du jour : un gros bracket en compte des
    // dizaines qui n'ont rien à faire à l'écran.
    const rows = selectDayMatches((data ?? []) as MatchRowForOverlay[], bounds);
    const teams = await loadTeams(rows);
    const { matches, currentMatchId } = buildDayOverlay({
      rows,
      teams,
      bounds,
      nowMs,
    });

    const payload: OverlayDayResponse = {
      date: bounds.date,
      matches,
      currentMatchId,
      tournament: {
        id: tournament.id,
        slug: tournament.slug ?? null,
        name: tournament.name ?? null,
        shortName: tournament.short_name ?? null,
        game: tournament.game ?? null,
      },
      branding: branding
        ? {
            name: branding.name ?? null,
            logoUrl: branding.logoUrl ?? null,
            accent: branding.accentColor ?? branding.primaryColor ?? null,
          }
        : null,
      serverTime: new Date(nowMs).toISOString(),
    };

    // Un programme bouge moins qu'un tableau de score : 15 s de cache CDN
    // suffisent, et plusieurs régies sur le même tournoi partagent la réponse.
    res.setHeader(
      'Cache-Control',
      'public, s-maxage=15, stale-while-revalidate=60'
    );
    return res.status(200).json(payload);
  } catch (err) {
    logger.error('[overlay/day] unexpected error', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}

async function loadTeams(
  rows: MatchRowForOverlay[]
): Promise<Map<string, TeamRowForOverlay>> {
  const ids = [
    ...new Set(
      rows
        .flatMap((r) => [r.team1_id, r.team2_id])
        .filter((v): v is string => typeof v === 'string' && v.length > 0)
    ),
  ];
  const map = new Map<string, TeamRowForOverlay>();
  if (ids.length === 0) return map;

  const { data, error } = await supabaseAdmin!
    .from('teams')
    .select('id, name, short_name, logo_url')
    .in('id', ids);
  if (error) {
    // Sans équipes, la liste reste lisible (« À déterminer ») : mieux qu'un
    // écran d'erreur en plein direct.
    logger.error('[overlay/day] teams load error', error);
    return map;
  }
  for (const row of (data ?? []) as TeamRowForOverlay[]) map.set(row.id, row);
  return map;
}
