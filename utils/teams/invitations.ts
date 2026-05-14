// utils/teams/invitations.ts
//
// Helpers metier pour le flow d'invitation capitaine -> joueuse.
// Stocke dans la table `demandes` avec type='invite' :
//   user_id  = invitee auth_user_id
//   team_id  = team
//   payload  = { captain_auth_user_id, captain_discord_user_id,
//                invitee_discord_user_id, desired_role, battle_tag, expires_at }
//
// Status flow : pending -> approved | rejected | cancelled.
//
// Garde-fous metier centralises ici pour etre partages entre :
//   - /api/bot/v1/teams/[teamId]/invitations          (captain create)
//   - /api/bot/v1/invitations/[demandeId]             (accept/reject/cancel)
// Une future UI cote site pourra reutiliser les memes helpers.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { insertTeamMember, validateBattleTag } from './addMember';
import { isTeamRosterLocked, rosterLockErrorMessage } from './rosterLock';
import { validateRole } from '../apiHelpers';

export const INVITATION_EXPIRY_DAYS = 7;

export type InvitationPayload = {
  captain_auth_user_id: string;
  captain_discord_user_id: string;
  invitee_discord_user_id: string;
  desired_role: string;
  battle_tag: string | null;
  expires_at: string;
};

export type InvitationRow = {
  id: string;
  user_id: string;
  team_id: string | null;
  type: string;
  status: string;
  comment: string | null;
  source: string | null;
  payload: InvitationPayload;
  created_at: string;
  processed_at: string | null;
};

type Result<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

function nowIso() {
  return new Date().toISOString();
}

function expiresAtFromNow(days = INVITATION_EXPIRY_DAYS): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function isExpired(payload: InvitationPayload | null | undefined): boolean {
  if (!payload?.expires_at) return false;
  const t = Date.parse(payload.expires_at);
  return Number.isFinite(t) && t <= Date.now();
}

/* ---------------------------------------------------------------------------
 * Create
 * ------------------------------------------------------------------------- */

export type CreateInvitationInput = {
  teamId: string;
  captainAuthUserId: string;
  captainDiscordUserId: string;
  inviteeAuthUserId: string;
  inviteeDiscordUserId: string;
  /** Defaults to 'player' (via validateRole). */
  role?: string | null;
  /** Optional BattleTag — validated against BATTLE_TAG_REGEX when provided. */
  battleTag?: string | null;
  /** Optional free-text message from the captain. */
  comment?: string | null;
};

/**
 * Cree une invitation pending. Garde-fous :
 *  - capitaine != invitee
 *  - invitee pas deja membre de la team
 *  - pas de pending invite existante pour (team, invitee)
 *  - BattleTag bien forme si fourni
 */
export async function createInvitation(
  input: CreateInvitationInput
): Promise<Result<InvitationRow>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }

  if (input.captainAuthUserId === input.inviteeAuthUserId) {
    return {
      ok: false,
      status: 400,
      error: 'Tu fais déjà partie de cette équipe.',
    };
  }

  let battleTag: string | null = null;
  if (input.battleTag && input.battleTag.trim()) {
    try {
      battleTag = validateBattleTag(input.battleTag);
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: (err as Error)?.message || 'BattleTag invalide',
      };
    }
  }

  // Invitee deja membre de CETTE team ?
  const { data: existingMember } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('team_id', input.teamId)
    .eq('user_id', input.inviteeAuthUserId)
    .maybeSingle();
  if (existingMember) {
    return {
      ok: false,
      status: 400,
      error: 'Cette joueuse est déjà membre de ton équipe.',
    };
  }

  // Deja une invitation pending pour ce couple (team, invitee) ?
  const { data: existingInvite } = await supabaseAdmin
    .from('demandes')
    .select('id')
    .eq('team_id', input.teamId)
    .eq('user_id', input.inviteeAuthUserId)
    .eq('type', 'invite')
    .eq('status', 'pending')
    .maybeSingle();
  if (existingInvite) {
    return {
      ok: false,
      status: 409,
      error: 'Une invitation pending existe déjà pour cette joueuse.',
    };
  }

  const role = validateRole(input.role);
  const payload: InvitationPayload = {
    captain_auth_user_id: input.captainAuthUserId,
    captain_discord_user_id: input.captainDiscordUserId,
    invitee_discord_user_id: input.inviteeDiscordUserId,
    desired_role: role,
    battle_tag: battleTag,
    expires_at: expiresAtFromNow(),
  };

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('demandes')
    .insert({
      user_id: input.inviteeAuthUserId,
      team_id: input.teamId,
      type: 'invite',
      status: 'pending',
      source: 'discord_bot',
      comment: input.comment ?? null,
      payload,
    })
    .select('*')
    .single();
  if (insertErr || !inserted) {
    logger.error('[invitations] insert error', insertErr);
    return {
      ok: false,
      status: 500,
      error: "Échec de la création de l'invitation",
    };
  }

  return { ok: true, data: inserted as InvitationRow };
}

/* ---------------------------------------------------------------------------
 * Load + assert helpers
 * ------------------------------------------------------------------------- */

async function loadPendingInvitation(
  demandeId: string
): Promise<Result<InvitationRow>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('id', demandeId)
    .eq('type', 'invite')
    .maybeSingle();
  if (error) {
    logger.error('[invitations] load error', error);
    return { ok: false, error: "Erreur de chargement de l'invitation", status: 500 };
  }
  if (!data) {
    return { ok: false, error: 'Invitation introuvable', status: 404 };
  }
  if (data.status !== 'pending') {
    return {
      ok: false,
      error: `Cette invitation est déjà ${data.status}.`,
      status: 409,
    };
  }
  return { ok: true, data: data as InvitationRow };
}

