// /api/bot/v1/tournaments/[tournamentId]/teams
//
// GET  — Liste les equipes inscrites au tournoi (commande /participants).
//        Dedup par team_id (une team peut etre dans plusieurs stages).
//        Renvoie le capitaine + son discordUserId si lie.
//
// POST — Inscrit une equipe dans le tournoi (commandes /inscrire-equipe pour
//        staff et /inscrire-mon-equipe pour le capitaine).
//
// Deux modes d'acteur POST :
//  - staff (admin/owner) : inscrit n'importe quelle equipe.
//  - capitaine : auto-inscription de sa propre equipe (teamId doit etre la
//    sienne).
//
// Mirrors the validation of the human-staff route
// (/api/admin/teams/[teamId]/tournaments): tournament must be 'published',
// max_teams not exceeded, team has enough members, no double registration.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import {
  logBotStaffAction,
  resolveActorPlayer,
  resolveActorStaff,
} from '@/utils/botActor';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

const STAFF_PRIVILEGED = new Set(['admin', 'owner']);

// Body POST (l'inscription). Le bodySchema ne s'applique qu'au POST, donc le
// GET (liste) n'est pas affecté. stageId est optionnel (toutes phases si absent).
const registerBodySchema = z.object({
  actorDiscordUserId: discordIdSchema,
  teamId: uuidSchema,
  stageId: uuidSchema.optional(),
});
// tournamentId (path param) — partagé GET + POST.
const teamsQuerySchema = z.object({ tournamentId: uuidSchema });

