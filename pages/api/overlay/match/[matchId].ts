// pages/api/overlay/match/[matchId].ts
//
// GET (PUBLIC) — l'état d'un match, tel qu'une source navigateur OBS l'affiche.
//
// C'est le pendant « par match » de /api/overlay/[runId] (qui, lui, suit un
// conducteur de direct). Ici, pas de régie : une URL, un match, un écran qui se
// met à jour. C'est ce que l'offre Régie ouvre — cf. la capacité de plan
// `matchOverlays`, distincte de `broadcastStudio` qui dirige le direct.
//
// DEUX FORMES D'URL :
//   /api/overlay/match/<uuid>                    → ce match, pour toujours
//   /api/overlay/match/next?tournament=<id|slug> → « le match du moment »,
//                                                  résolu à chaque appel
// La seconde existe pour qu'une régie colle UNE URL dans OBS le matin et n'y
// retouche plus de la journée. C'est le cas d'usage réel : entre deux matchs,
// personne n'a envie d'aller chercher un identifiant.
//
// PUBLIC, mais pas ouvert à tout : le tournoi doit être `visibility='public'`
// (on ne diffuse pas un tournoi privé à qui devine une URL) et l'espace
// propriétaire doit avoir la capacité `matchOverlays` (402 sinon).
//
// CONTRAT DE ROBUSTESSE, parce que ça tourne en direct :
//   - identifiant mal formé          → 400 (erreur de configuration, à voir
//                                      tout de suite quand on colle l'URL)
//   - match ou tournoi introuvable   → 404
//   - palier insuffisant             → 402, avec le nom du palier
//   - `next` sans match à montrer    → 200, `match: null` (écran d'attente)
// Jamais de 500 silencieux : une source OBS qui reçoit une erreur affiche une
// page blanche en plein direct.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import { resolveEmbedTenantId } from '@/utils/embed';
import { readTenantBranding } from '@/utils/tenant';
import { capabilityDenial } from '@/utils/billing/tenantCapabilityGate';
import {
  buildOverlayMatch,
  pickOverlayMatch,
  type GameRowForOverlay,
  type MatchRowForOverlay,
  type OverlayMatchView,
  type TeamRowForOverlay,
  type VetoRowForOverlay,
} from '@/utils/overlay/matchOverlay';

/** Colonnes du match : strictement ce que l'écran affiche. Pas de notes, pas
 *  de codes de lobby, pas de jetons de check-in. */
const MATCH_COLUMNS = `
  id,
  tenant_id,
  tournament_id,
  status,
  started_at,
  scheduled_at,
  completed_at,
  match_format,
  round_name,
  team1_id,
  team2_id,
  team1_score,
  team2_score,
  winner_team_id,
  is_bye,
  deleted_at
`;

type MatchRow = MatchRowForOverlay & {
  tenant_id: string | null;
  tournament_id: string | null;
  is_bye: boolean | null;
  deleted_at: string | null;
};

type TournamentRow = {
  id: string;
  slug: string | null;
  name: string | null;
  short_name: string | null;
  game: string | null;
  visibility: string | null;
};

export type OverlayMatchResponse = {
  match: OverlayMatchView | null;
  tournament: {
    id: string;
    slug: string | null;
    name: string | null;
    shortName: string | null;
    game: string | null;
  } | null;
  branding: {
    name: string | null;
    logoUrl: string | null;
    accent: string | null;
  } | null;
  /**
   * Heure du serveur au moment de la réponse.
   *
   * Le compte à rebours s'en sert au lieu de l'horloge du PC de régie : une
   * machine mal réglée afficherait « dans 3 minutes » quand il en reste dix,
   * et personne ne pense à vérifier l'heure d'un poste de stream.
   */
  serverTime: string;
};

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Une régie ouvre facilement cinq sources qui interrogent toutes les 5 s :
  // la limite doit tenir un vrai plateau, pas juste un onglet.
  if (
    applyRateLimit(req, res, { max: 300, windowMs: 60_000 }, 'overlay-match')
  ) {
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const rawId = firstParam(req.query.matchId as string | string[] | undefined);
  const matchId = (rawId ?? '').trim();
  const wantsNext = matchId.toLowerCase() === 'next';

  if (!matchId || (!wantsNext && !isValidUUID(matchId))) {
    return res.status(400).json({ error: 'Identifiant de match invalide.' });
  }

  try {
    const resolved = wantsNext
      ? await resolveNextMatch(req)
      : await resolveMatchById(matchId);

    if ('error' in resolved) {
      return res.status(resolved.status).json(resolved.error);
    }

    const { match, tournament, tenantId } = resolved;

    const denial = await capabilityDenial(
      tenantId,
      'matchOverlays',
      'Les sources de stream par match font partie de l’offre Régie.'
    );
    if (denial) return res.status(402).json(denial);

    const branding = await readTenantBranding(tenantId);

    // Aucun match à montrer : c'est un état normal (avant la première rencontre
    // du jour), pas une erreur. L'écran d'attente s'en charge.
    if (!match) {
      return respond(res, {
        match: null,
        tournament: tournamentView(tournament),
        branding: brandingView(branding),
        serverTime: new Date().toISOString(),
      });
    }

    const [teams, games, vetos] = await Promise.all([
      loadTeams(match),
      loadGames(match.id),
      loadVetos(match.id),
    ]);

    return respond(res, {
      match: buildOverlayMatch({
        match,
        team1: teams.get(match.team1_id ?? '') ?? null,
        team2: teams.get(match.team2_id ?? '') ?? null,
        games,
        vetos,
      }),
      tournament: tournamentView(tournament),
      branding: brandingView(branding),
      serverTime: new Date().toISOString(),
    });
  } catch (err) {
    logger.error('[overlay/match] unexpected error', err);
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
}

function respond(res: NextApiResponse, payload: OverlayMatchResponse) {
  // 5 s de cache CDN : une source OBS interroge en boucle pendant des heures,
  // et deux sources ouvertes sur le même match ne doivent pas compter double.
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=5, stale-while-revalidate=30'
  );
  return res.status(200).json(payload);
}

