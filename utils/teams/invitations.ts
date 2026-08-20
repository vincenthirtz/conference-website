// utils/teams/invitations.ts
//
// Helpers metier pour le flow d'invitation capitaine -> joueuse.
// Stocke dans la table `demandes` avec type='invite' :
//   user_id  = invitee auth_user_id
//   team_id  = team
//   payload  = { captain_auth_user_id, captain_discord_user_id?,
//                invitee_discord_user_id?, desired_role, battle_tag,
//                specialty?, expires_at }
//
// Status flow : pending -> approved | rejected | cancelled.
//
// Garde-fous metier centralises ici pour etre partages entre :
//   - /api/bot/v1/teams/[teamId]/invitations          (captain create, Discord)
//   - /api/bot/v1/invitations/[demandeId]             (accept/reject/cancel)
//   - /api/teams/create-with-member                   (web team creation)
//   - /api/admin/demandes (captain_request new-team)  (web/staff)
//
// Origine : `source` distingue les invites créées par le bot ('discord_bot',
// défaut) de celles créées côté site ('website'). Les champs Discord du payload
// (captain_discord_user_id, invitee_discord_user_id) sont OPTIONNELS : une
// invite web peut être créée sans aucun id Discord.
//
// Multi-tenant (S3) : toutes les fonctions exportées prennent `tenantId`
// (string UUID) en premier paramètre. Les queries Supabase sur les tables
// scopées (`demandes`, `team_members`) ajoutent `.eq('tenant_id', tenantId)`
// défense en profondeur. Les bot callers passent `req.botContext!.tenantId`,
// admin/public callers passent `DEFAULT_TENANT_ID` (cf. `utils/tenant.ts`).

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { validateBattleTag } from './addMember';
import { isTeamRosterLocked, rosterLockErrorMessage } from './rosterLock';
import { mapTeamRpcError } from './rpcErrors';
import { validateRole } from '../apiHelpers';
import { emitRoleSyncEvent } from '../botRoleSync';
import { findExclusiveMembership } from './memberships';

export const INVITATION_EXPIRY_DAYS = 7;

export type InvitationPayload = {
  /**
   * Auteur de l'invitation. Historiquement toujours le capitaine — depuis la
   * création d'équipe par un MANAGER (cf. /api/teams/create-with-member), ce
   * peut aussi être un membre au rôle de gestion. Le nom du champ est conservé
   * pour ne pas casser les invitations déjà stockées / le contrat bot.
   */
  captain_auth_user_id: string;
  /** Optionnel : absent pour les invites créées côté site (pas de Discord). */
  captain_discord_user_id?: string | null;
  /** Optionnel : absent pour les invites créées côté site (pas de Discord). */
  invitee_discord_user_id?: string | null;
  desired_role: string;
  battle_tag: string | null;
  /** Optionnel : spécialité in-game (tank | dps | support | flex). */
  specialty?: string | null;
  /**
   * Optionnel : l'invitée a été désignée capitaine à la création de l'équipe
   * (mode « créée par un manager » — l'équipe naît sans capitaine puisque la
   * capitaine doit d'abord consentir). À l'acceptation, elle prend le capitanat
   * SI l'équipe n'a toujours pas de capitaine (cf. acceptInvitation).
   */
  set_captain?: boolean;
  /**
   * Optionnel : SHA-256 du « lien privé » d'invitation (cf.
   * utils/teams/inviteLinks.ts). Présent uniquement pour les invitations créées
   * depuis l'espace équipe avec un lien partageable. Le jeton en clair n'est
   * jamais stocké.
   */
  invite_token_hash?: string;
  /**
   * Optionnel : email visé par l'invitation, mémorisé pour que le lien privé
   * puisse vérifier que la personne connectée est bien la destinataire même si
   * son compte a été créé à la volée.
   */
  invite_email?: string;
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

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status: number };

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
  /**
   * Auteur de l'invitation : capitaine OU membre au rôle de gestion (manager),
   * cf. `InvitationPayload.captain_auth_user_id`.
   */
  captainAuthUserId: string;
  /**
   * Optionnel : id Discord du capitaine. Requis pour les invites bot (le bot
   * le passe toujours), absent pour les invites web.
   */
  captainDiscordUserId?: string | null;
  inviteeAuthUserId: string;
  /**
   * Optionnel : id Discord de l'invitée. Requis pour les invites bot, absent
   * pour les invites web (l'invitée n'a pas forcément lié son Discord).
   */
  inviteeDiscordUserId?: string | null;
  /** Defaults to 'player' (via validateRole). */
  role?: string | null;
  /** Optional BattleTag — validated against BATTLE_TAG_REGEX when provided. */
  battleTag?: string | null;
  /** Optional in-game specialty (tank | dps | support | flex). */
  specialty?: string | null;
  /**
   * SHA-256 du lien privé partageable (cf. utils/teams/inviteLinks.ts). Fourni
   * quand l'invitation est créée depuis l'espace équipe.
   */
  inviteTokenHash?: string | null;
  /** Email visé — mémorisé pour la vérification d'identité du lien privé. */
  inviteEmail?: string | null;
  /**
   * L'invitée est la capitaine désignée de l'équipe (création par un manager).
   * Elle prendra le capitanat à l'acceptation si l'équipe n'en a pas encore.
   */
  setCaptain?: boolean;
  /** Optional free-text message from the captain. */
  comment?: string | null;
  /**
   * Origine de l'invitation. 'discord_bot' (défaut) pour les invites créées par
   * le bot ; 'website' pour celles créées depuis le site.
   */
  source?: string;
};