async function handleList(
  req: BotTenantRequest,
  res: NextApiResponse,
  tournamentId: string
) {
  const tenantId = req.botContext.tenantId;
  // Verify tournament exists (cheap, gives a better error than empty list).
  const { data: tournament, error: tErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, slug, status')
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
  if (tErr) {
    logger.error('[bot/tournaments/teams] tournament lookup error', tErr);
    return res.status(500).json({ error: 'Erreur de chargement du tournoi' });
  }
  if (!tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }

  // List all stage_teams rows for this tournament (join via tournament_stages).
  const { data: rows, error: rowsErr } = await supabaseAdmin
    .from('stage_teams')
    .select(
      `team_id,
       team:team_id (id, name, slug, short_name, logo_url, country, captain_id),
       tournament_stages!inner(tournament_id)`
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_stages.tournament_id', tournamentId);
  if (rowsErr) {
    logger.error('[bot/tournaments/teams] stage_teams error', rowsErr);
    return res.status(500).json({ error: 'Erreur de lecture des équipes' });
  }

  // Dedup by team_id.
  const teamsById = new Map<
    string,
    {
      id: string;
      name: string;
      slug: string | null;
      shortName: string | null;
      logoUrl: string | null;
      country: string | null;
      captainAuthUserId: string | null;
    }
  >();
  for (const r of rows ?? []) {
    const t = Array.isArray((r as any).team)
      ? (r as any).team[0]
      : (r as any).team;
    if (!t?.id || teamsById.has(t.id)) continue;
    teamsById.set(t.id, {
      id: t.id,
      name: t.name ?? '',
      slug: t.slug ?? null,
      shortName: t.short_name ?? null,
      logoUrl: t.logo_url ?? null,
      country: t.country ?? null,
      captainAuthUserId: t.captain_id ?? null,
    });
  }

  if (teamsById.size === 0) {
    return res.status(200).json({ tournament, teams: [] });
  }

  // Member counts + Discord links of captains, both in batch.
  const captainAuthIds = [...teamsById.values()]
    .map((t) => t.captainAuthUserId)
    .filter((x): x is string => !!x);

  const [{ data: members }, { data: links }] = await Promise.all([
    supabaseAdmin
      .from('team_members')
      .select('team_id')
      .eq('tenant_id', tenantId)
      .in('team_id', [...teamsById.keys()]),
    captainAuthIds.length > 0
      ? supabaseAdmin
          .from('user_discord_links')
          .select('auth_user_id, discord_user_id, discord_username')
          .in('auth_user_id', captainAuthIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const memberCountByTeam = new Map<string, number>();
  for (const m of members ?? []) {
    memberCountByTeam.set(
      (m as any).team_id,
      (memberCountByTeam.get((m as any).team_id) ?? 0) + 1
    );
  }
  const linkByAuthId = new Map<
    string,
    { discordUserId: string; discordUsername: string | null }
  >();
  for (const l of links ?? []) {
    linkByAuthId.set((l as any).auth_user_id, {
      discordUserId: (l as any).discord_user_id,
      discordUsername: (l as any).discord_username ?? null,
    });
  }

  const teams = [...teamsById.values()]
    .map((t) => ({
      id: t.id,
      name: t.name,
      slug: t.slug,
      shortName: t.shortName,
      logoUrl: t.logoUrl,
      country: t.country,
      memberCount: memberCountByTeam.get(t.id) ?? 0,
      captain: t.captainAuthUserId
        ? {
            authUserId: t.captainAuthUserId,
            ...(linkByAuthId.get(t.captainAuthUserId) ?? {
              discordUserId: null,
              discordUsername: null,
            }),
          }
        : null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return res.status(200).json({ tournament, teams });
}

async function handleRegister(
  req: BotTenantRequest,
  res: NextApiResponse,
  tournamentId: string
) {
  const { actorDiscordUserId, teamId, stageId } = req.botInput as z.infer<
    typeof registerBodySchema
  >;

  // Resolve actor : staff (admin/owner) OR captain of the target team.
  // Captain self-registration (/inscrire-mon-equipe) limits the action to
  // their own team; staff (/inscrire-equipe) can register any team.
  const staffActor = await resolveActorStaff(actorDiscordUserId);
  const isStaff = !!staffActor.role && STAFF_PRIVILEGED.has(staffActor.role);

  let isCaptain = false;
  let captainAuthUserId: string | null = null;
  if (!isStaff) {
    const playerActor = await resolveActorPlayer(actorDiscordUserId);
    if (playerActor) {
      const { data: teamCaptainRow } = await supabaseAdmin
        .from('teams')
        .select('captain_id')
        .eq('tenant_id', req.botContext.tenantId)
        .eq('id', teamId)
        .maybeSingle();
      if (teamCaptainRow?.captain_id === playerActor.authUserId) {
        isCaptain = true;
        captainAuthUserId = playerActor.authUserId;
      }
    }
  }

  if (!isStaff && !isCaptain) {
    return res.status(403).json({
      error:
        "Action réservée aux admins/owners ou au capitaine de l'équipe ciblée.",
    });
  }

  // Tournament + status + max_teams
  const { data: tournament, error: tourErr } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, status, max_teams, min_players')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', tournamentId)
    .single();
  if (tourErr || !tournament) {
    return res.status(404).json({ error: 'Tournoi introuvable' });
  }
  if (tournament.status !== 'published') {
    return res.status(400).json({
      error:
        'Le tournoi doit être en status "published" pour accueillir une équipe.',
    });
  }

  // Team exists
  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr || !team) {
    return res.status(404).json({ error: 'Équipe introuvable' });
  }

  // min_players
  if (tournament.min_players) {
    const { count: playerCount, error: countErr } = await supabaseAdmin
      .from('team_members')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', req.botContext.tenantId)
      .eq('team_id', teamId);
    if (countErr) {
      logger.error('[bot/tournaments/teams] count members error', countErr);
      return res.status(500).json({ error: 'Erreur de vérification effectif' });
    }
    if ((playerCount || 0) < tournament.min_players) {
      return res.status(400).json({
        error: `L'équipe doit avoir au moins ${tournament.min_players} joueur(s) (actuellement ${playerCount || 0}).`,
      });
    }
  }

  // max_teams
  if (tournament.max_teams) {
    const { data: existingTeams, error: maxErr } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id, tournament_stages!inner(tournament_id)')
      .eq('tenant_id', req.botContext.tenantId)
      .eq('tournament_stages.tournament_id', tournamentId);
    if (maxErr) {
      logger.error('[bot/tournaments/teams] max_teams check error', maxErr);
      return res
        .status(500)
        .json({ error: 'Erreur de vérification du nombre d’équipes' });
    }
    const uniqueTeams = new Set((existingTeams ?? []).map((t) => t.team_id));
    if (uniqueTeams.size >= tournament.max_teams) {
      return res.status(400).json({
        error: `Le tournoi a atteint sa limite de ${tournament.max_teams} équipes.`,
      });
    }
  }

  // Resolve target stages
  let targetStageIds: string[] = [];
  if (stageId) {
    const { data: stage, error: stErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id')
      .eq('tenant_id', req.botContext.tenantId)
      .eq('id', stageId)
      .eq('tournament_id', tournamentId)
      .maybeSingle();
    if (stErr || !stage) {
      return res
        .status(404)
        .json({ error: 'Phase introuvable pour ce tournoi' });
    }
    targetStageIds = [stageId];
  } else {
    const { data: stages, error: stagesErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('id')
      .eq('tenant_id', req.botContext.tenantId)
      .eq('tournament_id', tournamentId);
    if (stagesErr) {
      logger.error('[bot/tournaments/teams] stages list error', stagesErr);
      return res.status(500).json({ error: 'Erreur de chargement des phases' });
    }
    if (!stages || stages.length === 0) {
      return res.status(400).json({
        error: 'Le tournoi n’a aucune phase. Créez une phase d’abord.',
      });
    }
    targetStageIds = stages.map((s) => s.id);
  }

  // Already-registered check
  const { data: existingRegs, error: existsErr } = await supabaseAdmin
    .from('stage_teams')
    .select('stage_id')
    .eq('tenant_id', req.botContext.tenantId)
    .eq('team_id', teamId)
    .in('stage_id', targetStageIds);
  if (existsErr) {
    logger.error('[bot/tournaments/teams] existing reg check error', existsErr);
    return res.status(500).json({ error: 'Erreur de vérification' });
  }
  if (existingRegs && existingRegs.length > 0) {
    return res.status(409).json({
      error: 'Équipe déjà inscrite à ce tournoi.',
    });
  }

  // Insert
  const insertRows = targetStageIds.map((stgId) => ({
    tenant_id: req.botContext.tenantId,
    stage_id: stgId,
    team_id: teamId,
  }));
  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('stage_teams')
    .insert(insertRows)
    .select();
  if (insertErr) {
    logger.error('[bot/tournaments/teams] insert error', insertErr);
    return res.status(500).json({ error: 'Échec de l’inscription' });
  }

  // Audit log : only when a staff is the actor. Captain self-registration is
  // already covered by the stage_teams row + logger.info below.
  if (isStaff && staffActor.staffId) {
    await logBotStaffAction({
      staffId: staffActor.staffId,
      action: 'update_team',
      entity_type: 'team',
      entity_id: teamId,
      tournament_id: tournamentId,
      payload: {
        action_type: 'tournament_registration',
        team_name: team.name,
        tournament_name: tournament.name,
        stage_ids: targetStageIds,
      },
    });
  } else if (isCaptain && captainAuthUserId) {
    logger.info('[bot/tournaments/teams] captain self-registration', {
      teamId,
      tournamentId,
      captainAuthUserId,
      actorDiscordUserId,
    });
    void logPlayerAction({
      actorAuthUserId: captainAuthUserId,
      actorDiscordUserId,
      action: 'register_team',
      entityType: 'tournament',
      entityId: tournamentId,
      payload: { team_id: teamId, stage_ids: targetStageIds },
    });
  }

  return res.status(201).json({
    success: true,
    teamId,
    tournamentId,
    stageIds: targetStageIds,
    registrations: inserted,
  });
}

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { tournamentId } = req.botQuery as z.infer<typeof teamsQuerySchema>;

  if (req.method === 'GET') return handleList(req, res, tournamentId);
  if (req.method === 'POST') return handleRegister(req, res, tournamentId);

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: { max: 30, key: 'bot-tournament-teams' },
  idempotent: true,
  bodySchema: registerBodySchema,
  querySchema: teamsQuerySchema,
});
