// pages/api/player/team-health.ts
//
// Santé d'équipe (N3) — le diagnostic, rendu consultable.
//
// Ce qui manquait n'était pas le calcul : `utils/teamMessages.ts` sait déjà
// dire roster incomplet, comptes dormants et BattleTags manquants. Mais il ne
// le sait que pour composer une relance Discord (`cron/team-roster-reminders`),
// et il est scopé à un TOURNOI. Une équipe ne pouvait donc découvrir ce qui la
// bloque qu'en recevant un message — jamais en venant regarder — et rien ne
// couvrait le capitanat vacant, les comptes Discord non liés, le rythme non
// déclaré ni l'invisibilité pour les scrims.
//
// Cette route rassemble les faits ; `utils/teams/teamHealth.ts` en tire des
// constats nommés ; l'UI porte le libellé, le « pourquoi ça compte » et le lien
// qui répare. Aucun score agrégé : un score se contemple, il ne se répare pas.
//
// AUTORISATION : réservée à qui GÈRE l'équipe (`getManagedTeam`). Les constats
// portent sur le roster entier et les gestes de réparation sont des gestes de
// gestion. L'équivalent individuel existe déjà côté membre : la checklist
// « Exister dans le réseau » (R11).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { withAuthRoute } from '@/utils/staff';
import { resolveTenantIdForUserRequestAsync } from '@/utils/tenant';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import { resolveCurrentTournamentId } from '@/utils/currentTournament';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import {
  computeTeamHealth,
  countBlocking,
  type HealthIssue,
} from '@/utils/teams/teamHealth';
import {
  buildRhythmHeatmap,
  coreRhythmSlots,
  normalizeRhythmSlots,
  rhythmCoreThreshold,
  type RhythmMemberInput,
} from '@/utils/teams/teamRhythm';
import { isSearchLive, type ScrimSearchRow } from '@/utils/teams/scrimSearch';
import { logger } from '@/utils/logger';

export type TeamHealthResponse = {
  teamId: string | null;
  teamName: string | null;
  issues: HealthIssue[];
  blockingCount: number;
  memberCount: number;
  /** Effectif requis, et d'où il vient — l'UI l'explique différemment. */
  requiredStarters: number;
  requiredStartersSource: 'tournament' | 'lineup';
};

type Row = Record<string, unknown>;

const EMPTY: TeamHealthResponse = {
  teamId: null,
  teamName: null,
  issues: [],
  blockingCount: 0,
  memberCount: 0,
  requiredStarters: MAX_TEAM_PLAYERS,
  requiredStartersSource: 'lineup',
};

/**
 * Effectif requis pour aligner une équipe.
 *
 * Le `min_players` du tournoi fait autorité quand l'équipe y est inscrite :
 * c'est la règle qui la fera seeder ou non. Hors tournoi, on retombe sur la
 * taille de line-up du jeu — sinon une équipe hors compétition n'aurait aucune
 * cible, et « roster incomplet » ne voudrait rien dire.
 */
async function resolveRequiredStarters(
  tenantId: string,
  teamId: string
): Promise<{ required: number; source: 'tournament' | 'lineup' }> {
  try {
    const tournamentId = await resolveCurrentTournamentId(tenantId);
    if (!tournamentId) return { required: MAX_TEAM_PLAYERS, source: 'lineup' };

    const { data: entry } = await supabaseAdmin
      .from('tournament_teams')
      .select('team_id')
      .eq('tournament_id', tournamentId)
      .eq('team_id', teamId)
      .maybeSingle();
    if (!entry) return { required: MAX_TEAM_PLAYERS, source: 'lineup' };

    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('min_players')
      .eq('id', tournamentId)
      .maybeSingle();

    const min = Number(
      (tournament as { min_players?: number | null } | null)?.min_players
    );
    // Un tournoi sans `min_players` ne déclare aucune complétude : on ne
    // fabrique pas une exigence qu'il n'a pas posée.
    if (!Number.isFinite(min) || min <= 0) {
      return { required: MAX_TEAM_PLAYERS, source: 'lineup' };
    }
    return { required: min, source: 'tournament' };
  } catch (err) {
    logger.error('[team-health] required starters error', err);
    return { required: MAX_TEAM_PLAYERS, source: 'lineup' };
  }
}

