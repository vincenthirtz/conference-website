// pages/api/player/discovery/head-to-head.ts
//
// GET /api/player/discovery/head-to-head?opponentId=<uuid>
//
// Head-to-head CROSS-TENANT du réseau de découverte joueur. Contrairement au
// H2H per-tenant embarqué dans le profil public (utils/rating/readPlayerProfile.ts,
// scopé à UN tenant_id), cette route agrège les confrontations entre DEUX
// joueurs sur TOUS les tenants où ils se sont rencontrés.
//
// DERRIÈRE LE LOGIN (withAuthRoute → 401 sans Bearer valide). Aucune variante
// publique / indexable : le réseau de découverte est opt-in et invisible par
// défaut (arbitrage produit verrouillé le 2026-07-13). La table
// player_discovery_profiles est RLS service-role only → tout passe par
// supabaseAdmin, filtré manuellement sur discoverable=true.
//
// Forme de requête : { opponentId } — l'APPELANT est un côté (side "a" = self,
// = ctx.user.id), l'opponent est l'autre (side "b"). Ce choix colle au contexte
// « je regarde mon H2H contre ce joueur du réseau » ; il n'existe pas de route
// H2H pairwise pré-existante à mirrorer (le H2H per-tenant est keyé sur un seul
// userId de profil). On NE prend PAS { a, b } arbitraires : la seule paire
// autorisée implique toujours l'appelant, ce qui simplifie le gate de privacy.
//
// Gate de privacy :
//   - L'opponent (side b) DOIT être discoverable=true, sinon 404 NOT_DISCOVERABLE.
//   - Self (side a) est EXEMPT : un joueur peut toujours consulter son propre
//     H2H contre un opponent découvrable, même s'il n'est pas lui-même
//     découvrable (il consulte ses propres données, pas de fuite tierce).
//
// LIMITATION (modèle de résultat) : les matches sont ÉQUIPE-vs-ÉQUIPE. Le modèle
// n'a AUCUN résultat individuel joueur-vs-joueur. Deux joueurs « se sont
// affrontés » lorsqu'ils apparaissent dans le même match_id sur des team_id
// DIFFÉRENTS (participations non-remplaçant). Le résultat de la confrontation
// est celui des ÉQUIPES : matches.winner_team_id === team(a) → victoire de a ;
// === team(b) → victoire de b ; winner_team_id null → nul. C'est donc une
// approximation « chacun était dans l'équipe adverse de l'autre », identique à
// la sémantique du H2H per-tenant de readPlayerProfile. Aucun résultat de map
// individuelle n'est disponible pour affiner.

import type { NextApiRequest, NextApiResponse } from 'next';
import type { User } from '@supabase/supabase-js';
import { z } from 'zod';

import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { logger } from '@/utils/logger';

const RECENT_LIMIT = 10;

/** Résultat d'une confrontation, du point de vue side a. */
type Outcome = 'a' | 'b' | 'draw';

type RecentEncounter = {
  matchId: string;
  tenantId: string | null;
  tournamentId: string | null;
  date: string | null;
  winner: Outcome;
};

type HeadToHeadResponse = {
  a: { userId: string };
  b: { userId: string };
  totals: {
    played: number;
    aWins: number;
    bWins: number;
    draws: number;
  };
  recent: RecentEncounter[];
};

type ParticipantRow = {
  match_id: string;
  team_id: string;
  user_id: string;
  is_substitute: boolean | null;
};

type MatchRow = {
  id: string;
  tenant_id: string | null;
  tournament_id: string | null;
  winner_team_id: string | null;
  completed_at: string | null;
};

const querySchema = z.object({
  opponentId: z.string().uuid(),
});

/**
 * Réduit les participations d'UN joueur (toutes tenants) en une map
 * match_id → team_id, en ne gardant que les non-remplaçants et la PREMIÈRE
 * équipe rencontrée par match (défensif : un joueur ne devrait pas avoir 2
 * team_id sur le même match).
 */
