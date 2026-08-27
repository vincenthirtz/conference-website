import type { NextApiRequest, NextApiResponse } from 'next';
import { countPlayingMembers } from '@/utils/teams/roleKind';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
/**
 * GET /api/admin/teams/[teamId]/tournaments
 * Retrieve tournaments a team is registered for and available tournaments
 *
 * POST /api/admin/teams/[teamId]/tournaments
 * Register a team to a tournament. Écrit les DEUX tables : `tournament_teams`
 * (inscription canonique, lue partout ailleurs) et `stage_teams` (seeding dans
 * les phases). `min_players` n'y fait pas obstacle — le staff arbitre.
 * Body: { tournamentId: string, stageId?: string }
 *
 * DELETE /api/admin/teams/[teamId]/tournaments
 * Unregister a team from a tournament (retire des deux tables)
 * Body: { tournamentId: string }
 */

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-team-tournaments'
    )
  )
    return;
  const { teamId } = req.query;

  if (!teamId || typeof teamId !== 'string' || !isValidUUID(teamId)) {
    return res.status(400).json({ error: 'teamId required' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  // Verify team exists
  const { data: team, error: teamError } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .eq('tenant_id', ctx.tenantId)
    .single();

  if (teamError || !team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, teamId, ctx);
  } else if (req.method === 'POST') {
    return handlePost(req, res, teamId, team.name, ctx);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, teamId, team.name, ctx);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Get all published tournaments
    // `min_players` voyage avec : depuis qu'il n'interdit plus l'inscription
    // (cf. handlePost), c'est l'ÉCRAN qui doit prévenir le staff qu'il inscrit
    // une équipe incomplète — sinon l'assouplissement se transforme en
    // inscription accidentelle.
    const { data: allTournaments, error: tournamentsError } =
      await supabaseAdmin
        .from('tournaments')
        .select(
          'id, name, slug, game, status, start_date, end_date, max_teams, min_players'
        )
        .eq('tenant_id', ctx.tenantId)
        .eq('status', 'published')
        .order('start_date', { ascending: false });

    if (tournamentsError) {
      throw tournamentsError;
    }

    // Effectif JOUANT de l'équipe (coachs et managers exclus) — même décompte
    // que celui qu'appliquait la garde `min_players`, pour que l'avertissement
    // affiché soit exactement le chiffre qui compte.
    const { data: memberRows } = await supabaseAdmin
      .from('team_members')
      .select('role')
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', teamId);
    const playerCount = countPlayingMembers(
      (memberRows || []) as { role?: string | null }[]
    );

    // Get tournaments the team is registered for (via stage_teams)
    const { data: registrations, error: registrationsError } =
      await supabaseAdmin
        .from('stage_teams')
        .select(
          `
        stage_id,
        team_id,
        tournament_stages!inner(
          id,
          tournament_id,
          name,
          stage_type,
          tournaments!inner(
            id,
            name,
            slug,
            game,
            status,
            start_date,
            end_date
          )
        )
      `
        )
        .eq('tenant_id', ctx.tenantId)
        .eq('team_id', teamId);

    if (registrationsError) {
      throw registrationsError;
    }

    // Group registrations by tournament
    const registeredTournamentIds = new Set<string>();
    const tournamentRegistrations: Record<string, any[]> = {};

    registrations?.forEach((reg: any) => {
      const tournament = reg.tournament_stages?.tournaments;
      if (tournament) {
        registeredTournamentIds.add(tournament.id);
        if (!tournamentRegistrations[tournament.id]) {
          tournamentRegistrations[tournament.id] = [];
        }
        tournamentRegistrations[tournament.id].push({
          stageId: reg.stage_id,
          stageName: reg.tournament_stages?.name,
          stageType: reg.tournament_stages?.stage_type,
        });
      }
    });

    // Separate registered and available tournaments
    const registered = (allTournaments || [])
      .filter((t) => registeredTournamentIds.has(t.id))
      .map((t) => ({
        ...t,
        stages: tournamentRegistrations[t.id] || [],
      }));

    const available = (allTournaments || []).filter(
      (t) => !registeredTournamentIds.has(t.id)
    );

    return res.status(200).json({
      teamId,
      playerCount,
      registered,
      available,
    });
  } catch (err: unknown) {
    logger.error('GET /api/admin/teams/[teamId]/tournaments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  teamName: string,
  ctx: AuthenticatedStaffContext
) {
  const { tournamentId, stageId } = req.body;

  if (!tournamentId || typeof tournamentId !== 'string') {
    return res.status(400).json({ error: 'tournamentId required' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Verify tournament exists and is published
    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status, max_teams, min_players')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (tournamentError || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    if (tournament.status !== 'published') {
      return res
        .status(400)
        .json({ error: 'Tournament must be published to register a team' });
    }

    // `min_players` N'INTERDIT PLUS au staff d'inscrire (décision produit
    // 2026-08-27, même arbitrage que `/api/demandes/register-team`). Un refus
    // automatique ici était le moins défendable des trois : le staff est
    // précisément la personne qui décide de faire l'exception, et le 400 la
    // laissait sans recours devant un formulaire qui « ne faisait rien ».
    //
    // On compte quand même, pour le journal : l'écart au moment de
    // l'inscription se relit après coup dans `staff_logs`.
    const { data: playingRows, error: countPlayersError } = await supabaseAdmin
      .from('team_members')
      .select('role')
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', teamId);

    if (countPlayersError) {
      throw countPlayersError;
    }

    const playerCount = countPlayingMembers(
      (playingRows || []) as { role?: string | null }[]
    );

    // Check if max_teams limit is reached
    if (tournament.max_teams) {
      const { data: existingTeams, error: countError } = await supabaseAdmin
        .from('stage_teams')
        .select('team_id, tournament_stages!inner(tournament_id)')
        .eq('tenant_id', ctx.tenantId)
        .eq('tournament_stages.tournament_id', tournamentId);

      if (countError) {
        throw countError;
      }

      const uniqueTeams = new Set(existingTeams?.map((t) => t.team_id) || []);
      if (uniqueTeams.size >= tournament.max_teams) {
        return res.status(400).json({
          error: `Tournament has reached the limit of ${tournament.max_teams} teams`,
        });
      }
    }

    let targetStageIds: string[] = [];

    if (stageId) {
      // Specific stage provided
      const { data: stage, error: stageError } = await supabaseAdmin
        .from('tournament_stages')
        .select('id, tournament_id')
        .eq('id', stageId)
        .eq('tenant_id', ctx.tenantId)
        .eq('tournament_id', tournamentId)
        .single();

      if (stageError || !stage) {
        return res
          .status(404)
          .json({ error: 'Stage not found for this tournament' });
      }

      targetStageIds = [stageId];
    } else {
      // Get all stages for the tournament
      const { data: stages, error: stagesError } = await supabaseAdmin
        .from('tournament_stages')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('tournament_id', tournamentId);

      if (stagesError) {
        throw stagesError;
      }

      if (!stages || stages.length === 0) {
        return res.status(400).json({
          error: 'Tournament has no stages. Create a stage first.',
        });
      }

      targetStageIds = stages.map((s) => s.id);
    }

    // Check if team is already registered to any of these stages
    const { data: existingRegistrations, error: existingError } =
      await supabaseAdmin
        .from('stage_teams')
        .select('stage_id')
        .eq('tenant_id', ctx.tenantId)
        .eq('team_id', teamId)
        .in('stage_id', targetStageIds);

    if (existingError) {
      throw existingError;
    }

    if (existingRegistrations && existingRegistrations.length > 0) {
      return res.status(400).json({
        error: 'Team is already registered for this tournament',
      });
    }

    // Insert into stage_teams for each stage
    const insertData = targetStageIds.map((stgId) => ({
      tenant_id: ctx.tenantId,
      stage_id: stgId,
      team_id: teamId,
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('stage_teams')
      .insert(insertData)
      .select();

    if (insertError) {
      throw insertError;
    }

    // `tournament_teams` est la table d'inscription CANONIQUE : c'est elle que
    // lisent la page publique du tournoi, l'espace équipe, la santé d'équipe et
    // le plafond `max_teams` de `/api/demandes/register-team`. `stage_teams`
    // dit seulement « dans quelles phases l'équipe est seedée ».
    //
    // Cet écran n'écrivait QUE `stage_teams` : l'inscription réussissait,
    // n'échouait nulle part, et restait invisible partout où elle compte —
    // « le formulaire ne le fait pas en base ». Les deux tables restent
    // volontairement distinctes (cf. docs/AUDIT_FLOW_INSCRIPTION.md), mais ce
    // chemin doit renseigner les deux.
    const { error: ttError } = await supabaseAdmin
      .from('tournament_teams')
      .upsert(
        {
          tenant_id: ctx.tenantId,
          tournament_id: tournamentId,
          team_id: teamId,
          status: 'registered',
        },
        { onConflict: 'tournament_id,team_id' }
      );

    if (ttError) {
      // On ne rollback pas `stage_teams` : l'équipe est seedée, c'est déjà la
      // moitié utile. Mais on le DIT — un succès silencieux ici reproduirait
      // exactement le bug qu'on corrige.
      logger.error(
        '[admin/teams/tournaments] tournament_teams upsert failed',
        { teamId, tournamentId, error: ttError.message }
      );
      return res.status(500).json({
        error:
          "L'équipe a été seedée dans les phases mais son inscription n'a pas pu être enregistrée. Réessaie ou préviens un dev.",
      });
    }

    // Journal staff.
    //
    // Lisait une propriété `staffContext` posée sur `req`, qui n'existe pas :
    // `withStaffRoute` passe le contexte en 3ᵉ ARGUMENT (`ctx`) et le mémoïse
    // sous un Symbol. La condition était donc toujours fausse — ce chemin n'a
    // jamais écrit une seule ligne de journal, ni à l'inscription ni à la
    // désinscription.
    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_team',
        entity_type: 'team',
        entity_id: teamId,
        tournament_id: tournamentId,
        payload: {
          action_type: 'tournament_registration',
          team_name: teamName,
          tournament_name: tournament.name,
          stage_ids: targetStageIds,
          // Trace de l'écart au roster requis : depuis que `min_players` ne
          // refuse plus, c'est ici qu'on relit ce que le staff a arbitré.
          roster_players: playerCount,
          min_players: tournament.min_players ?? null,
        },
      });
    }

    // Auto news: team registered to tournament
    try {
      const newsSlug = `tournament-${tournamentId}-team-${teamId}-${Date.now().toString(36)}`;
      const { data: teamData } = await supabaseAdmin
        .from('teams')
        .select('logo_url')
        .eq('id', teamId)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();
      await supabaseAdmin.from('news').insert({
        tenant_id: ctx.tenantId,
        title: `${teamName} rejoint le tournoi ${tournament.name}`,
        slug: newsSlug,
        tag: 'tournaments',
        excerpt: `${teamName} s'est inscrite au tournoi ${tournament.name}.`,
        content: `L'équipe ${teamName} est désormais inscrite au tournoi ${tournament.name}. Bonne chance !`,
        image_url: teamData?.logo_url ?? null,
        status: 'published',
        published_at: new Date().toISOString(),
      });
    } catch (newsErr) {
      logger.error('[admin/teams/tournaments] create news error:', newsErr);
    }

    return res.status(201).json({
      success: true,
      message: `Team registered to ${targetStageIds.length} stage(s)`,
      registrations: inserted,
    });
  } catch (err: unknown) {
    logger.error('POST /api/admin/teams/[teamId]/tournaments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  teamName: string,
  ctx: AuthenticatedStaffContext
) {
  const { tournamentId } = req.body;

  if (!tournamentId || typeof tournamentId !== 'string') {
    return res.status(400).json({ error: 'tournamentId required' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  try {
    // Get tournament name for logging
    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('name')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .single();

    if (tournamentError || !tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Get all stages for this tournament
    const { data: stages, error: stagesError } = await supabaseAdmin
      .from('tournament_stages')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', tournamentId);

    if (stagesError) {
      throw stagesError;
    }

    if (!stages || stages.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No stage found for this tournament',
      });
    }

    const stageIds = stages.map((s) => s.id);

    // Delete from stage_teams
    const { error: deleteError, count } = await supabaseAdmin
      .from('stage_teams')
      .delete({ count: 'exact' })
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', teamId)
      .in('stage_id', stageIds);

    if (deleteError) {
      throw deleteError;
    }

    // Pendant du POST : sans ça, désinscrire retirait l'équipe des phases mais
    // la laissait « inscrite » sur la page publique du tournoi.
    const { error: ttDeleteError } = await supabaseAdmin
      .from('tournament_teams')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', teamId)
      .eq('tournament_id', tournamentId);

    if (ttDeleteError) {
      logger.error(
        '[admin/teams/tournaments] tournament_teams delete failed',
        { teamId, tournamentId, error: ttDeleteError.message }
      );
      return res.status(500).json({
        error:
          "L'équipe a été retirée des phases mais son inscription n'a pas pu être supprimée. Réessaie ou préviens un dev.",
      });
    }

    // Journal staff — même correction que dans handlePost.
    if (ctx.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_team',
        entity_type: 'team',
        entity_id: teamId,
        tournament_id: tournamentId,
        payload: {
          action_type: 'tournament_unregistration',
          team_name: teamName,
          tournament_name: tournament.name,
          stage_ids: stageIds,
          deleted_count: count,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Team unregistered (${count || 0} entry(ies) removed)`,
    });
  } catch (err: unknown) {
    logger.error('DELETE /api/admin/teams/[teamId]/tournaments error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

export default withStaffRoute(handler, 'admin');
