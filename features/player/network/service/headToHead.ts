// features/player/network/service/headToHead.ts — face-à-face CROSS-TENANT
// entre l'appelante (côté « a ») et une joueuse du réseau (côté « b »)
// (lot P15). Extrait tel quel de la route historique.
//
// Gate de confidentialité : l'adversaire DOIT être découvrable (sinon 404
// NOT_DISCOVERABLE) ; l'appelante en est exempte (elle lit ses propres
// données). Seule la paire qui l'implique est permise — jamais `{ a, b }`
// arbitraires.
//
// LIMITATION du modèle : les matchs sont ÉQUIPE contre ÉQUIPE. Deux joueuses
// « se sont affrontées » quand elles figurent dans le même match sur des
// équipes DIFFÉRENTES (hors remplaçantes) ; le résultat est celui des équipes
// (`winner_team_id` null → nul), comme le H2H par tenant du profil public.

import { LegacyAdminError } from '@/utils/admin/errors';
import * as repo from '../repository';
import type { ParticipantRow } from '../repository';
import {
  HeadToHeadQuery,
  type HeadToHeadEncounter,
  type HeadToHeadOutcome,
  type HeadToHeadResponse,
} from '../schemas';
import {
  notDiscoverable,
  parseOrThrow,
  serverError,
  type NetworkCtx,
} from './context';

const RECENT_LIMIT = 10;

/**
 * match_id → team_id d'une joueuse (non-remplaçante), PREMIÈRE équipe vue
 * par match (défensif : une joueuse n'a pas deux équipes sur un match).
 */
function teamByMatch(rows: ParticipantRow[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows) {
    if (r.is_substitute) continue;
    if (!m.has(r.match_id)) m.set(r.match_id, r.team_id);
  }
  return m;
}

export async function readHeadToHead(
  ctx: NetworkCtx,
  rawQuery: unknown
): Promise<HeadToHeadResponse> {
  const { opponentId } = parseOrThrow(
    HeadToHeadQuery,
    rawQuery ?? {},
    'INVALID_QUERY'
  );
  const selfId = ctx.userId;
  if (opponentId === selfId) {
    throw new LegacyAdminError(
      400,
      'Un joueur ne peut pas être son propre adversaire.',
      { code: 'SELF_OPPONENT' }
    );
  }

  try {
    const gate = await repo.readDiscoverableFlag(ctx.db, opponentId);
    if (gate.error) {
      ctx.logger.error(
        '[player/discovery/h2h] discovery gate error',
        gate.error
      );
      throw serverError();
    }
    if (!gate.discoverable) throw notDiscoverable();

    const [aParts, bParts] = await Promise.all([
      repo.listParticipations(ctx.db, selfId),
      repo.listParticipations(ctx.db, opponentId),
    ]);
    if (aParts.error || bParts.error) {
      ctx.logger.error(
        '[player/discovery/h2h] participants error',
        aParts.error ?? bParts.error
      );
      throw serverError();
    }
    const aTeamByMatch = teamByMatch(aParts.rows);
    const bTeamByMatch = teamByMatch(bParts.rows);

    const confrontationIds: string[] = [];
    for (const [matchId, aTeam] of aTeamByMatch) {
      const bTeam = bTeamByMatch.get(matchId);
      if (bTeam && bTeam !== aTeam) confrontationIds.push(matchId);
    }

    const base = { a: { userId: selfId }, b: { userId: opponentId } };
    if (confrontationIds.length === 0) {
      return {
        ...base,
        totals: { played: 0, aWins: 0, bWins: 0, draws: 0 },
        recent: [],
      };
    }

    const matches = await repo.listMatchesIn(ctx.db, confrontationIds);
    if (matches.error) {
      ctx.logger.error('[player/discovery/h2h] matches error', matches.error);
      throw serverError();
    }

    let played = 0;
    let aWins = 0;
    let bWins = 0;
    let draws = 0;
    const encounters: HeadToHeadEncounter[] = [];
    for (const m of matches.rows) {
      const aTeam = aTeamByMatch.get(m.id);
      const bTeam = bTeamByMatch.get(m.id);
      if (!aTeam || !bTeam) continue;
      played += 1;
      let winner: HeadToHeadOutcome;
      if (m.winner_team_id && m.winner_team_id === aTeam) {
        winner = 'a';
        aWins += 1;
      } else if (m.winner_team_id && m.winner_team_id === bTeam) {
        winner = 'b';
        bWins += 1;
      } else {
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

    // Plus récentes d'abord.
    encounters.sort((x, y) => {
      const dx = x.date ?? '';
      const dy = y.date ?? '';
      return dx < dy ? 1 : dx > dy ? -1 : 0;
    });
    return {
      ...base,
      totals: { played, aWins, bWins, draws },
      recent: encounters.slice(0, RECENT_LIMIT),
    };
  } catch (err) {
    if (err instanceof LegacyAdminError) throw err;
    ctx.logger.error('[player/discovery/h2h] internal error', err);
    throw serverError();
  }
}