function teamByMatch(rows: ParticipantRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    if (r.is_substitute) continue;
    if (!m.has(r.match_id)) m.set(r.match_id, r.team_id);
  }
  return m;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: { user: User }
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'player-discovery-h2h'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const parsed = querySchema.safeParse(req.query ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Validation échouée.',
      code: 'INVALID_QUERY',
      fields: parsed.error.flatten().fieldErrors,
    });
  }

  const selfId = ctx.user.id;
  const opponentId = parsed.data.opponentId;

  if (opponentId === selfId) {
    return res.status(400).json({
      error: 'Un joueur ne peut pas être son propre adversaire.',
      code: 'SELF_OPPONENT',
    });
  }

  try {
    // 1) Gate de privacy : l'opponent (side b) DOIT être discoverable.
    //    Self (side a) est exempt — il consulte ses propres données.
    //    « Absent = non découvrable » (cf. player/discovery/index.ts).
    const { data: oppProfile, error: oppErr } = await supabaseAdmin!
      .from('player_discovery_profiles')
      .select('auth_user_id, discoverable')
      .eq('auth_user_id', opponentId)
      .maybeSingle();

    if (oppErr) {
      logger.error('[player/discovery/h2h] discovery gate error', oppErr);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    const opponentDiscoverable =
      (oppProfile as { discoverable?: boolean | null } | null)?.discoverable ===
      true;
    if (!opponentDiscoverable) {
      return res.status(404).json({
        error: 'Joueur introuvable ou non découvrable.',
        code: 'NOT_DISCOVERABLE',
      });
    }

    // 2) Participations des DEUX joueurs sur TOUS les tenants (2 requêtes
    //    batchées, aucun N+1). Pas de filtre tenant_id : c'est l'agrégation
    //    cross-tenant qui fait tout l'intérêt de cette route.
    const [aPartsRes, bPartsRes] = await Promise.all([
      supabaseAdmin!
        .from('match_participants')
        .select('match_id, team_id, user_id, is_substitute')
        .eq('user_id', selfId),
      supabaseAdmin!
        .from('match_participants')
        .select('match_id, team_id, user_id, is_substitute')
        .eq('user_id', opponentId),
    ]);

    if (aPartsRes.error || bPartsRes.error) {
      logger.error(
        '[player/discovery/h2h] participants error',
        aPartsRes.error ?? bPartsRes.error
      );
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    const aTeamByMatch = teamByMatch(
      (aPartsRes.data as ParticipantRow[]) ?? []
    );
    const bTeamByMatch = teamByMatch(
      (bPartsRes.data as ParticipantRow[]) ?? []
    );

    // 3) Confrontations = matches partagés où les DEUX étaient présents sur des
    //    équipes DIFFÉRENTES (camps opposés).
    const confrontationMatchIds: string[] = [];
    for (const [matchId, aTeam] of aTeamByMatch) {
      const bTeam = bTeamByMatch.get(matchId);
      if (bTeam && bTeam !== aTeam) confrontationMatchIds.push(matchId);
    }

    const empty: HeadToHeadResponse = {
      a: { userId: selfId },
      b: { userId: opponentId },
      totals: { played: 0, aWins: 0, bWins: 0, draws: 0 },
      recent: [],
    };

    if (confrontationMatchIds.length === 0) {
      return res.status(200).json(empty);
    }

    // 4) Charger les matches des confrontations (1 requête batchée) pour le
    //    winner_team_id + horodatage + tenant.
    const { data: matchRows, error: matchErr } = await supabaseAdmin!
      .from('matches')
      .select('id, tenant_id, tournament_id, winner_team_id, completed_at')
      .in('id', confrontationMatchIds);

    if (matchErr) {
      logger.error('[player/discovery/h2h] matches error', matchErr);
      return res.status(500).json({ error: 'Erreur serveur.' });
    }

    // 5) Tally cross-tenant + collecte des encounters pour `recent`.
    let played = 0;
    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    const encounters: RecentEncounter[] = [];

    for (const m of (matchRows as MatchRow[]) ?? []) {
      const aTeam = aTeamByMatch.get(m.id);
      const bTeam = bTeamByMatch.get(m.id);
      // Garde-fou : la confrontation a déjà été validée (aTeam !== bTeam).
      if (!aTeam || !bTeam) continue;

      played += 1;
      let winner: Outcome;
      if (m.winner_team_id && m.winner_team_id === aTeam) {
        winner = 'a';
        aWins += 1;
      } else if (m.winner_team_id && m.winner_team_id === bTeam) {
        winner = 'b';
        bWins += 1;
      } else {
        // winner_team_id null (match nul / non résolu) → nul. Un winner_team_id
        // qui ne serait ni aTeam ni bTeam est impossible dans un match 2-équipes
        // où a et b sont les deux camps, mais on retombe sur « draw » par sûreté.
        winner = 'draw';
        draws += 1;
      }

      encounters.push({
        matchId: m.id,
        tenantId: m.tenant_id ?? null,
        tournamentId: m.tournament_id ?? null,
        date: m.completed_at ?? null,
        winner,
      });
    }

    // `recent` : N dernières confrontations, plus récentes d'abord.
    encounters.sort((x, y) => {
      const dx = x.date ?? '';
      const dy = y.date ?? '';
      return dx < dy ? 1 : dx > dy ? -1 : 0;
    });
    const recent = encounters.slice(0, RECENT_LIMIT);

    const response: HeadToHeadResponse = {
      a: { userId: selfId },
      b: { userId: opponentId },
      totals: { played, aWins, bWins, draws },
      recent,
    };

    return res.status(200).json(response);
  } catch (err) {
    logger.error('[player/discovery/h2h] internal error', err);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
}

export default withAuthRoute(handler);