/**
 * Cree une invitation pending. Garde-fous :
 *  - capitaine != invitee
 *  - invitee pas deja membre de la team
 *  - pas de pending invite existante pour (team, invitee)
 *  - BattleTag bien forme si fourni
 */
export async function createInvitation(
  tenantId: string,
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
    .eq('tenant_id', tenantId)
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
    .eq('tenant_id', tenantId)
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
    captain_discord_user_id: input.captainDiscordUserId ?? null,
    invitee_discord_user_id: input.inviteeDiscordUserId ?? null,
    desired_role: role,
    battle_tag: battleTag,
    specialty: input.specialty ?? null,
    expires_at: expiresAtFromNow(),
  };
  // On ne pose ces clés que quand elles sont renseignées : les invitations
  // « normales » gardent exactement le payload historique (diff nul côté bot /
  // tests).
  if (input.setCaptain) payload.set_captain = true;
  if (input.inviteTokenHash) payload.invite_token_hash = input.inviteTokenHash;
  if (input.inviteEmail) payload.invite_email = input.inviteEmail;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('demandes')
    .insert({
      tenant_id: tenantId,
      user_id: input.inviteeAuthUserId,
      team_id: input.teamId,
      type: 'invite',
      status: 'pending',
      source: input.source ?? 'discord_bot',
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
  tenantId: string,
  demandeId: string
): Promise<Result<InvitationRow>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', demandeId)
    .eq('type', 'invite')
    .maybeSingle();
  if (error) {
    logger.error('[invitations] load error', error);
    return {
      ok: false,
      error: "Erreur de chargement de l'invitation",
      status: 500,
    };
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
 * Lien privé (jeton partageable)
 * ------------------------------------------------------------------------- */

/**
 * Résout une invitation PENDING à partir du hash de son lien privé.
 *
 * Volontairement NON scopée tenant : le porteur du lien n'a pas de contexte
 * tenant (page publique, éventuellement ouverte sur un autre domaine). Le hash
 * est un secret de 32 octets, il identifie donc l'invitation à lui seul ; le
 * tenant réel est lu sur la ligne trouvée et sert ensuite à toutes les
 * opérations en aval.
 */
export async function findInvitationByTokenHash(
  tokenHash: string
): Promise<Result<InvitationRow & { tenant_id: string }>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  if (!tokenHash) {
    return { ok: false, error: 'Invitation introuvable', status: 404 };
  }

  // `.filter(col, 'eq', …)` est la forme utilisée partout dans le repo pour un
  // accès JSONB (cf. pages/api/player/dashboard.ts, admin/scrims/forward.ts…).
  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('type', 'invite')
    .filter('payload->>invite_token_hash', 'eq', tokenHash)
    .maybeSingle();

  if (error) {
    logger.error('[invitations] token load error', error);
    return {
      ok: false,
      error: "Erreur de chargement de l'invitation",
      status: 500,
    };
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
  if (isExpired((data as InvitationRow).payload)) {
    return { ok: false, error: 'Cette invitation a expiré.', status: 410 };
  }
  return { ok: true, data: data as InvitationRow & { tenant_id: string } };
}

/* ---------------------------------------------------------------------------
 * Accept (invitee)
 * ------------------------------------------------------------------------- */

export async function acceptInvitation(
  tenantId: string,
  demandeId: string,
  actorAuthUserId: string
): Promise<
  Result<{
    teamId: string;
    memberId: string | null;
    /** true si l'invitée vient aussi de prendre le capitanat (cf. set_captain). */
    promotedToCaptain?: boolean;
  }>
> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }

  const loaded = await loadPendingInvitation(tenantId, demandeId);
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
      .eq('tenant_id', tenantId)
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

  // Invitee deja dans une equipe ? Cohérent avec /api/demandes/join : un siège
  // de manager ne « prend » pas le compte (index unique partiel).
  const currentMembership = await findExclusiveMembership(
    actorAuthUserId,
    tenantId
  );
  if (currentMembership) {
    return {
      ok: false,
      status: 400,
      error:
        "Tu fais déjà partie d'une équipe. Quitte-la d'abord via /equipe quitter.",
    };
  }

  // Roster lock cote team cible.
  const lockStatus = await isTeamRosterLocked(tenantId, demande.team_id);
  if (lockStatus.locked) {
    return {
      ok: false,
      status: 409,
      error: rosterLockErrorMessage(lockStatus),
    };
  }

  // Acceptation atomique : verrou FOR UPDATE + CAS status pending->approved +
  // insert team_members + garde max_players (trigger), le tout dans une seule
  // transaction PL/pgSQL. Remplace l'ancien couple insert-membre / update-statut
  // non atomique (qui pouvait laisser un membre insere avec une demande restee
  // pending si l'update echouait).
  const { data: rpcData, error: rpcErr } = await supabaseAdmin.rpc(
    'accept_invitation',
    { p_demande_id: demande.id, p_user_id: actorAuthUserId }
  );

  if (rpcErr) {
    const mapped = mapTeamRpcError(rpcErr);
    if (mapped.status >= 500) {
      logger.error('[invitations] accept_invitation rpc error', rpcErr);
    }
    return { ok: false, error: mapped.error, status: mapped.status };
  }

  const memberId = (rpcData as { id?: string | null } | null)?.id ?? null;

  // Capitaine désignée à la création (équipe créée par un manager) : elle vient
  // d'accepter, donc elle consent — on lui donne le capitanat. Conditionnel
  // (`captain_id IS NULL`) : si une autre joueuse a été désignée entre-temps, on
  // ne lui vole pas le rôle. Best-effort : un échec ne remet pas en cause
  // l'acceptation déjà persistée (le manager pourra désigner depuis son espace).
  let promotedToCaptain = false;
  if (demande.payload?.set_captain) {
    const { data: promoted, error: promoteErr } = await supabaseAdmin
      .from('teams')
      .update({ captain_id: actorAuthUserId })
      .eq('id', demande.team_id)
      .eq('tenant_id', tenantId)
      .is('captain_id', null)
      .select('id')
      .maybeSingle();

    if (promoteErr) {
      logger.error(
        '[invitations] designated-captain promote error',
        promoteErr
      );
    } else if (promoted) {
      promotedToCaptain = true;
      void emitRoleSyncEvent(
        'team.captain.changed',
        actorAuthUserId,
        tenantId,
        { extras: { teamId: demande.team_id, role: 'new' } }
      ).catch((e) => logger.error('[invitations] captain role-sync error', e));
    }
  }

  return {
    ok: true,
    data: { teamId: demande.team_id, memberId, promotedToCaptain },
  };
}

/* ---------------------------------------------------------------------------
 * Reject (invitee) / Cancel (captain)
 * ------------------------------------------------------------------------- */

export async function rejectInvitation(
  tenantId: string,
  demandeId: string,
  actorAuthUserId: string
): Promise<Result<{ status: 'rejected' }>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const loaded = await loadPendingInvitation(tenantId, demandeId);
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
    .eq('tenant_id', tenantId)
    .eq('id', demande.id);
  if (error) {
    logger.error('[invitations] reject error', error);
    return { ok: false, error: 'Échec du refus', status: 500 };
  }
  return { ok: true, data: { status: 'rejected' } };
}

export async function cancelInvitation(
  tenantId: string,
  demandeId: string,
  actorAuthUserId: string
): Promise<Result<{ status: 'cancelled' }>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const loaded = await loadPendingInvitation(tenantId, demandeId);
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
    .eq('tenant_id', tenantId)
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
  tenantId: string,
  authUserId: string
): Promise<Result<InvitationRow[]>> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }
  const { data, error } = await supabaseAdmin
    .from('demandes')
    .select('*')
    .eq('tenant_id', tenantId)
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
