// pages/api/admin/stages/[stageId]/rating-seed.ts
// POST { method?: 'rating'|'rating_sos', pattern?: 'standard'|'sequential', sosWeight?: number }
//
// Apply counterpart of /rating-seeding-preview. Seeds the initial bracket from
// team RATINGS + optional cross-event SoS (no qualifier stage). Reuses the same
// pure engines and the shared compute helper so preview == apply.
//
// Lock guard : refuses re-seed once a round-1 match is ongoing/finished/walkover
// (409). Snapshots the bracket best-effort before mutating.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { createBracketSnapshot } from '@/utils/bracket/snapshot';
import { isValidUUID } from '@/utils/apiHelpers';
import { type ProposedSlot, type SeedingPattern } from '@/utils/stages/autoSeed';
import { type SeedingMethod } from '@/utils/seeding/ratingSeeding';
import { computeRatingSeedingForStage } from './rating-seeding-preview';
import { logger } from '../../../../../utils/logger';

type ApiResponse =
  | {
      seeded: ProposedSlot[];
      totalMatches: number;
      method: SeedingMethod;
      pattern: SeedingPattern;
    }
  | { error: string };

const bodySchema = z.object({
  method: z.enum(['rating', 'rating_sos']).optional(),
  pattern: z.enum(['standard', 'sequential']).optional(),
  sosWeight: z.number().finite().optional(),
});

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'stage-rating-seed' }),
  'admin'
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

  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' });
  }

  const targetStageId = String(stageId);
  const method: SeedingMethod = parsed.data.method ?? 'rating_sos';
  const pattern: SeedingPattern = parsed.data.pattern ?? 'standard';
  const sosWeight = parsed.data.sosWeight;

  try {
    // Compute proposed seeding from ratings + SoS (shared with preview).
    const result = await computeRatingSeedingForStage({
      client: supabaseAdmin,
      tenantId: ctx.tenantId,
      stageId: targetStageId,
      method,
      pattern,
      sosWeight,
    });

    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    if (result.bracketMatches.length === 0) {
      return res.status(400).json({
        error:
          "Aucun match de round 1 dans le bracket cible. Generez le bracket d'abord.",
      });
    }

    // Lock guard : refuse re-seed once a round-1 match is live or done.
    if (result.lock.locked) {
      return res.status(409).json({
        error:
          result.lock.reasons[0] ??
          'Impossible de re-seed : des matchs du round 1 sont déjà joués ou en cours.',
      });
    }

    // Need the tournament id for the audit log.
    const { data: stage } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, tournament_id')
      .eq('id', targetStageId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    // Snapshot bracket before mutation (best-effort).
    void createBracketSnapshot({
      stageId: targetStageId,
      reason: 'rating_seed',
      staffId: ctx.staff?.id ?? null,
      tenantId: ctx.tenantId,
    }).catch((e) =>
      logger.error('rating-seed: createBracketSnapshot failed', e)
    );

    const updates = result.proposed;

    // Apply slot assignments.
    for (const u of updates) {
      const field = u.slot === 1 ? 'team1_id' : 'team2_id';
      const { error: updErr } = await supabaseAdmin
        .from('matches')
        .update({ [field]: u.teamId })
        .eq('id', u.matchId)
        .eq('tenant_id', ctx.tenantId);
      if (updErr) {
        logger.error('rating-seed update error:', updErr);
      }
    }

    // Upsert stage_teams : set seed = computed rank for every seeded team
    // (insert missing rows, update existing seeds).
    const rankByTeam = new Map<string, number>();
    for (const s of result.breakdown) rankByTeam.set(s.teamId, s.rank);

    const { data: existingTeams } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', targetStageId);
    const existingIds = new Set(
      ((existingTeams ?? []) as { team_id: string }[]).map((t) => t.team_id)
    );

    const inserts: {
      tenant_id: string;
      stage_id: string;
      team_id: string;
      seed: number;
      is_substitute: boolean;
      notes: null;
    }[] = [];
    for (const [teamId, rank] of rankByTeam) {
      if (existingIds.has(teamId)) {
        // Update existing seed to the computed rank.
        const { error: seedErr } = await supabaseAdmin
          .from('stage_teams')
          .update({ seed: rank })
          .eq('tenant_id', ctx.tenantId)
          .eq('stage_id', targetStageId)
          .eq('team_id', teamId);
        if (seedErr) {
          logger.error('rating-seed seed update error:', seedErr);
        }
      } else {
        inserts.push({
          tenant_id: ctx.tenantId,
          stage_id: targetStageId,
          team_id: teamId,
          seed: rank,
          is_substitute: false,
          notes: null,
        });
      }
    }
    if (inserts.length > 0) {
      await supabaseAdmin.from('stage_teams').insert(inserts);
    }

    // Audit log.
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'auto_seed_bracket',
          entity_type: 'stage',
          entity_id: targetStageId,
          tournament_id: stage?.tournament_id ?? null,
          tenant_id: ctx.tenantId,
          payload: {
            method,
            pattern,
            seeded_count: updates.length,
            source: 'rating',
          },
        });
      } catch (e) {
        logger.error('rating-seed logStaffAction error:', e);
      }
    }

    return res.status(200).json({
      seeded: updates,
      totalMatches: result.bracketMatches.length,
      method,
      pattern,
    });
  } catch (err) {
    logger.error('[/api/admin/stages/[stageId]/rating-seed] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
