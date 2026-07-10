// utils/teams/addMember.ts
// Helpers partages entre les 3 endpoints d'ajout de membre :
//   - pages/api/teams/add-member.ts          (capitaine/manager)
//   - pages/api/admin/teams/add-member.ts    (staff)
//   - pages/api/discord/teams/add-member.ts  (bot Discord)
//
// On factorise ici : validation BattleTag, resolution user par email,
// insert team_members + traduction des erreurs (duplicate / max_players),
// update captain_id avec rollback du membre en cas d'echec.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { emitRoleSyncEvent } from '../botRoleSync';
import {
  findOrCreateUserByEmail,
  lookupUserIdByEmail,
} from '../find-or-create-user';

/* -----------------------------------------------------------
 * BattleTag
 * ---------------------------------------------------------*/

export const BATTLE_TAG_REGEX = /^[A-Za-z0-9]{2,}#[0-9]{3,6}$/;
export const BATTLE_TAG_FORMAT_HINT =
  'BattleTag required (format Name#0000, alphanumeric + # + 3 to 6 digits)';

/**
 * Valide un BattleTag.
 * @throws Error('BattleTag …') si le format est invalide
 */
export function validateBattleTag(tag: string | null | undefined): string {
  const trimmed = (tag ?? '').trim();
  if (!BATTLE_TAG_REGEX.test(trimmed)) {
    throw new Error(BATTLE_TAG_FORMAT_HINT);
  }
  return trimmed;
}

/* -----------------------------------------------------------
 * Resolution user par email
 * ---------------------------------------------------------*/

export type ResolveUserByEmailOptions = {
  email: string;
  /**
   * Si true, on cree le user s'il n'existe pas (via findOrCreateUserByEmail).
   * Si false, on cherche uniquement dans les users existants (paginated).
   */
  create: boolean;
  /** Role par defaut a passer a findOrCreateUserByEmail (si create=true). */
  defaultRole?: string;
};

export type ResolveUserByEmailResult =
  | { ok: true; userId: string; created: boolean }
  | { ok: false; error: string; status: number };

/**
 * Trouve (ou cree) un user a partir d'un email. Renvoie un resultat discriminant
 * pour que les handlers puissent mapper proprement vers une reponse HTTP.
 */
export async function resolveUserIdByEmail(
  opts: ResolveUserByEmailOptions
): Promise<ResolveUserByEmailResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }

  const email = opts.email.trim();
  if (!email) {
    return {
      ok: false,
      error: 'Provide userId or email to find the user',
      status: 400,
    };
  }

  if (opts.create) {
    try {
      const { userId, created } = await findOrCreateUserByEmail(
        email,
        opts.defaultRole ?? 'player'
      );
      return { ok: true, userId, created };
    } catch (err: unknown) {
      logger.error('[addMember] findOrCreateUserByEmail error:', err);
      return {
        ok: false,
        error: (err as Error)?.message ?? 'Failed to find or create user',
        status: 500,
      };
    }
  }

  // No create: lookup ciblé (RPC get_user_id_by_email) au lieu d'un scan
  // paginé de auth.users — audit perf P8.
  try {
    const userId = await lookupUserIdByEmail(email);
    if (userId) {
      return { ok: true, userId, created: false };
    }
  } catch (err: unknown) {
    logger.error('[addMember] lookupUserIdByEmail error:', err);
    return {
      ok: false,
      error: (err as Error)?.message ?? 'Failed to look up user by email',
      status: 500,
    };
  }

  return { ok: false, error: 'User not found for this email', status: 404 };
}

/* -----------------------------------------------------------
 * Insert team_members
 * ---------------------------------------------------------*/

export type InsertTeamMemberInput = {
  /**
   * Tenant scope (S5a — defense-in-depth).
   * Filtre `team_members` / `tournament_teams` lors du pre-check max_players
   * et stocke `tenant_id` sur la nouvelle ligne `team_members`.
   */
  tenantId: string;
  teamId: string;
  userId: string;
  role: string;
  /** Optionnel : tous les endpoints ne stockent pas le battle_tag. */
  battleTag?: string | null;
  /** Optionnel : spécialité in-game (tank | dps | support | flex). */
  specialty?: string | null;
  /**
   * Si true, on fait un pre-check `max_players` avant d'insert :
   * compte les membres non-coach actuels et compare a la plus petite limite
   * imposee par les tournois auxquels la team est inscrite. Renvoie une
   * erreur friendly avant l'insert (UX). Le trigger PG reste la source de
   * verite anti-race en cas de concurrence — voir migration
   * `enforce_team_max_players_trigger.sql`.
   */
  enforceMaxPlayersPreCheck?: boolean;
};

export type InsertTeamMemberResult =
  | { ok: true; memberId: string | null }
  | {
      ok: false;
      error: string;
      status: number;
      isDuplicate?: boolean;
      isMaxPlayersViolation?: boolean;
    };

/**
 * Insert un membre dans `team_members` et traduit les erreurs PG/trigger
 * en messages metier :
 *   - 23514 (check_violation) ou message contenant "max_players" → limite atteinte
 *   - duplicate / unique → user deja dans une equipe
 */
