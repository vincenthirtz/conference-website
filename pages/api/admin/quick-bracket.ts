// pages/api/admin/quick-bracket.ts
//
// "Quick bracket" : crée un tournoi jouable complet à partir d'un simple
// nom + format + liste collée de participants, en UN appel.
//
// Décision d'architecture : on NE réinvente PAS de moteur "participants nus".
// Chaque participant devient une `teams` shell (une ligne teams, sans roster
// ni capitaine), puis on lance le flux bracket NORMAL dessus. On réutilise
// ainsi matches / propagation / UI admin-bracket / embeds gratuitement, et le
// passage ultérieur en "vraie" équipe (roster, Discord) est trivial : les
// shells SONT déjà de vraies équipes.
//
// POST body :
//   {
//     name: string,                       // 2..100
//     format: 'single_elim' | 'double_elim',
//     participants: string[] | string,    // array OU texte (retours ligne / virgules)
//     bestOf?: number
//   }
//
// Réponse : { tournamentId, slug }
//
// Auth : withStaffRoute(handler, 'manager') + withAdminIdempotency + rate-limit.
// Tenant-scoped via ctx.tenantId. Écritures via supabaseAdmin (bypass RLS).

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import slugify from 'slugify';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  generateSingleElim,
  generateDoubleElim,
  seedRoundOne,
} from '@/utils/bracket/generateBracket';
import { logger } from '../../../utils/logger';

type Ok = { tournamentId: string; slug: string };
type Err = { error: string; code?: string };
type ApiResponse = Ok | Err;

const bodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  format: z.enum(['single_elim', 'double_elim']),
  // participants : array de strings OU une seule string (multi-lignes / CSV).
  participants: z.union([z.array(z.string()), z.string()]),
  bestOf: z.number().int().min(1).max(15).optional(),
});

/**
 * Normalise la liste des participants : accepte un tableau OU une chaîne
 * (séparateurs = retours à la ligne, virgules, points-virgules). Trim +
 * suppression des entrées vides.
 */