/* ---------------------------------------------------------------------------
 * Accept (invitee)
 * ------------------------------------------------------------------------- */

export async function acceptInvitation(
  demandeId: string,
  actorAuthUserId: string
): Promise<Result<{ teamId: string; memberId: string | null }>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }

  const loaded = await loadPendingInvitation(demandeId);
  if (!loaded.ok) return loaded;
  const demande = loaded.data;

  if (demande.user_id !== actorAuthUserId) {
    return {
      ok: false,
      status: 403,
      error: 'Seule la joueuse invitée peut accepter cette invitation.',
    };
  }

  if (isExpired(demande.payload)) {
    // Auto-cancel so it disparait des pendings.
    await supabaseAdmin
      .from('demandes')
      .update({ status: 'cancelled', processed_at: nowIso() })
      .eq('id', demande.id);
    return {
      ok: false,
      status: 410,
      error: 'Cette invitation a expiré.',
    };
  }

  if (!demande.team_id) {
    return {
      ok: false,
      status: 409,
      error: "L'équipe associée à cette invitation n'existe plus.",
    };
  }

  // Invitee deja dans une equipe ? Cohérent avec /api/demandes/join.
  const { data: currentMembership } = await supabaseAdmin
    .from('team_members')
    .select('id')
    .eq('user_id', actorAuthUserId)
    .maybeSingle();
  if (currentMembership) {
    return {
      ok: false,
      status: 400,
      error:
        "Tu fais déjà partie d'une équipe. Quitte-la d'abord via /quitter-equipe.",
    };
  }

  // Roster lock cote team cible.
  const lockStatus = await isTeamRosterLocked(demande.team_id);
  if (lockStatus.locked) {
    return {
      ok: false,
      status: 409,
      error: rosterLockErrorMessage(lockStatus),
    };
  }

  // Insert membership (le helper fait le pre-check max_players + duplicate).
  const insertResult = await insertTeamMember({
    teamId: demande.team_id,
    userId: actorAuthUserId,
    role: demande.payload?.desired_role || 'player',
    battleTag: demande.payload?.battle_tag ?? null,
    enforceMaxPlayersPreCheck: true,
  });
  if (!insertResult.ok) {
    return { ok: false, error: insertResult.error, status: insertResult.status };
  }

  const { error: updateErr } = await supabaseAdmin
    .from('demandes')
    .update({ status: 'approved', processed_at: nowIso() })
    .eq('id', demande.id);
  if (updateErr) {
    logger.error('[invitations] approve update error', updateErr);
    // Membership deja cree : on ne rollback pas (cas rare et le membre est
    // effectivement ajoute). On signale l'incoherence dans le log.
  }

  return {
    ok: true,
    data: { teamId: demande.team_id, memberId: insertResult.memberId },
  };
}

/* ---------------------------------------------------------------------------
 * Reject (invitee) / Cancel (captain)
 * ------------------------------------------------------------------------- */

export async function rejectInvitation(
  demandeId: string,
  actorAuthUserId: string
): Promise<Result<{ status: 'rejected' }>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const loaded = await loadPendingInvitation(demandeId);
  if (!loaded.ok) return loaded;
  const demande = loaded.data;

  if (demande.user_id !== actorAuthUserId) {
    return {
      ok: false,
      status: 403,
      error: 'Seule la joueuse invitée peut refuser cette invitation.',
    };
  }

  const { error } = await supabaseAdmin
    .from('demandes')
    .update({ status: 'rejected', processed_at: nowIso() })
    .eq('id', demande.id);
  if (error) {
    logger.error('[invitations] reject error', error);
    return { ok: false, error: 'Échec du refus', status: 500 };
  }
  return { ok: true, data: { status: 'rejected' } };
}

export async function cancelInvitation(
  demandeId: string,
  actorAuthUserId: string
): Promise<Result<{ status: 'cancelled' }>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const loaded = await loadPendingInvitation(demandeId);
  if (!loaded.ok) return loaded;
  const demande = loaded.data;

  if (demande.payload?.captain_auth_user_id !== actorAuthUserId) {
    return {
      ok: false,
      status: 403,
      error: 'Seul le capitaine qui a envoyé l’invitation peut l’annuler.',
    };
  }

  const { error } = await supabaseAdmin
    .from('demandes')
    .update({ status: 'cancelled', processed_at: nowIso() })
    .eq('id', demande.id);
  if (error) {
    logger.error('[invitations] cancel error', error);
    return { ok: false, error: "Échec de l'annulation", status: 500 };
  }
  return { ok: true, data: { status: 'cancelled' } };
}

/* ---------------------------------------------------------------------------
 * List
 * ------------------------------------------------------------------------- */

export async function listPendingInvitationsForUser(
  authUserId: string
): Promise<Result<InvitationRow[]>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('user_id', authUserId)
    .eq('type', 'invite')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) {
    logger.error('[invitations] list error', error);
    return { ok: false, error: 'Erreur de chargement', status: 500 };
  }
  // Filtre cote app les invites expirees (laissees en pending dans la DB
  // tant que le cron de nettoyage ne les a pas touchees).
  const fresh = (data ?? []).filter(
    (d) => !isExpired((d as InvitationRow).payload)
  );
  return { ok: true, data: fresh as InvitationRow[] };
}
