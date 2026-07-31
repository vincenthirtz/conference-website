// pages/api/cron/team-weekly-recap.ts
//
// Récap hebdomadaire d'équipe (N7).
//
// Le site attendait qu'on vienne : aucune restitution périodique, aucun bilan.
// L'infrastructure existait pourtant (outbox, dispatchers push/email,
// préférences par canal) — elle n'avait juste jamais été branchée sur l'objet
// « équipe ».
//
// Ce cron ne notifie PAS lui-même : il émet un event `team.weekly.recap` par
// équipe dans `bot_event_outbox`, et les dispatchers existants le livrent selon
// les préférences de chaque membre (push opt-out, email opt-in). Une seule
// mécanique de livraison pour tout le site, comme le reste.
//
// TROIS GARDE-FOUS, qui sont la feature autant que le calcul :
//
//   1. RIEN SI LA SEMAINE EST VIDE. `buildWeeklyRecap` renvoie `null` et on
//      n'émet pas. Les constats CHRONIQUES (comptes non liés, créneau
//      inexploité, débriefs en retard) n'ouvrent jamais un récap — sinon une
//      équipe dormante recevrait le même message toutes les semaines.
//
//   2. UNE SEULE FOIS PAR ÉQUIPE ET PAR SEMAINE. On relit l'outbox avant
//      d'émettre. Le cron peut donc se rejouer sans dupliquer.
//
//   3. AUCUN ENVOI AU STAFF. L'audience est le roster de l'équipe (cf. les deux
//      dispatchers) : un staff ne reçoit pas le bilan de toutes les équipes.
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... (query). GET + POST.

import type { NextApiRequest, NextApiResponse } from 'next';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { loadPlayedGames } from '@/utils/teams/playedGames';
import { resultFor } from '@/utils/teams/scouting';
import {
  buildWeeklyRecap,
  renderRecapSummary,
  type RecapEncounter,
} from '@/utils/teams/weeklyRecap';
import {
  buildRhythmHeatmap,
  coreRhythmSlots,
  normalizeRhythmSlots,
  rhythmCoreThreshold,
  type RhythmMemberInput,
} from '@/utils/teams/teamRhythm';
import { tallyPlayedBySlot } from '@/utils/teams/trainingSuggestion';
import { getTimeZoneOffsetMinutes } from '@/utils/timezone';

/** Fenêtre du récap. */
export const RECAP_WINDOW_DAYS = 7;

/** Fuseau de référence pour lire les créneaux d'une équipe. */
const RECAP_TIMEZONE = 'Europe/Paris';

type Row = Record<string, unknown>;

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/team-weekly-recap] CRON_SECRET absent — refus');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
}

/**
 * Équipes déjà destinataires d'un récap dans la fenêtre.
 *
 * On interroge l'outbox plutôt que de tenir une table d'état : la source de
 * vérité de « qu'a-t-on envoyé » y est déjà, et une table de plus serait une
 * seconde vérité à garder synchrone.
 *
 * Lecture UNIQUE avant la boucle, puis filtrage en mémoire, plutôt qu'une
 * requête par équipe sur un chemin JSON imbriqué : le volume est borné par le
 * nombre d'équipes (une ligne par équipe et par semaine), c'est donc moins de
 * requêtes — et surtout la règle ne dépend plus du support d'un opérateur
 * JSON-path côté PostgREST, ce qui la rend vérifiable.
 *
 * `null` en cas d'erreur de lecture : l'appelant s'abstient alors d'émettre.
 * Un récap manquant se rattrape la semaine suivante ; un doublon détruit la
 * confiance dans le canal.
 */
