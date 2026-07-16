// pages/api/admin/stages/[stageId]/clone.ts
// Admin: cloner une phase (stage) avec optionnellement ses matchs
// - POST : créer une copie de la phase (et ses matchs si demandé)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'stage-clone' }),
  'admin'
);

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: AuthenticatedStaffContext) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const id = String(stageId);

  try {
    // 1. Fetch the source stage
    const { data: source, error: fetchErr } = await supabaseAdmin
      .from('tournament_stages')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (fetchErr || !source) {
      return res.status(404).json({ error: 'Stage not found' });
    }

    const { includeMatches = false, name, targetTournamentId } = req.body || {};

    const tournamentId = targetTournamentId || source.tournament_id;

    // 2. Compute next order_index
    const { data: existingStages } = await supabaseAdmin
      .from('tournament_stages')
      .select('order_index')
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: false })
      .limit(1);

    const maxOrder = existingStages?.[0]?.order_index ?? -1;
    const nextOrder = (typeof maxOrder === 'number' ? maxOrder : -1) + 1;

    const cloneName = name || `${source.name} (copie)`;
    const cloneSlug = `${source.slug || source.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-copy-${Date.now()}`;

    // 3. Insert cloned stage
    const { data: cloned, error: insertErr } = await supabaseAdmin
      .from('tournament_stages')
      .insert({
        tenant_id: ctx.tenantId,
        tournament_id: tournamentId,
        name: cloneName,
        slug: cloneSlug,
        stage_type: source.stage_type,
        order_index: nextOrder,
        is_active: false,
        is_public: false,
        start_date: source.start_date,
        end_date: source.end_date,
        settings: source.settings,
      })
      .select('*')
      .single();

    if (insertErr || !cloned) {
      logger.error('clone stage insert error:', insertErr);
      return res.status(500).json({ error: 'Failed to clone stage' });
    }

    let clonedMatchCount = 0;

    // 4. Optionally clone matches
    if (includeMatches) {
      const { data: sourceMatches, error: matchErr } = await supabaseAdmin
        .from('matches')
        .select('*')
        .eq('tenant_id', ctx.tenantId)
        .eq('stage_id', id);

      if (!matchErr && sourceMatches && sourceMatches.length > 0) {
        const now = new Date().toISOString();

        // Build match ID mapping for bracket links
        const oldToNew = new Map<string, string>();

        // First pass: prepare all matches with new IDs (let DB generate them)
        const matchPayloads = sourceMatches.map((m: any) => ({
          tenant_id: ctx.tenantId,
          tournament_id: tournamentId,
          stage_id: cloned.id,
          status: 'pending',
          is_bye: m.is_bye ?? false,
          match_format: m.match_format,
          round_name: m.round_name,
          round_number: m.round_number,
          bracket_side: m.bracket_side,
          group_key: m.group_key,
          best_of: m.best_of,
          team1_id: m.team1_id,
          team2_id: m.team2_id,
          team1_score: null,
          team2_score: null,
          winner_team_id: null,
          scheduled_at: m.scheduled_at,
          completed_at: null,
          stream_url: null,
          lobby_code: null,
          notes: m.notes,
          // Bracket links will be patched in second pass
          next_match_win_id: null,
          next_match_win_slot: m.next_match_win_slot,
          next_match_lose_id: null,
          next_match_lose_slot: m.next_match_lose_slot,
          created_at: now,
          updated_at: null,
        }));

        const { data: inserted, error: insertMatchErr } = await supabaseAdmin
          .from('matches')
          .insert(matchPayloads)
          .select('id');

        if (!insertMatchErr && inserted) {
          clonedMatchCount = inserted.length;

          // Map old IDs to new IDs (insertion order matches source order)
          sourceMatches.forEach((m: any, i: number) => {
            if (inserted[i]) {
              oldToNew.set(m.id, inserted[i].id);
            }
          });

          // Second pass: update bracket links
          const updates: Array<{
            id: string;
            next_match_win_id: string | null;
            next_match_lose_id: string | null;
          }> = [];
          for (const m of sourceMatches) {
            const newId = oldToNew.get(m.id);
            if (!newId) continue;

            const newWinId = m.next_match_win_id
              ? (oldToNew.get(m.next_match_win_id) ?? null)
              : null;
            const newLoseId = m.next_match_lose_id
              ? (oldToNew.get(m.next_match_lose_id) ?? null)
              : null;

            if (newWinId || newLoseId) {
              updates.push({
                id: newId,
                next_match_win_id: newWinId,
                next_match_lose_id: newLoseId,
              });
            }
          }

          // Batch update bracket links
          for (const u of updates) {
            await supabaseAdmin
              .from('matches')
              .update({
                next_match_win_id: u.next_match_win_id,
                next_match_lose_id: u.next_match_lose_id,
              })
              .eq('id', u.id)
              .eq('tenant_id', ctx.tenantId);
          }
        }
      }
    }

    // 5. Also clone stage_teams if they exist
    const { data: stageTeams } = await supabaseAdmin
      .from('stage_teams')
      .select('*')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', id);

    if (stageTeams && stageTeams.length > 0) {
      const teamPayloads = stageTeams.map((st: any) => ({
        tenant_id: ctx.tenantId,
        stage_id: cloned.id,
        team_id: st.team_id,
        seed: st.seed,
      }));

      await supabaseAdmin.from('stage_teams').insert(teamPayloads);
    }

    // 6. Log
    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'clone_stage',
          entity_type: 'stage',
          entity_id: cloned.id,
          tournament_id: tournamentId,
          payload: {
            source_stage_id: id,
            clone_name: cloneName,
            include_matches: includeMatches,
            cloned_match_count: clonedMatchCount,
          },
        });
      } catch (e) {
        logger.error('logStaffAction clone_stage error:', e);
      }
    }

    return res.status(201).json({
      stage: cloned,
      clonedMatchCount,
    });
  } catch (err: unknown) {
    logger.error('[/api/admin/stages/[stageId]/clone] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}
