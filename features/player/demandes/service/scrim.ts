// features/player/demandes/service/scrim.ts — demande de SCRIM (match amical
// entre deux équipes), négociation multi-créneaux. Déplacé de
// pages/api/demandes/scrim (lot P11) : mêmes règles, mêmes notifications
// (Discord staff + e-mail et MP best-effort au capitaine de l'équipe cible).
//
// Corps validé ICI : l'erreur historique porte `field` (chemin de la 1re
// issue), que le noyau ne produit pas.

import { LegacyAdminError } from '@/utils/admin/errors';
import { notifyScrimRequest } from '@/utils/discord';
import { normalizeSlots } from '@/utils/teams/scrimNegotiation';
import {
  assertTeamPermission,
  getManagedTeam,
  TEAM_MANAGEMENT_FORBIDDEN,
} from '@/utils/teams/managementAccess';
import {
  formatScrimDateFr,
  notifyScrimRequestDm,
  notifyScrimRequestEmail,
} from '@/utils/scrimRequestNotify';
import {
  findPendingDemande,
  insertDemande,
  listMyDemandes,
} from '../repository/demandes';
import { readTeam } from '../repository/teams';
import { ScrimDemandeBody } from '../schemas';
import { zodIssueFields } from '@/utils/player/errors';
import { displayNameOf, type DemandesCtx } from './context';

export async function listScrimDemandes(ctx: DemandesCtx) {
  const { demandes, error } = await listMyDemandes(
    ctx.db,
    ctx.tenantId,
    ctx.userId,
    'scrim',
    { withTeam: true }
  );
  if (error) {
    ctx.logger.error('[demandes/scrim] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load requests.');
  }
  return { demandes };
}

/**
 * @param requestedTeamId équipe gérée désignée par `?teamId=`. Le droit
 *   `manage_scrims` est vérifié APRÈS le corps (ordre historique : un corps
 *   invalide répond 400 avant tout 403).
 */
export async function submitScrimDemande(
  ctx: DemandesCtx,
  raw: unknown,
  requestedTeamId: string | null
) {
  const parsed = ScrimDemandeBody.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    // `code: 'validation'` (déduit du 400) est traduit côté client par
    // `playerErrors` ; `error` reste le message historique, `fields` le
    // détail par champ (contrat `PlayerErrorBody`).
    throw new LegacyAdminError(400, first?.message || 'Requête invalide.', {
      extra: {
        field: first?.path?.join('.') || undefined,
        fields: zodIssueFields(parsed.error),
      },
    });
  }
  const body = parsed.data;
  const { db, tenantId, userId, user } = ctx;

  const teamId = body.teamId.trim();
  const message = body.message?.trim()?.slice(0, 1000) || null;

  const access = await getManagedTeam(userId, tenantId, requestedTeamId);
  if (!access) throw new LegacyAdminError(403, TEAM_MANAGEMENT_FORBIDDEN);
  // Permission fine (R2) : le rôle doit couvrir `manage_scrims`.
  const denied = assertTeamPermission(access, 'manage_scrims');
  if (denied) throw new LegacyAdminError(denied.status, denied.error);

  const { team: myTeam } = await readTeam(
    db,
    tenantId,
    access.teamId,
    'id, name'
  );
  if (!myTeam) throw new LegacyAdminError(404, 'Team introuvable.');

  if (access.teamId === teamId) {
    throw new LegacyAdminError(
      400,
      'Tu ne peux pas demander un scrim contre ta propre equipe.'
    );
  }

  const { team: targetTeam, error: teamErr } = await readTeam(
    db,
    tenantId,
    teamId,
    'id, name',
    { activeOnly: true }
  );
  if (teamErr || !targetTeam) {
    throw new LegacyAdminError(400, "L'equipe cible n'existe pas.");
  }

  const { pending, error: existingErr } = await findPendingDemande(
    db,
    tenantId,
    { userId, teamId, types: ['scrim'] }
  );
  if (existingErr) {
    ctx.logger.error('[demandes/scrim] check existing error:', existingErr);
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (pending) {
    throw new LegacyAdminError(
      400,
      'Tu as deja une demande de scrim en attente vers cette equipe.'
    );
  }

  // `proposedSlots` d'abord, repli sur l'ancien `preferredDate` unique.
  const slotInput =
    body.proposedSlots && body.proposedSlots.length > 0
      ? body.proposedSlots
      : body.preferredDate
        ? [body.preferredDate]
        : [];
  const slotsResult = normalizeSlots(slotInput);
  if (!slotsResult.ok) throw new LegacyAdminError(400, slotsResult.error);
  const proposedSlots = slotsResult.slots;
  // Back-compat : preferred_date suit toujours slots[0].
  const preferredDate = proposedSlots[0];

  const payload: Record<string, unknown> = {
    user_email: user.email,
    user_display_name: displayNameOf(user),
    from_team_id: myTeam.id,
    from_team_name: myTeam.name,
    target_team_name: targetTeam.name,
    preferred_date: preferredDate,
    scrim_nego: {
      slots: proposedSlots,
      proposed_by: myTeam.id,
      rounds: 1,
      agreed_slot: null,
    },
  };

  const { demande, error: insertErr } = await insertDemande(db, tenantId, {
    user_id: userId,
    team_id: teamId,
    type: 'scrim',
    comment: message,
    payload,
  });
  if (insertErr) {
    ctx.logger.error('[demandes/scrim] insert error:', insertErr);
    throw new LegacyAdminError(500, 'Failed to create request.');
  }

  // Discord staff (fire-and-forget, erreurs journalisées dedans).
  notifyScrimRequest({
    fromTeamName: myTeam.name,
    targetTeamName: targetTeam.name,
    preferredDate,
    message,
    requesterDisplayName:
      (payload.user_display_name as string | null) ||
      (user.email as string | null),
  });

  // E-mail ET MP best-effort à la capitaine de l'équipe CIBLE : un échec ne
  // casse jamais la réponse 201.
  const notifyArgs = {
    tenantId,
    targetTeamId: teamId,
    demandeId: (demande as { id?: string } | null)?.id ?? null,
    slots: proposedSlots,
    opponentName: myTeam.name,
    dateLabel: formatScrimDateFr(proposedSlots),
    message,
    requesterName: myTeam.name,
    isExternal: false,
  };
  void notifyScrimRequestEmail(notifyArgs).catch(() => {});
  void notifyScrimRequestDm(notifyArgs).catch(() => {});

  return {
    success: true,
    demande,
    message: `Ta demande de scrim contre "${targetTeam.name}" a ete envoyee.`,
  };
}