async function loadTeamsAlreadyRecapped(
  sinceIso: string
): Promise<Set<string> | null> {
  const { data, error } = await supabaseAdmin
    .from('bot_event_outbox')
    .select('payload')
    .eq('event_name', 'team.weekly.recap')
    .gte('created_at', sinceIso);

  if (error) {
    logger.error('[cron/team-weekly-recap] dedup read error', error);
    return null;
  }

  const out = new Set<string>();
  for (const row of (data || []) as Row[]) {
    const payload = (row.payload ?? {}) as Record<string, unknown>;
    const inner =
      payload.data && typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload;
    const teamId = inner.teamId;
    if (typeof teamId === 'string' && teamId) out.add(teamId);
  }
  return out;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Supabase admin not configured' });
  }

  const tenantId =
    typeof req.query.tenant === 'string' && req.query.tenant
      ? req.query.tenant
      : DEFAULT_TENANT_ID;

  const now = Date.now();
  const sinceIso = new Date(now - RECAP_WINDOW_DAYS * 86_400_000).toISOString();
  const offsetMinutes = getTimeZoneOffsetMinutes(new Date(), RECAP_TIMEZONE);

  const stats = { teams: 0, emitted: 0, empty: 0, alreadySent: 0, failed: 0 };

  try {
    const { data: teamRows, error: teamsErr } = await supabaseAdmin
      .from('teams')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .is('deleted_at', null);

    if (teamsErr) {
      logger.error('[cron/team-weekly-recap] teams error', teamsErr);
      return res.status(500).json({ error: 'Lecture des équipes impossible.' });
    }

    const teams = (teamRows || []) as Array<{ id: string; name: string }>;
    stats.teams = teams.length;

    const alreadyRecapped = await loadTeamsAlreadyRecapped(sinceIso);

    for (const team of teams) {
      try {
        const facts = await collectFacts(
          tenantId,
          team.id,
          sinceIso,
          offsetMinutes
        );
        const recap = buildWeeklyRecap(facts);
        if (!recap) {
          stats.empty += 1;
          continue;
        }
        // `null` = lecture de dédup en échec : on s'abstient pour tout le monde
        // plutôt que de risquer un doublon.
        if (!alreadyRecapped || alreadyRecapped.has(team.id)) {
          stats.alreadySent += 1;
          continue;
        }

        await emitBotEvent(
          'team.weekly.recap',
          {
            teamId: team.id,
            teamName: team.name,
            summary: renderRecapSummary(recap),
            recap,
            windowDays: RECAP_WINDOW_DAYS,
          },
          tenantId
        );
        stats.emitted += 1;
      } catch (err) {
        // Une équipe qui échoue ne doit jamais avorter le run des autres.
        stats.failed += 1;
        logger.error('[cron/team-weekly-recap] team %s failed', team.id, err);
      }
    }

    logger.info(
      '[cron/team-weekly-recap] done teams=%d emitted=%d empty=%d dup=%d failed=%d',
      stats.teams,
      stats.emitted,
      stats.empty,
      stats.alreadySent,
      stats.failed
    );
    return res.status(200).json({ success: true, ...stats });
  } catch (err) {
    logger.error('[cron/team-weekly-recap] unexpected error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Rassemble les faits d'une équipe sur la fenêtre.
 *
 * Chaque source est déjà écrite ailleurs (affrontements joués, rythme, revues,
 * identité) : ce cron ne réinvente aucun calcul, il les met bout à bout.
 */
async function collectFacts(
  tenantId: string,
  teamId: string,
  sinceIso: string,
  offsetMinutes: number
) {
  const sinceMs = Date.parse(sinceIso);

  const games = await loadPlayedGames(tenantId, teamId);

  const inWindow = games.filter((g) => {
    const t = g.playedAt ? Date.parse(g.playedAt) : NaN;
    return Number.isFinite(t) && t >= sinceMs;
  });

  const opponentIds = Array.from(
    new Set(
      inWindow
        .map((g) => (g.team1Id === teamId ? g.team2Id : g.team1Id))
        .filter((id): id is string => !!id)
    )
  );

  const [memberRes, opponentRes, reviewsRes, availabilityRes, pendingRes] =
    await Promise.all([
      supabaseAdmin
        .from('team_members')
        .select('user_id, battle_tag_verified_at')
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId),
      opponentIds.length > 0
        ? supabaseAdmin.from('teams').select('id, name').in('id', opponentIds)
        : Promise.resolve({ data: [] as Row[] }),
      supabaseAdmin
        .from('team_reviews')
        .select('subject_type, subject_id')
        .eq('tenant_id', tenantId)
        .eq('team_id', teamId),
      supabaseAdmin
        .from('team_availability')
        .select('user_id, timezone, slots')
        .eq('team_id', teamId)
        .eq('tenant_id', tenantId),
      supabaseAdmin
        .from('demandes')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('type', 'scrim')
        .eq('team_id', teamId)
        .eq('status', 'pending'),
    ]);

  const members = (memberRes.data || []) as Row[];
  const memberIds = members
    .map((m) => m.user_id as string | null)
    .filter((id): id is string => !!id);

  const nameById = new Map(
    ((opponentRes.data || []) as Array<{ id: string; name: string }>).map(
      (t) => [t.id, t.name]
    )
  );

  const encounters: RecapEncounter[] = inWindow.map((g) => {
    const otherId = g.team1Id === teamId ? g.team2Id : g.team1Id;
    return {
      subjectType: g.subjectType,
      opponentName: otherId ? (nameById.get(otherId) ?? null) : null,
      result: resultFor(g, teamId),
    };
  });

  // Niveau : variation MOYENNE des membres notées pendant la fenêtre. `null`
  // si personne n'a été noté — ne pas savoir n'est pas « n'a pas bougé ».
  let ratingDelta: number | null = null;
  let ratedPlayers = 0;
  if (memberIds.length > 0) {
    const { data: historyRows } = await supabaseAdmin
      .from('player_rating_history')
      .select('user_id, rating_before, rating_after')
      .eq('tenant_id', tenantId)
      .in('user_id', memberIds)
      .gte('occurred_at', sinceIso);

    const deltaByUser = new Map<string, number>();
    for (const row of (historyRows || []) as Row[]) {
      const before = Number(row.rating_before);
      const after = Number(row.rating_after);
      if (!Number.isFinite(before) || !Number.isFinite(after)) continue;
      const userId = row.user_id as string;
      deltaByUser.set(
        userId,
        (deltaByUser.get(userId) ?? 0) + (after - before)
      );
    }
    ratedPlayers = deltaByUser.size;
    if (ratedPlayers > 0) {
      const total = Array.from(deltaByUser.values()).reduce((a, b) => a + b, 0);
      ratingDelta = Math.round(total / ratedPlayers);
    }
  }

  const reviewed = new Set(
    ((reviewsRes.data || []) as Row[]).map(
      (r) => `${r.subject_type}:${r.subject_id}`
    )
  );
  const unreviewedEncounters = games.filter(
    (g) => !reviewed.has(`${g.subjectType}:${g.subjectId}`)
  ).length;

  // Créneaux du noyau que l'équipe n'exploite pas — même définition que la
  // suggestion d'entraînement (N6), appliquée à tout le noyau.
  const memberIdSet = new Set(memberIds);
  const rhythmInputs: RhythmMemberInput[] = [];
  for (const row of (availabilityRes.data || []) as Row[]) {
    const userId = row.user_id as string;
    if (!memberIdSet.has(userId)) continue;
    const normalized = normalizeRhythmSlots(row.slots);
    if (!normalized.ok || normalized.slots.length === 0) continue;
    rhythmInputs.push({
      userId,
      timezone: (row.timezone as string | null) || RECAP_TIMEZONE,
      slots: normalized.slots,
    });
  }
  const heatmap = buildRhythmHeatmap(rhythmInputs, RECAP_TIMEZONE);
  const core = coreRhythmSlots(heatmap, rhythmCoreThreshold(memberIds.length));
  const playedBySlot = tallyPlayedBySlot(
    games.map((g) => g.playedAt),
    offsetMinutes
  );
  const unusedCoreSlots = core.filter(
    (slot) => (playedBySlot.get(slot) ?? 0) === 0
  ).length;

  // Identité : membres sans Discord lié OU sans BattleTag vérifié. Une même
  // personne ne compte qu'une fois — deux manques ne font pas deux profils.
  let identityGaps = 0;
  if (memberIds.length > 0) {
    const { data: linkRows } = await supabaseAdmin
      .from('user_discord_links')
      .select('user_id')
      .in('user_id', memberIds);
    const linked = new Set(
      ((linkRows || []) as Row[]).map((r) => r.user_id as string)
    );
    identityGaps = members.filter((m) => {
      const userId = m.user_id as string | null;
      if (!userId) return false;
      return !linked.has(userId) || !m.battle_tag_verified_at;
    }).length;
  }

  return {
    encounters,
    ratingDelta,
    ratedPlayers,
    pendingProposals: ((pendingRes.data || []) as Row[]).length,
    unusedCoreSlots,
    unreviewedEncounters,
    identityGaps,
  };
}