type Resolved =
  | { match: MatchRow | null; tournament: TournamentRow; tenantId: string }
  | { status: number; error: { error: string } };

/** Un match nommé par son identifiant. */
async function resolveMatchById(matchId: string): Promise<Resolved> {
  const { data, error } = await supabaseAdmin!
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('id', matchId)
    .maybeSingle();

  if (error) {
    logger.error('[overlay/match] match load error', error);
    return { status: 404, error: { error: 'Match introuvable.' } };
  }

  const match = data as MatchRow | null;
  if (!match || match.deleted_at || match.is_bye || !match.tournament_id) {
    return { status: 404, error: { error: 'Match introuvable.' } };
  }

  const tournament = await loadTournamentById(match.tournament_id);
  if (!tournament) {
    return { status: 404, error: { error: 'Match introuvable.' } };
  }

  return {
    match,
    tournament,
    tenantId: match.tenant_id ?? '',
  };
}

/** « Le match du moment » d'un tournoi (cf. pickOverlayMatch). */
async function resolveNextMatch(req: NextApiRequest): Promise<Resolved> {
  const tournamentRef = firstParam(
    req.query.tournament as string | string[] | undefined
  );
  if (!tournamentRef) {
    return {
      status: 400,
      error: {
        error:
          'Paramètre `tournament` requis pour /next (identifiant ou slug du tournoi).',
      },
    };
  }

  const tenantId = await resolveEmbedTenantId(req.query);
  const tournament = await findTournamentByIdOrSlug<TournamentRow>(
    tournamentRef,
    'id, slug, name, short_name, game, visibility',
    tenantId
  );
  if (!tournament || tournament.visibility !== 'public') {
    return { status: 404, error: { error: 'Tournoi introuvable.' } };
  }

  // Les matchs candidats : ceux du tournoi, vivants, avec deux équipes. La
  // borne à 500 évite qu'un très gros bracket rapatrie tout ; l'ordre par
  // heure prévue met les rencontres utiles en tête.
  const { data, error } = await supabaseAdmin!
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('tournament_id', tournament.id)
    .is('deleted_at', null)
    .eq('is_bye', false)
    .not('team1_id', 'is', null)
    .not('team2_id', 'is', null)
    .order('scheduled_at', { ascending: true, nullsFirst: false })
    .limit(500);

  if (error) {
    logger.error('[overlay/match] next candidates error', error);
    return { match: null, tournament, tenantId };
  }

  const rows = (data ?? []) as MatchRow[];
  return {
    match: pickOverlayMatch(rows, Date.now()),
    tournament,
    tenantId,
  };
}

async function loadTournamentById(id: string): Promise<TournamentRow | null> {
  const { data, error } = await supabaseAdmin!
    .from('tournaments')
    .select('id, slug, name, short_name, game, visibility')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    logger.error('[overlay/match] tournament load error', error);
    return null;
  }
  const row = data as TournamentRow | null;
  // Un tournoi privé ne se diffuse pas : même règle que les pages publiques et
  // les embeds. Sans ça, une URL devinée exposerait un bracket confidentiel.
  if (!row || row.visibility !== 'public') return null;
  return row;
}

async function loadTeams(
  match: MatchRow
): Promise<Map<string, TeamRowForOverlay>> {
  const ids = [match.team1_id, match.team2_id].filter(
    (v): v is string => typeof v === 'string' && v.length > 0
  );
  const map = new Map<string, TeamRowForOverlay>();
  if (ids.length === 0) return map;

  const { data, error } = await supabaseAdmin!
    .from('teams')
    .select('id, name, short_name, logo_url')
    .in('id', ids);
  if (error) {
    logger.error('[overlay/match] teams load error', error);
    return map;
  }
  for (const row of (data ?? []) as TeamRowForOverlay[]) {
    map.set(row.id, row);
  }
  return map;
}

async function loadGames(matchId: string): Promise<GameRowForOverlay[]> {
  const { data, error } = await supabaseAdmin!
    .from('games')
    .select('map_name, map_order, team1_score, team2_score, winner_team_id')
    .eq('match_id', matchId)
    .order('map_order', { ascending: true });
  if (error) {
    logger.error('[overlay/match] games load error', error);
    return [];
  }
  return (data ?? []) as GameRowForOverlay[];
}

async function loadVetos(matchId: string): Promise<VetoRowForOverlay[]> {
  const { data, error } = await supabaseAdmin!
    .from('match_map_vetos')
    .select('step_number, action, map_name, team_id')
    .eq('match_id', matchId)
    .order('step_number', { ascending: true });
  if (error) {
    logger.error('[overlay/match] vetos load error', error);
    return [];
  }
  return (data ?? []) as VetoRowForOverlay[];
}

function tournamentView(
  row: TournamentRow
): OverlayMatchResponse['tournament'] {
  return {
    id: row.id,
    slug: row.slug ?? null,
    name: row.name ?? null,
    shortName: row.short_name ?? null,
    game: row.game ?? null,
  };
}

function brandingView(
  branding: Awaited<ReturnType<typeof readTenantBranding>>
): OverlayMatchResponse['branding'] {
  if (!branding) return null;
  return {
    name: branding.name ?? null,
    logoUrl: branding.logoUrl ?? null,
    accent: branding.accentColor ?? branding.primaryColor ?? null,
  };
}