export async function insertTeamMember(
  input: InsertTeamMemberInput
): Promise<InsertTeamMemberResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }

  // Pre-check max_players (UX rapide ; le trigger PG est la source de verite)
  if (input.enforceMaxPlayersPreCheck && input.role !== 'coach') {
    const [{ count: currentNonCoachCount }, { data: teamTournaments }] =
      await Promise.all([
        supabaseAdmin
          .from('team_members')
          .select('*', { count: 'exact', head: true })
          .eq('tenant_id', input.tenantId)
          .eq('team_id', input.teamId)
          .neq('role', 'coach'),
        supabaseAdmin
          .from('tournament_teams')
          .select('tournament_id, tournaments!inner(max_players)')
          .eq('tenant_id', input.tenantId)
          .eq('team_id', input.teamId),
      ]);

    for (const tt of teamTournaments ?? []) {
      const maxPlayers = (tt as { tournaments?: { max_players?: number } })
        .tournaments?.max_players;
      if (maxPlayers && (currentNonCoachCount ?? 0) >= maxPlayers) {
        return {
          ok: false,
          status: 400,
          error: `L'équipe a atteint la limite de ${maxPlayers} joueur(s) imposée par un tournoi.`,
          isMaxPlayersViolation: true,
        };
      }
    }
  }

  const payload: Record<string, unknown> = {
    tenant_id: input.tenantId,
    team_id: input.teamId,
    user_id: input.userId,
    role: input.role,
  };
  if (input.battleTag) payload.battle_tag = input.battleTag;
  if (input.specialty) payload.specialty = input.specialty;
  // Le role `substitute` doit aussi lever is_substitute (comme update-member-role),
  // sinon la sub n'est pas comptee comme remplacante par les vues qui lisent ce flag.
  if (input.role === 'substitute') payload.is_substitute = true;

  const { data: member, error: insertErr } = await supabaseAdmin
    .from('team_members')
    .insert(payload)
    .select('id')
    .maybeSingle();

  if (insertErr) {
    const msg = insertErr.message?.toLowerCase() || '';
    // Ne classer comme "limite tournoi" QUE si le message evoque explicitement
    // max_players. Le code 23514 seul est trop large : une autre contrainte CHECK
    // (role invalide, format battle_tag) renverrait alors un message trompeur.
    const isMaxPlayersViolation = msg.includes('max_players');
    const isDuplicate = msg.includes('duplicate') || msg.includes('unique');

    if (isMaxPlayersViolation) {
      return {
        ok: false,
        status: 400,
        error:
          "L'équipe a atteint la limite de joueur(s) imposée par un tournoi.",
        isMaxPlayersViolation: true,
      };
    }
    if (isDuplicate) {
      return {
        ok: false,
        status: 400,
        error: 'Ce joueur est déjà dans une équipe',
        isDuplicate: true,
      };
    }
    return {
      ok: false,
      status: 400,
      error: "Échec de l'ajout du membre",
    };
  }

  void emitRoleSyncEvent('team.member.added', input.userId, input.tenantId, {
    extras: {
      teamId: input.teamId,
      role: input.role,
      battleTag: input.battleTag ?? null,
    },
  });

  return { ok: true, memberId: member?.id ?? null };
}

/* -----------------------------------------------------------
 * Set team captain (avec rollback du membre si l'update echoue)
 * ---------------------------------------------------------*/

export type SetTeamCaptainResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Promeut un user au rang de capitaine d'une equipe (`teams.captain_id`).
 * En cas d'echec, le caller est responsable de decider du rollback (la plupart
 * des handlers laissent le membre en place et retournent juste une erreur).
 */
export async function setTeamCaptain(
  teamId: string,
  userId: string,
  tenantId: string
): Promise<SetTeamCaptainResult> {
  if (!supabaseAdmin) {
    return { ok: false, error: 'Service unavailable.', status: 503 };
  }

  // Capture previous captain so we can emit a useful event payload
  // (the bot needs to remove the role from the old captain).
  const { data: before } = await supabaseAdmin
    .from('teams')
    .select('captain_id')
    .eq('id', teamId)
    .maybeSingle();
  const previousCaptainAuthUserId = before?.captain_id ?? null;

  const { error: captainErr } = await supabaseAdmin
    .from('teams')
    .update({ captain_id: userId })
    .eq('id', teamId);

  if (captainErr) {
    logger.error('[addMember] captain update error:', captainErr);
    return {
      ok: false,
      status: 500,
      error:
        captainErr.message ||
        'Member added but failed to set as captain (check teams.captain_id column)',
    };
  }

  if (previousCaptainAuthUserId && previousCaptainAuthUserId !== userId) {
    // Émet un event pour l'ancien capitaine (perd le rôle captain) et un pour
    // le nouveau (gagne le rôle). Le bot fait 1 sync par event — c'est plus
    // simple et idempotent que de packager 2 users dans un seul payload.
    void emitRoleSyncEvent(
      'team.captain.changed',
      previousCaptainAuthUserId,
      tenantId,
      { extras: { teamId, role: 'previous' } }
    );
  }
  if (previousCaptainAuthUserId !== userId) {
    void emitRoleSyncEvent('team.captain.changed', userId, tenantId, {
      extras: { teamId, role: 'new' },
    });
  }

  return { ok: true };
}
