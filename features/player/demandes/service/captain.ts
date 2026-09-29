// features/player/demandes/service/captain.ts — demande de CAPITANAT (équipe
// existante ou nouvelle). Déplacé de pages/api/demandes/captain (lot P11).
//
// Corps validé ICI par `captainRequestSchema` (utils/validation) et non par le
// noyau : son message d'erreur passe par `formatZodError`, contrat historique
// `{ error }` sans `fields`.

import { LegacyAdminError } from '@/utils/admin/errors';
import { captainRequestSchema, formatZodError } from '@/utils/validation';
import {
  findPendingDemande,
  insertDemande,
  listMyDemandes,
} from '../repository/demandes';
import { readTeam } from '../repository/teams';
import { displayNameOf, type DemandesCtx } from './context';

export async function listCaptainDemandes(ctx: DemandesCtx) {
  const { demandes, error } = await listMyDemandes(
    ctx.db,
    ctx.tenantId,
    ctx.userId,
    'captain_request'
  );
  if (error) {
    ctx.logger.error('[demandes/captain] GET error:', error);
    throw new LegacyAdminError(500, 'Failed to load requests.');
  }
  return { demandes };
}

export async function submitCaptainDemande(ctx: DemandesCtx, raw: unknown) {
  const parsed = captainRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new LegacyAdminError(400, formatZodError(parsed.error));
  }
  const body = parsed.data;
  const { db, tenantId, userId, user } = ctx;

  const hasExistingTeam = !!body.existingTeamId;
  const message = body.message?.trim() || null;
  const members = body.members;

  const { pending, error: existingErr } = await findPendingDemande(
    db,
    tenantId,
    { userId, types: ['captain_request'] }
  );
  if (existingErr) {
    ctx.logger.error('[demandes/captain] check existing error:', existingErr);
    throw new LegacyAdminError(500, 'Verification error.');
  }
  if (pending) {
    throw new LegacyAdminError(
      400,
      'Tu as déjà une demande de capitaine en attente.',
      { extra: { existingDemandeId: pending.id } }
    );
  }

  let existingTeamName: string | null = null;
  if (hasExistingTeam) {
    const { team, error: teamErr } = await readTeam(
      db,
      tenantId,
      body.existingTeamId!,
      'id, name'
    );
    if (teamErr || !team) {
      throw new LegacyAdminError(400, "L'équipe sélectionnée n'existe pas.");
    }
    existingTeamName = team.name;
  }

  const payload: Record<string, unknown> = {
    user_email: user.email,
    user_display_name: displayNameOf(user),
    request_type: hasExistingTeam ? 'existing_team' : 'new_team',
  };
  if (hasExistingTeam) {
    payload.existing_team_id = body.existingTeamId!;
    payload.existing_team_name = existingTeamName;
  } else {
    payload.team_name = body.teamName!;
  }
  if (members.length > 0) {
    payload.members = members.map((m) => ({
      email: m.email,
      battle_tag: m.battleTag?.trim() || null,
      display_name: m.displayName?.trim() || null,
      specialty: m.specialty ?? null,
    }));
  }

  const { demande, error: insertErr } = await insertDemande(db, tenantId, {
    user_id: userId,
    team_id: hasExistingTeam ? body.existingTeamId! : null,
    type: 'captain_request',
    comment: message,
    payload,
  });
  if (insertErr) {
    ctx.logger.error('[demandes/captain] insert error:', insertErr);
    throw new LegacyAdminError(500, 'Failed to create request.');
  }

  return {
    success: true,
    demande,
    message:
      'Ta demande de capitaine a été envoyée. Un admin la validera prochainement.',
  };
}
