// features/admin/tournaments/service/quickBracket.ts — « quick bracket » :
// un tournoi jouable complet à partir d'un nom + format + liste collée.
//
// Pas de moteur « participants nus » : chaque participant devient une `teams`
// SHELL (sans roster ni capitaine), puis le flux bracket NORMAL tourne dessus
// (matches, propagation, UI, embeds gratuits ; les shells SONT de vraies
// équipes). En cas d'échec, nettoyage best-effort de ce qui a été créé.

import slugify from 'slugify';
import { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';
import {
  generateDoubleElim,
  generateSingleElim,
  seedRoundOne,
} from '@/utils/bracket/generateBracket';
import type { Audited } from '../../_shared/audited';
import * as repo from '../repository/quickBracket';

const bodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  format: z.enum(['single_elim', 'double_elim']),
  // Tableau de chaînes OU une chaîne (multi-lignes / CSV).
  participants: z.union([z.array(z.string()), z.string()]),
  bestOf: z.number().int().min(1).max(15).optional(),
});

/** Tableau OU texte (retours ligne, virgules, points-virgules) ; trim, sans vides. */
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

export async function createQuickBracket(
  ctx: ServiceContext,
  raw: unknown
): Promise<Audited<{ tournamentId: string; slug: string }>> {
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue.path.join('.');
    throw new LegacyAdminError(
      400,
      `Champ invalide${path ? ` (${path})` : ''} : ${issue.message}`
    );
  }
  const { name, format, bestOf } = parsed.data;
  const participants = parseParticipants(parsed.data.participants);

  // Doublons (insensible à la casse) → 400 qui les nomme.
  const seen = new Map<string, string>();
  const dupes = new Set<string>();
  for (const p of participants) {
    const key = p.toLowerCase();
    if (seen.has(key)) dupes.add(seen.get(key) as string);
    else seen.set(key, p);
  }
  if (dupes.size > 0) {
    throw new LegacyAdminError(
      400,
      `Participants en double (insensible à la casse) : ${[...dupes].join(', ')}. Chaque participant doit être unique.`
    );
  }
  if (participants.length < 2 || participants.length > 32) {
    throw new LegacyAdminError(
      400,
      `Le nombre de participants doit être compris entre 2 et 32 (reçu : ${participants.length}).`
    );
  }

  const { db, tenantId } = ctx;
  const n = participants.length;
  const size = bracketSizeFor(n);

  let tournamentId: string | null = null;
  let stageId: string | null = null;
  const createdTeamIds: string[] = [];

  const fail = async (reason: string, message: string): Promise<never> => {
    try {
      await repo.deleteQuickBracket(db, tenantId, {
        tournamentId,
        stageId,
        teamIds: createdTeamIds,
      });
    } catch (e) {
      ctx.logger.error('[quick-bracket] NEEDS_REVIEW cleanup failed', {
        reason,
        tournamentId,
        stageId,
        createdTeamIds,
        error: e instanceof Error ? e.message : String(e),
      });
    }
    throw new LegacyAdminError(500, message);
  };

  try {
    // 1) Tournoi minimal publié. game=null (évite tournaments_game_check),
    //    slug unique (pas de trigger DB côté tournaments).
    const baseSlug =
      slugify(name, { lower: true, strict: true }) || 'quick-bracket';
    let slug = baseSlug;
    for (let attempt = 2; attempt <= 50; attempt++) {
      if (!(await repo.tournamentSlugTaken(db, tenantId, slug))) break;
      slug = `${baseSlug}-${attempt}`;
    }

    const { row: tournament, error: tErr } = await repo.insertTournament(db, {
      tenant_id: tenantId,
      name,
      slug,
      game: null,
      status: 'published',
      visibility: 'public',
      format_type: format,
      description_info: 'Quick bracket',
    } as Parameters<typeof repo.insertTournament>[1]);
    if (tErr || !tournament) {
      ctx.logger.error('[quick-bracket] tournament insert error', tErr);
      throw new LegacyAdminError(500, 'Échec de création du tournoi.');
    }
    tournamentId = tournament.id as string;
    const finalSlug = (tournament.slug as string) ?? slug;

    // 2) Équipes shell. SÉQUENTIEL : le trigger `teams_set_slug()` voit les
    //    lignes déjà committées et désambiguïse les slugs.
    for (const pName of participants) {
      const { row: team, error: teamErr } = await repo.insertShellTeam(db, {
        tenant_id: tenantId,
        name: pName,
        is_active: true,
        is_joinable: false,
        captain_id: null,
      } as Parameters<typeof repo.insertShellTeam>[1]);
      if (teamErr || !team) {
        ctx.logger.error('[quick-bracket] shell team insert error', teamErr);
        await fail(
          'shell-team-insert-failed',
          `Échec de création de l'équipe « ${pName} ».`
        );
      }
      createdTeamIds.push(team!.id as string);
    }

    // 3a) Inscriptions.
    const { error: ttErr } = await repo.insertTournamentTeams(
      db,
      createdTeamIds.map((teamId) => ({
        tenant_id: tenantId,
        tournament_id: tournamentId as string,
        team_id: teamId,
        status: 'registered' as const,
      }))
    );
    if (ttErr) {
      ctx.logger.error('[quick-bracket] tournament_teams insert error', ttErr);
      await fail(
        'tournament-teams-insert-failed',
        "Échec de l'inscription des équipes au tournoi."
      );
    }

    // 3b) Phase bracket.
    const { row: stage, error: sErr } = await repo.insertStage(db, {
      tenant_id: tenantId,
      tournament_id: tournamentId as string,
      name: 'Bracket',
      slug: 'bracket',
      stage_type: 'bracket',
      order_index: 0,
      is_active: true,
      is_public: true,
      settings: {
        bracket_type: format === 'double_elim' ? 'double_elim' : 'single_elim',
        bracket_size: size,
        seeding_method: 'manual',
      },
    } as Parameters<typeof repo.insertStage>[1]);
    if (sErr || !stage) {
      ctx.logger.error('[quick-bracket] stage insert error', sErr);
      await fail(
        'stage-insert-failed',
        'Échec de création de la phase bracket.'
      );
    }
    stageId = stage!.id as string;

    // 3c) Seeds = ordre de collage 1..N.
    const { error: stErr } = await repo.insertStageTeams(
      db,
      createdTeamIds.map((teamId, idx) => ({
        tenant_id: tenantId,
        stage_id: stageId as string,
        team_id: teamId,
        seed: idx + 1,
        is_substitute: false,
        notes: null,
      }))
    );
    if (stErr) {
      ctx.logger.error('[quick-bracket] stage_teams insert error', stErr);
      await fail(
        'stage-teams-insert-failed',
        "Échec de l'enregistrement des seeds."
      );
    }

    // 4) Génération (moteur partagé).
    const genInput = {
      tenantId,
      tournamentId: tournamentId as string,
      stageId: stageId as string,
      size,
      bestOf: bestOf ?? 3,
    };
    const genResult =
      format === 'double_elim'
        ? await generateDoubleElim(genInput)
        : await generateSingleElim(genInput);
    if (!genResult.ok) {
      ctx.logger.error(
        '[quick-bracket] bracket generation failed',
        genResult.error
      );
      return await fail('bracket-generation-failed', genResult.error);
    }

    // 5) Seed du round 1 (ordre de collage) + byes.
    const seedResult = await seedRoundOne({
      tenantId,
      stageId: stageId as string,
      orderedTeamIds: createdTeamIds,
    });

    return {
      result: { tournamentId: tournamentId as string, slug: finalSlug },
      audit: {
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
      },
    };
  } catch (err) {
    // Échec métier déjà nettoyé (`fail`), ou tournoi jamais créé.
    if (err instanceof LegacyAdminError) throw err;
    ctx.logger.error('[quick-bracket] internal error', err);
    await fail('internal-error', 'Internal server error');
    throw err;
  }
}
