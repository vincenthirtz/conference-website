// pages/api/admin/matches/[matchId]/lineup.ts
//
// Feuille de match, côté ORGANISATION.
//
//   GET  → les deux feuilles du match (état, composition, qui a validé)
//   POST → valide (ou rouvre) la feuille d'une équipe à sa place
//
// Pourquoi une route séparée de celle des équipes : le jour du tournoi, une
// équipe injoignable ne doit pas bloquer la suite. Mais une feuille validée par
// l'organisation n'engage PAS l'équipe de la même façon — d'où
// `validated_by_kind = 'admin'`, qui rend la distinction lisible en cas de
// litige. Les fusionner sous un même « validée » rendrait toute contestation
// ininterprétable.
//
// Accès : staff (withStaffRoute, minRole admin).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withStaffRoute } from '@/utils/staff';
import type { AuthenticatedStaffContext } from '@/types/staff';
import { logStaffAction } from '@/utils/staffLogs';
import {
  lineupOpenState,
  eligibleForLineup,
  validateLineup,
  type LineupStatus,
} from '@/utils/matches/lineup';

import { logger } from '../../../../../utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  { staff, user, tenantId }: AuthenticatedStaffContext
) {
  const method = (req.method || 'GET').toUpperCase();
  if (!['GET', 'POST'].includes(method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (applyRateLimit(req, res, { max: 60, windowMs: 60_000 }, 'admin-lineup'))
    return;
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const matchId = String(req.query.matchId || '');
  if (!isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide.' });
  }

  const { data: match } = await supabaseAdmin
    .from('matches')
    .select(
      'id, tournament_id, status, team1_id, team2_id, team1_checked_in_at, team2_checked_in_at, scheduled_at'
    )
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!match) return res.status(404).json({ error: 'Match introuvable.' });

  const teamIds = [match.team1_id, match.team2_id].filter(
    (t): t is string => !!t
  );

  /* -------------------------------------------------------------------- GET */
  if (method === 'GET') {
    const [{ data: headers }, { data: picked }, { data: teams }] =
      await Promise.all([
        supabaseAdmin
          .from('match_lineups')
          .select('team_id, status, validated_at, validated_by_kind')
          .eq('match_id', matchId),
        supabaseAdmin
          .from('match_participants')
          .select('team_id, user_id, battle_tag, role, is_substitute')
          .eq('tenant_id', tenantId)
          .eq('match_id', matchId),
        supabaseAdmin
          .from('teams')
          .select('id, name')
          .in(
            'id',
            teamIds.length ? teamIds : ['00000000-0000-0000-0000-000000000000']
          ),
      ]);

    const headerByTeam = new Map(
      ((headers || []) as { team_id: string }[]).map((h) => [h.team_id, h])
    );
    const nameByTeam = new Map(
      ((teams || []) as { id: string; name: string }[]).map((t) => [
        t.id,
        t.name,
      ])
    );

    return res.status(200).json({
      match: {
        id: match.id,
        scheduledAt: match.scheduled_at,
        status: match.status,
      },
      lineups: teamIds.map((teamId) => {
        const h = headerByTeam.get(teamId) as
          | {
              status?: string;
              validated_at?: string | null;
              validated_by_kind?: string | null;
            }
          | undefined;
        const open = lineupOpenState(match, teamId);
        return {
          teamId,
          teamName: nameByTeam.get(teamId) ?? null,
          open: open.open,
          closedReason: open.open ? null : open.reason,
          status: (h?.status as LineupStatus) ?? 'draft',
          validatedAt: h?.validated_at ?? null,
          validatedByKind: h?.validated_by_kind ?? null,
          players: ((picked || []) as { team_id: string }[]).filter(
            (p) => p.team_id === teamId
          ),
        };
      }),
    });
  }

  /* ------------------------------------------------------------------- POST */
  const { teamId, starters, reopen } = req.body || {};
  if (!isValidUUID(String(teamId || '')) || !teamIds.includes(String(teamId))) {
    return res
      .status(400)
      .json({ error: 'teamId absent ou étranger à ce match.' });
  }

  // Rouvrir : le SEUL geste qui défige une feuille validée. Réservé au staff,
  // parce qu'une composition qu'une équipe peut réécrire après coup ne prouve
  // rien (cf. canEditLineup).
  if (reopen === true) {
    const { error } = await supabaseAdmin
      .from('match_lineups')
      .update({
        status: 'draft',
        validated_by: null,
        validated_by_kind: null,
        validated_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('match_id', matchId)
      .eq('team_id', teamId);
    if (error) {
      logger.error('[admin/lineup] reopen error', error);
      return res.status(500).json({ error: 'Échec de la réouverture.' });
    }
    await logStaffAction({
      staff_id: staff.id,
      action: 'reopen_match_lineup',
      entity_type: 'match',
      entity_id: matchId,
      tenant_id: tenantId,
      payload: { team_id: teamId },
    });
    return res.status(200).json({ status: 'draft' });
  }

  // Validation à la place de l'équipe. Le check-in reste la porte : valider une
  // composition d'une équipe qui ne s'est pas présentée n'aurait aucun sens —
  // c'est le forfait qui répond à ce cas.
  const open = lineupOpenState(match, String(teamId));
  if (!open.open) {
    return res.status(409).json({
      error:
        open.reason === 'awaiting_checkin'
          ? "Cette équipe n'a pas fait son check-in."
          : 'La feuille est close pour ce match.',
      code: open.reason,
    });
  }

  const { data: memberRows } = await supabaseAdmin
    .from('team_members')
    .select('user_id, role, battle_tag, is_substitute')
    .eq('team_id', teamId)
    .eq('tenant_id', tenantId);

  const eligible = eligibleForLineup(
    (memberRows || []) as {
      user_id: string | null;
      role: string | null;
      battle_tag: string | null;
      is_substitute: boolean | null;
    }[]
  );

  let proposed: string[];
  if (Array.isArray(starters)) {
    proposed = starters.map((v: unknown) => String(v));
  } else {
    const { data: picked } = await supabaseAdmin
      .from('match_participants')
      .select('user_id')
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId)
      .eq('team_id', teamId);
    proposed = ((picked || []) as { user_id: string | null }[])
      .map((p) => p.user_id)
      .filter((id): id is string => !!id);
  }

  const check = validateLineup(
    proposed,
    eligible.map((m) => m.user_id as string)
  );
  if (!check.ok) {
    return res
      .status(400)
      .json({ error: 'Composition invalide.', code: check.error });
  }

  if (Array.isArray(starters)) {
    const byUserId = new Map(eligible.map((m) => [m.user_id as string, m]));
    await supabaseAdmin
      .from('match_participants')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId)
      .eq('team_id', teamId);
    const { error: insErr } = await supabaseAdmin
      .from('match_participants')
      .insert(
        check.starters.map((uid) => {
          const m = byUserId.get(uid);
          return {
            tenant_id: tenantId,
            match_id: matchId,
            tournament_id: match.tournament_id ?? null,
            team_id: teamId,
            user_id: uid,
            battle_tag: m?.battle_tag ?? null,
            role: m?.role ?? null,
            is_substitute: !!m?.is_substitute,
          };
        })
      );
    if (insErr) {
      logger.error('[admin/lineup] insert participants error', insErr);
      return res.status(500).json({ error: "Échec de l'enregistrement." });
    }
  }

  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabaseAdmin.from('match_lineups').upsert(
    {
      tenant_id: tenantId,
      match_id: matchId,
      team_id: teamId,
      status: 'validated',
      validated_by: user.id,
      validated_by_kind: 'admin',
      validated_at: nowIso,
      updated_at: nowIso,
    },
    { onConflict: 'match_id,team_id' }
  );
  if (upErr) {
    logger.error('[admin/lineup] upsert header error', upErr);
    return res.status(500).json({ error: 'Échec de la validation.' });
  }

  await logStaffAction({
    staff_id: staff.id,
    action: 'validate_match_lineup',
    entity_type: 'match',
    entity_id: matchId,
    tenant_id: tenantId,
    payload: { team_id: teamId, starters: check.starters.length },
  });

  return res.status(200).json({
    status: 'validated',
    validatedByKind: 'admin',
    validatedAt: nowIso,
    starters: check.starters,
  });
}

export default withStaffRoute(handler, { permission: 'arbitrate_matches' });
