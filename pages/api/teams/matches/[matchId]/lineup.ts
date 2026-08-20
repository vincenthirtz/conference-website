// pages/api/teams/matches/[matchId]/lineup.ts
//
// Feuille de match, côté ÉQUIPE.
//
//   GET   → l'état de la feuille + le roster éligible + la composition actuelle
//   PUT   → enregistre la composition (brouillon)
//   POST  → valide (et enregistre au passage si `starters` est fourni)
//
// Pourquoi cette route existe : `match_participants` était rempli APRÈS coup
// par `snapshotMatchParticipants`, qui fige le roster COURANT au moment de la
// saisie du score. Personne n'avait jamais déclaré qui jouait. Ici, l'équipe le
// déclare — et le déclare AVANT, ce qui est la seule façon que ça vaille
// quelque chose.
//
// La porte est le CHECK-IN (cf. utils/matches/lineup.ts) : composer sans avoir
// confirmé sa présence n'engage à rien.
//
// Accès : permission d'équipe `validate_lineup` — capitaine, manager, coach.
// C'est le geste qui définit le métier de coach, d'où sa présence dans le rôle
// par défaut (utils/teamRoles.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { withSubjectRoute } from '@/utils/subject';
import {
  assertTeamPermission,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import { getManagedTeamForRequest } from '@/utils/teams/teamScope';
import {
  lineupOpenState,
  eligibleForLineup,
  validateLineup,
  canEditLineup,
  type LineupStatus,
} from '@/utils/matches/lineup';
import { resolveMissingDisplayNames } from '@/utils/teams/memberDisplayName';

import { logger } from '../../../../../utils/logger';

/** Messages des refus d'ouverture — le code dit lequel, la route dit quoi. */
const CLOSED_MESSAGE: Record<string, string> = {
  not_in_match: 'Ton équipe ne joue pas ce match.',
  match_over: 'Ce match est terminé : la feuille est close.',
  awaiting_checkin:
    "La feuille s'ouvre une fois le check-in de ton équipe effectué.",
};

/** Messages de refus de composition. */
const INVALID_MESSAGE: Record<string, string> = {
  empty: 'Aligne au moins une joueuse.',
  too_many: 'Trop de joueuses alignées pour ce format.',
  not_eligible:
    "Une des personnes sélectionnées n'est pas dans le roster jouant de l'équipe.",
  duplicate: 'La même joueuse est alignée deux fois.',
};

export default withSubjectRoute(
  async function handler(
    req: NextApiRequest,
    res: NextApiResponse,
    { subject }
  ) {
    const method = (req.method || 'GET').toUpperCase();
    if (!['GET', 'PUT', 'POST'].includes(method)) {
      res.setHeader('Allow', 'GET, PUT, POST');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    if (applyRateLimit(req, res, { max: 30, windowMs: 60_000 }, 'match-lineup'))
      return;

    if (!supabaseAdmin) {
      return res.status(503).json({ error: 'Service indisponible.' });
    }

    const matchId = String(req.query.matchId || '');
    if (!isValidUUID(matchId)) {
      return res.status(400).json({ error: 'matchId invalide.' });
    }

    const { userId, tenantId } = subject;

    const access = await getManagedTeamForRequest(req, userId, tenantId);
    if (!access) {
      return res.status(403).json({ error: TEAM_MANAGEMENT_FORBIDDEN });
    }
    const denied = assertTeamPermission(access, 'validate_lineup');
    if (denied) return res.status(denied.status).json({ error: denied.error });

    const teamId = access.teamId;

    const { data: match, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select(
        'id, tournament_id, status, team1_id, team2_id, team1_checked_in_at, team2_checked_in_at, scheduled_at'
      )
      .eq('id', matchId)
      .eq('tenant_id', tenantId)
      .is('deleted_at', null)
      .maybeSingle();

    if (matchErr || !match) {
      return res.status(404).json({ error: 'Match introuvable.' });
    }

    const openState = lineupOpenState(match, teamId);

    // Roster jouant : l'encadrement n'entre pas en jeu (cf. eligibleForLineup).
    const { data: memberRows, error: membersErr } = await supabaseAdmin
      .from('team_members')
      .select('user_id, role, display_name, battle_tag, is_substitute')
      .eq('team_id', teamId)
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });

    if (membersErr) {
      logger.error('[teams/lineup] members error', membersErr);
      return res.status(500).json({ error: 'Erreur de lecture du roster.' });
    }

    const eligible = eligibleForLineup(
      (memberRows || []) as {
        user_id: string | null;
        role: string | null;
        display_name: string | null;
        battle_tag: string | null;
        is_substitute: boolean | null;
      }[]
    );
    const eligibleIds = eligible.map((m) => m.user_id as string);

    // En-tête + composition actuelles.
    const [{ data: header }, { data: picked }] = await Promise.all([
      supabaseAdmin
        .from('match_lineups')
        .select('status, validated_at, validated_by, validated_by_kind')
        .eq('match_id', matchId)
        .eq('team_id', teamId)
        .maybeSingle(),
      supabaseAdmin
        .from('match_participants')
        .select('user_id')
        .eq('tenant_id', tenantId)
        .eq('match_id', matchId)
        .eq('team_id', teamId),
    ]);

    const status = ((header?.status as LineupStatus) ??
      'draft') as LineupStatus;
    const currentStarters = ((picked || []) as { user_id: string | null }[])
      .map((p) => p.user_id)
      .filter((id): id is string => !!id);

    /* ------------------------------------------------------------------ GET */
    if (method === 'GET') {
      const names = await resolveMissingDisplayNames(eligible);
      return res.status(200).json({
        match: {
          id: match.id,
          scheduledAt: match.scheduled_at,
          status: match.status,
        },
        open: openState.open,
        closedReason: openState.open ? null : openState.reason,
        closedMessage: openState.open ? null : CLOSED_MESSAGE[openState.reason],
        teamId,
        status,
        validatedAt: header?.validated_at ?? null,
        validatedByKind: header?.validated_by_kind ?? null,
        editable: canEditLineup(status),
        starters: currentStarters,
        eligible: eligible.map((m) => ({
          userId: m.user_id,
          displayName:
            m.display_name ||
            names.get(m.user_id as string) ||
            m.battle_tag ||
            null,
          battleTag: m.battle_tag,
          role: m.role,
          isSubstitute: !!m.is_substitute,
        })),
      });
    }

    /* ------------------------------------------------------- PUT  /  POST */
    if (!openState.open) {
      return res
        .status(409)
        .json({
          error: CLOSED_MESSAGE[openState.reason],
          code: openState.reason,
        });
    }

    // Une feuille validée est figée : la rouvrir demande un admin (cf.
    // canEditLineup). Sans ça, une composition se réécrirait après le match et
    // ne prouverait plus rien.
    if (!canEditLineup(status)) {
      return res.status(409).json({
        error:
          'Feuille déjà validée. Demande au staff du tournoi de la rouvrir.',
        code: 'ALREADY_VALIDATED',
      });
    }

    const rawStarters = (req.body || {}).starters;
    const wantsSave = Array.isArray(rawStarters);

    // POST sans `starters` = « valide ce qui est déjà enregistré ».
    const proposed: string[] = wantsSave
      ? rawStarters.map((v: unknown) => String(v))
      : currentStarters;

    const check = validateLineup(proposed, eligibleIds);
    if (!check.ok) {
      return res.status(400).json({
        error: INVALID_MESSAGE[check.error],
        code: check.error,
        offending: check.offending,
      });
    }

    // Remplacement propre de la composition : la feuille EST la liste, pas un
    // journal d'ajouts. Même stratégie que snapshotMatchParticipants.
    const byUserId = new Map(eligible.map((m) => [m.user_id as string, m]));
    const rows = check.starters.map((uid) => {
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
    });

    const { error: delErr } = await supabaseAdmin
      .from('match_participants')
      .delete()
      .eq('tenant_id', tenantId)
      .eq('match_id', matchId)
      .eq('team_id', teamId);
    if (delErr) {
      logger.error('[teams/lineup] delete participants error', delErr);
      return res.status(500).json({ error: "Échec de l'enregistrement." });
    }
    const { error: insErr } = await supabaseAdmin
      .from('match_participants')
      .insert(rows);
    if (insErr) {
      logger.error('[teams/lineup] insert participants error', insErr);
      return res.status(500).json({ error: "Échec de l'enregistrement." });
    }

    const validating = method === 'POST';
    const nowIso = new Date().toISOString();
    const { error: headerErr } = await supabaseAdmin
      .from('match_lineups')
      .upsert(
        {
          tenant_id: tenantId,
          match_id: matchId,
          team_id: teamId,
          status: validating ? 'validated' : 'draft',
          validated_by: validating ? userId : null,
          // `team` et pas `admin` : c'est l'équipe qui s'engage. La distinction
          // est ce qui rend une contestation interprétable.
          validated_by_kind: validating ? 'team' : null,
          validated_at: validating ? nowIso : null,
          updated_at: nowIso,
        },
        { onConflict: 'match_id,team_id' }
      );
    if (headerErr) {
      logger.error('[teams/lineup] upsert header error', headerErr);
      return res.status(500).json({ error: "Échec de l'enregistrement." });
    }

    return res.status(200).json({
      status: validating ? 'validated' : 'draft',
      validatedAt: validating ? nowIso : null,
      validatedByKind: validating ? 'team' : null,
      starters: check.starters,
    });
  },
  // `allowActAs` : le staff peut composer/valider à la place d'une équipe
  // injoignable le jour du tournoi (?as=…&act=1, cf. utils/subject.ts). La
  // feuille est alors marquée `validated_by_kind = 'team'` — c'est bien le
  // siège de l'équipe qui agit ; la validation `admin` est l'autre route.
  { allowActAs: true }
);