/**
 * Membres dont le compte n'a JAMAIS servi à ouvrir une session.
 *
 * Une lecture par membre (bornée par la taille du roster), et non le scan
 * paginé de `auth.users` qu'utilise le cron : cette route est appelée par une
 * capitaine depuis son tableau de bord, elle ne peut pas coûter un balayage de
 * toute la base à chaque affichage.
 *
 * Un compte INTROUVABLE n'est pas compté : on ne sait pas, et présenter une
 * inconnue comme un défaut est exactement ce que le diagnostic s'interdit.
 */
async function countNeverLoggedIn(userIds: string[]): Promise<number> {
  if (userIds.length === 0) return 0;
  const admin = supabaseAdmin?.auth?.admin;
  if (!admin?.getUserById) return 0;

  const results = await Promise.all(
    userIds.map(async (id) => {
      try {
        const { data } = await admin.getUserById(id);
        const user = (data as { user?: Row | null } | null)?.user;
        if (!user) return false;
        return !user.last_sign_in_at;
      } catch {
        return false;
      }
    })
  );
  return results.filter(Boolean).length;
}

/** Affrontements joués et jamais débriefés (N2). */
async function countUnreviewedEncounters(
  tenantId: string,
  teamId: string
): Promise<number> {
  try {
    const involvesMe = `team1_id.eq.${teamId},team2_id.eq.${teamId}`;
    const belongsToMe = (row: Row) =>
      row.team1_id === teamId || row.team2_id === teamId;

    const [matchesRes, scrimsRes, reviewsRes] = await Promise.all([
      supabaseAdmin
        .from('matches')
        .select('id, team1_id, team2_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'finished')
        .is('deleted_at', null)
        .or(involvesMe),
      supabaseAdmin
        .from('scrims')
        .select('id, team1_id, team2_id')
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .or(involvesMe),
      supabaseAdmin
        .from('team_reviews')
        .select('subject_type, subject_id')
        .eq('tenant_id', tenantId)
        .eq('team_id', teamId),
    ]);

    const reviewed = new Set(
      ((reviewsRes.data || []) as Row[]).map(
        (r) => `${r.subject_type}:${r.subject_id}`
      )
    );

    const unreviewed = (rows: Row[] | null, type: 'match' | 'scrim') =>
      (rows || [])
        .filter(belongsToMe)
        .filter((r) => !reviewed.has(`${type}:${r.id}`)).length;

    return (
      unreviewed(matchesRes.data as Row[] | null, 'match') +
      unreviewed(scrimsRes.data as Row[] | null, 'scrim')
    );
  } catch (err) {
    logger.error('[team-health] unreviewed error', err);
    return 0;
  }
}

export default withAuthRoute(async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { user }
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'team-health')) {
    return;
  }

  const tenantId = await resolveTenantIdForUserRequestAsync(req, {
    authUserId: user.id,
  });

  const access = await getManagedTeam(user.id, tenantId);
  if (!access) {
    // Pas de rôle de gestion : rien à diagnostiquer ici. La checklist
    // individuelle (R11) couvre déjà ce qu'un membre peut réparer seul.
    return res.status(200).json(EMPTY);
  }
  const teamId = access.teamId;

  const { data: teamRow, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name, captain_id')
    .eq('id', teamId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (teamErr) {
    logger.error('[team-health] team error', teamErr);
    return res.status(500).json({ error: "Lecture de l'équipe impossible." });
  }
  const team = teamRow as {
    id: string;
    name: string;
    captain_id: string | null;
  } | null;
  if (!team) return res.status(200).json(EMPTY);

  const { data: memberRows, error: membersErr } = await supabaseAdmin
    .from('team_members')
    .select('user_id, is_substitute, battle_tag, battle_tag_verified_at')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);

  if (membersErr) {
    logger.error('[team-health] members error', membersErr);
    return res.status(500).json({ error: 'Lecture du roster impossible.' });
  }

  const members = (memberRows || []) as Row[];
  const memberIds = members
    .map((m) => m.user_id as string | null)
    .filter((id): id is string => !!id);

  const starters = members.filter((m) => !m.is_substitute).length;
  const missingBattleTags = members.filter(
    (m) => !String(m.battle_tag ?? '').trim()
  ).length;
  // Un BattleTag absent est déjà compté ci-dessus : ne pas le recompter ici,
  // sinon la même personne apparaît dans deux constats et l'équipe croit avoir
  // deux problèmes là où elle n'en a qu'un.
  const unverifiedBattleTags = members.filter(
    (m) => String(m.battle_tag ?? '').trim() && !m.battle_tag_verified_at
  ).length;

  const [
    linksRes,
    availabilityRes,
    searchesRes,
    requiredInfo,
    neverLoggedIn,
    unreviewedEncounters,
  ] = await Promise.all([
    // `user_discord_links` est GLOBALE (pas de tenant_id).
    memberIds.length > 0
      ? supabaseAdmin
          .from('user_discord_links')
          .select('user_id')
          .in('user_id', memberIds)
      : Promise.resolve({ data: [] as Row[] }),
    supabaseAdmin
      .from('team_availability')
      .select('user_id, timezone, slots')
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId),
    supabaseAdmin
      .from('scrim_searches')
      .select('team_id, slots, status, expires_at')
      .eq('tenant_id', tenantId)
      .eq('team_id', teamId)
      .eq('status', 'active'),
    resolveRequiredStarters(tenantId, teamId),
    countNeverLoggedIn(memberIds),
    countUnreviewedEncounters(tenantId, teamId),
  ]);

  const linkedIds = new Set(
    ((linksRes.data || []) as Row[]).map((r) => r.user_id as string)
  );
  const discordUnlinked = memberIds.filter((id) => !linkedIds.has(id)).length;

  const memberIdSet = new Set(memberIds);
  const rhythmInputs: RhythmMemberInput[] = [];
  for (const row of (availabilityRes.data || []) as Row[]) {
    const userId = row.user_id as string;
    if (!memberIdSet.has(userId)) continue;
    const normalized = normalizeRhythmSlots(row.slots);
    if (!normalized.ok || normalized.slots.length === 0) continue;
    rhythmInputs.push({
      userId,
      timezone: (row.timezone as string | null) || 'Europe/Paris',
      slots: normalized.slots,
    });
  }
  const heatmap = buildRhythmHeatmap(rhythmInputs, 'Europe/Paris');
  const hasRhythmCore =
    coreRhythmSlots(heatmap, rhythmCoreThreshold(memberIds.length)).length > 0;

  const hasLiveScrimSearch = (
    (searchesRes.data || []) as ScrimSearchRow[]
  ).some((s) => isSearchLive(s));

  const issues = computeTeamHealth({
    memberCount: memberIds.length,
    starters,
    requiredStarters: requiredInfo.required,
    hasCaptain: !!team.captain_id,
    missingBattleTags,
    unverifiedBattleTags,
    discordUnlinked,
    neverLoggedIn,
    rhythmDeclared: rhythmInputs.length,
    hasLiveScrimSearch,
    hasRhythmCore,
    unreviewedEncounters,
  });

  const payload: TeamHealthResponse = {
    teamId: team.id,
    teamName: team.name,
    issues,
    blockingCount: countBlocking(issues),
    memberCount: memberIds.length,
    requiredStarters: requiredInfo.required,
    requiredStartersSource: requiredInfo.source,
  };

  res.setHeader('Cache-Control', 'private, max-age=30');
  return res.status(200).json(payload);
});
