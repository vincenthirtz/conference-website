// GET /api/bot/v1/disputes
//
// Commande /disputes (admin) : liste des matchs actuellement en dispute,
// avec leur raison + les deux reports si disponibles dans
// match_score_reports.
//
// Query :
//   - tournament : UUID, filtre
//   - limit      : 1..50, defaut 20
//
// Auth : x-api-key + actorDiscordUserId staff admin/owner (lu en query).

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { requireBotStaff } from '@/utils/botActor';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { oneRelation, type Relation } from '@/utils/supabase/relation';

/**
 * LES FORMES DES DEUX LECTURES, DÉCLARÉES UNE FOIS.
 *
 * Ces champs étaient lus derrière `as any`, un cast par accès — vingt-deux
 * dans ce seul fichier. Le coût n'est pas l'esthétique : `as any` éteint le
 * compilateur, et le mock Supabase des tests ne valide PAS les noms de
 * colonnes. Une colonne mal orthographiée, ou retirée par une migration,
 * traversait donc les tests au vert et ne cassait qu'en production — sur une
 * route consommée par le bot Discord, c'est-à-dire dans un autre dépôt.
 *
 * Les champs ci-dessous recopient EXACTEMENT les `.select()` plus bas. Une
 * divergence est maintenant une erreur de compilation.
 *
 * LES RELATIONS ARRIVENT EN OBJET OU EN TABLEAU selon que PostgREST juge la
 * jointure unique ou multiple — d'où l'union, et les `Array.isArray` qui la
 * dénouent. Ce n'est pas une précaution superflue : c'est la forme réelle de
 * la réponse.
 */
type TeamRel = { id: string; name: string; short_name: string | null };
type TournamentRel = { id: string; name: string; slug: string | null };

type DisputedMatchRow = {
  id: string;
  tournament_id: string | null;
  scheduled_at: string | null;
  round_number: number | null;
  round_name: string | null;
  dispute_reason: string | null;
  dispute_opened_at: string | null;
  team1: Relation<TeamRel>;
  team2: Relation<TeamRel>;
  tournament: Relation<TournamentRel>;
};

/**
 * Toutes NOT NULL en base — vérifié dans `information_schema`, pas supposé.
 *
 * Les déclarer nullables « par prudence » aurait forcé des `??` partout, et
 * ces replis auraient ressemblé à des cas réels alors qu'ils sont morts. Le
 * `updated_at ?? reported_at` plus bas en est un : il ne s'exécutera jamais,
 * et il est gardé parce qu'il ne coûte rien — pas parce qu'il sert.
 */
type ScoreReportRow = {
  match_id: string;
  team_side: number;
  team1_score: number;
  team2_score: number;
  reported_at: string;
  updated_at: string;
};

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

function queryString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t ? t : null;
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const actorDiscordUserId =
    queryString(req.query.actorDiscordUserId) ??
    queryString(
      (req.body as Record<string, unknown> | null)?.actorDiscordUserId
    );
  const actor = await requireBotStaff(req, res, {
    actorDiscordUserId: actorDiscordUserId ?? '',
  });
  if (!actor) return;

  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  const tournamentId = queryString(req.query.tournament);
  if (tournamentId && !isValidUUID(tournamentId)) {
    return res.status(400).json({ error: 'tournament invalide' });
  }

  let query = supabaseAdmin
    .from('matches')
    .select(
      `id, tournament_id, scheduled_at, round_number, round_name,
       dispute_reason, dispute_opened_at,
       team1:team1_id (id, name, short_name),
       team2:team2_id (id, name, short_name),
       tournament:tournament_id (id, name, slug)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .eq('status', 'disputed')
    .order('dispute_opened_at', { ascending: false })
    .limit(limit);

  if (tournamentId) query = query.eq('tournament_id', tournamentId);

  const { data: matches, error } = await query;
  if (error) {
    logger.error('[bot/disputes] query error', error);
    return res.status(500).json({ error: 'Erreur de lecture des disputes' });
  }
  if (!matches || matches.length === 0) {
    return res.status(200).json({ disputes: [], count: 0 });
  }

  // Pull both score reports for each disputed match (batch).
  const rows = (matches ?? []) as DisputedMatchRow[];
  const matchIds = rows.map((m) => m.id);
  const { data: reports } = await supabaseAdmin
    .from('match_score_reports')
    .select(
      'match_id, team_side, team1_score, team2_score, reported_at, updated_at'
    )
    .eq('tenant_id', req.botContext.tenantId)
    .in('match_id', matchIds);

  const reportsByMatch = new Map<
    string,
    { side: number; t1: number; t2: number; at: string | null }[]
  >();
  for (const r of (reports ?? []) as ScoreReportRow[]) {
    const list = reportsByMatch.get(r.match_id) ?? [];
    list.push({
      side: r.team_side,
      t1: r.team1_score,
      t2: r.team2_score,
      at: r.updated_at ?? r.reported_at ?? null,
    });
    reportsByMatch.set(r.match_id, list);
  }

  const disputes = rows.map((m) => {
    const t1 = oneRelation(m.team1);
    const t2 = oneRelation(m.team2);
    const tn = oneRelation(m.tournament);
    const reps = reportsByMatch.get(m.id) ?? [];
    const repBySide = (s: number) => reps.find((r) => r.side === s) ?? null;

    return {
      matchId: m.id,
      tournament: tn
        ? { id: tn.id, name: tn.name, slug: tn.slug ?? null }
        : null,
      round: m.round_name ?? null,
      roundNumber: m.round_number ?? null,
      scheduledAt: m.scheduled_at ?? null,
      reason: m.dispute_reason ?? null,
      openedAt: m.dispute_opened_at ?? null,
      team1: t1 ? { id: t1.id, name: t1.name } : null,
      team2: t2 ? { id: t2.id, name: t2.name } : null,
      reports: {
        team1Reported: repBySide(1)
          ? { team1Score: repBySide(1)!.t1, team2Score: repBySide(1)!.t2 }
          : null,
        team2Reported: repBySide(2)
          ? { team1Score: repBySide(2)!.t1, team2Score: repBySide(2)!.t2 }
          : null,
      },
    };
  });

  return res.status(200).json({ disputes, count: disputes.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 30, key: 'bot-disputes' },
  // Régie+ : arbitrage des litiges.
  requireCapability: 'arbitration',
});