function parseParticipants(raw: string[] | string): string[] {
  const items = Array.isArray(raw) ? raw : raw.split(/[\n,;]+/);
  return items.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** Prochaine puissance de 2 >= n, plancher 4, plafond 32. */
function bracketSizeFor(n: number): 4 | 8 | 16 | 32 {
  let size = 4;
  while (size < n) size *= 2;
  return Math.min(size, 32) as 4 | 8 | 16 | 32;
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'quick-bracket' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limit (IP) : la création d'un tournoi complet est coûteuse.
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60 * 1000 }, 'quick-bracket')
  ) {
    return;
  }

  if (!supabaseAdmin) {
    return res
      .status(503)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  // ---- Validation ----
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join('.');
    return res.status(400).json({
      error: `Champ invalide${path ? ` (${path})` : ''} : ${issue.message}`,
    });
  }
  const { name, format, bestOf } = parsed.data;

  const participants = parseParticipants(parsed.data.participants);

  // Doublons (insensible à la casse) → 400 nommant les doublons.
  const seen = new Map<string, string>(); // lower -> première occurrence
  const dupes = new Set<string>();
  for (const p of participants) {
    const key = p.toLowerCase();
    if (seen.has(key)) {
      dupes.add(seen.get(key) as string);
    } else {
      seen.set(key, p);
    }
  }
  if (dupes.size > 0) {
    return res.status(400).json({
      error: `Participants en double (insensible à la casse) : ${[...dupes].join(', ')}. Chaque participant doit être unique.`,
    });
  }

  if (participants.length < 2 || participants.length > 32) {
    return res.status(400).json({
      error: `Le nombre de participants doit être compris entre 2 et 32 (reçu : ${participants.length}).`,
    });
  }

  const n = participants.length;
  const size = bracketSizeFor(n);

  // Ressources créées, pour cleanup best-effort en cas d'échec.
  let tournamentId: string | null = null;
  let stageId: string | null = null;
  const createdTeamIds: string[] = [];

  const cleanup = async (reason: string) => {
    try {
      if (stageId) {
        await supabaseAdmin
          .from('matches')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('stage_id', stageId);
        await supabaseAdmin
          .from('stage_teams')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('stage_id', stageId);
        await supabaseAdmin
          .from('tournament_stages')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('id', stageId);
      }
      if (tournamentId) {
        await supabaseAdmin
          .from('tournament_teams')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('tournament_id', tournamentId);
        await supabaseAdmin
          .from('tournaments')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .eq('id', tournamentId);
      }
      if (createdTeamIds.length > 0) {
        await supabaseAdmin
          .from('teams')
          .delete()
          .eq('tenant_id', ctx.tenantId)
          .in('id', createdTeamIds);
      }
    } catch (e) {
      logger.error('[quick-bracket] NEEDS_REVIEW cleanup failed', {
        reason,
        tournamentId,
        stageId,
        createdTeamIds,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  try {
    // ---- 1) Tournoi minimal publié ----
    // game=null (évite tournaments_game_check), visibility public, status
    // published, format_type = le format demandé. Slug unique (pas de trigger
    // DB côté tournaments, contrairement à teams).
    const baseSlug =
      slugify(name, { lower: true, strict: true }) || 'quick-bracket';
    let slug = baseSlug;
    for (let attempt = 2; attempt <= 50; attempt++) {
      const { data: clash } = await supabaseAdmin
        .from('tournaments')
        .select('id')
        .eq('tenant_id', ctx.tenantId)
        .eq('slug', slug)
        .maybeSingle();
      if (!clash) break;
      slug = `${baseSlug}-${attempt}`;
    }

    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .insert({
        tenant_id: ctx.tenantId,
        name,
        slug,
        game: null,
        status: 'published',
        visibility: 'public',
        format_type: format,
        description_info: 'Quick bracket',
      })
      .select('id, slug')
      .maybeSingle();

    if (tErr || !tournament) {
      logger.error('[quick-bracket] tournament insert error', tErr);
      return res.status(500).json({ error: 'Échec de création du tournoi.' });
    }
    tournamentId = tournament.id as string;
    const finalSlug = (tournament.slug as string) ?? slug;

    // ---- 2) Teams shell (1 par participant) ----
    // Insert SÉQUENTIEL : laisse le trigger DB `teams_set_slug()` voir les
    // lignes déjà committées et désambiguïser les slugs (-2, -3, …). Un insert
    // batch pourrait produire une collision de slug intra-statement.
    for (const pName of participants) {
      const { data: team, error: teamErr } = await supabaseAdmin
        .from('teams')
        .insert({
          tenant_id: ctx.tenantId,
          name: pName,
          is_active: true,
          is_joinable: false,
          captain_id: null,
        })
        .select('id')
        .maybeSingle();

      if (teamErr || !team) {
        logger.error('[quick-bracket] shell team insert error', teamErr);
        await cleanup('shell-team-insert-failed');
        return res
          .status(500)
          .json({ error: `Échec de création de l'équipe « ${pName} ».` });
      }
      createdTeamIds.push(team.id as string);
    }

    // ---- 3a) tournament_teams (status registered) ----
    const ttRows = createdTeamIds.map((teamId) => ({
      tenant_id: ctx.tenantId,
      tournament_id: tournamentId as string,
      team_id: teamId,
      status: 'registered' as const,
    }));
    const { error: ttErr } = await supabaseAdmin
      .from('tournament_teams')
      .insert(ttRows);
    if (ttErr) {
      logger.error('[quick-bracket] tournament_teams insert error', ttErr);
      await cleanup('tournament-teams-insert-failed');
      return res
        .status(500)
        .json({ error: "Échec de l'inscription des équipes au tournoi." });
    }

    // ---- 3b) Stage bracket ----
    const bracketType =
      format === 'double_elim' ? 'double_elim' : 'single_elim';
    const { data: stage, error: sErr } = await supabaseAdmin
      .from('tournament_stages')
      .insert({
        tenant_id: ctx.tenantId,
        tournament_id: tournamentId as string,
        name: 'Bracket',
        slug: 'bracket',
        stage_type: 'bracket',
        order_index: 0,
        is_active: true,
        is_public: true,
        settings: {
          bracket_type: bracketType,
          bracket_size: size,
          seeding_method: 'manual',
        },
      })
      .select('id')
      .maybeSingle();

    if (sErr || !stage) {
      logger.error('[quick-bracket] stage insert error', sErr);
      await cleanup('stage-insert-failed');
      return res
        .status(500)
        .json({ error: 'Échec de création de la phase bracket.' });
    }
    stageId = stage.id as string;

    // ---- 3c) stage_teams (seed = ordre de collage 1..N) ----
    const stRows = createdTeamIds.map((teamId, idx) => ({
      tenant_id: ctx.tenantId,
      stage_id: stageId as string,
      team_id: teamId,
      seed: idx + 1,
      is_substitute: false,
      notes: null,
    }));
    const { error: stErr } = await supabaseAdmin
      .from('stage_teams')
      .insert(stRows);
    if (stErr) {
      logger.error('[quick-bracket] stage_teams insert error', stErr);
      await cleanup('stage-teams-insert-failed');
      return res
        .status(500)
        .json({ error: "Échec de l'enregistrement des seeds." });
    }

    // ---- 4) Génération du bracket (moteur partagé) ----
    const genResult =
      format === 'double_elim'
        ? await generateDoubleElim({
            tenantId: ctx.tenantId,
            tournamentId: tournamentId as string,
            stageId,
            size,
            bestOf: bestOf ?? 3,
          })
        : await generateSingleElim({
            tenantId: ctx.tenantId,
            tournamentId: tournamentId as string,
            stageId,
            size,
            bestOf: bestOf ?? 3,
          });

    if (!genResult.ok) {
      logger.error(
        '[quick-bracket] bracket generation failed',
        genResult.error
      );
      await cleanup('bracket-generation-failed');
      return res.status(500).json({ error: genResult.error });
    }

    // ---- 5) Seed round 1 (ordre de collage) + byes ----
    const seedResult = await seedRoundOne({
      tenantId: ctx.tenantId,
      stageId,
      orderedTeamIds: createdTeamIds,
    });

    // ---- 6) Log staff ----
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'create_tournament',
          entity_type: 'tournament',
          entity_id: tournamentId as string,
          tournament_id: tournamentId as string,
          payload: {
            mode: 'quick_bracket',
            format,
            participant_count: n,
            bracket_size: size,
            match_count: genResult.matchIds.length,
            seeded_count: seedResult.seededMatchIds.length,
            bye_count: seedResult.byeMatchIds.length,
          },
        });
      } catch (e) {
        logger.error('[quick-bracket] logStaffAction error', e);
      }
    }

    return res.status(201).json({
      tournamentId: tournamentId as string,
      slug: finalSlug,
    });
  } catch (err) {
    logger.error('[quick-bracket] internal error', err);
    await cleanup('internal-error');
    return res.status(500).json({ error: 'Internal server error' });
  }
}
