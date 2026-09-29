// features/player/team/service/membership.ts — entrée directe au roster par
// l'équipe gérée (POST /api/teams/add-member) et départ volontaire
// (POST /api/teams/leave). Lot P10, même contrat.

import { AdminError } from '@/utils/admin/errors';
import { validateRole } from '@/utils/apiHelpers';
import { sendTeamJoinEmail } from '@/utils/email';
import {
  insertTeamMember,
  resolveUserIdByEmail,
  validateBattleTagForRole,
} from '@/utils/teams/addMember';
import {
  isTeamRosterLocked,
  rosterLockErrorMessage,
} from '@/utils/teams/rosterLock';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { emitBotEvent } from '@/utils/botEvents';
import { listMemberships } from '@/utils/teams/memberships';
import {
  countRoster,
  deleteMembership,
  dissolveTeam,
  insertTeamNews,
  readLeavingTeam,
  readTeamHead,
} from '../repository/roster';
import type { AddMemberInput } from '../schemas';
import {
  fail,
  type ManagedTeamContext,
  type TeamSubjectContext,
} from './context';

async function assertRosterOpen(tenantId: string, teamId: string) {
  const lock = await isTeamRosterLocked(tenantId, teamId);
  if (lock.locked) throw fail(409, rosterLockErrorMessage(lock));
}

/* ------------------------------------------------------------------------
 * POST /api/teams/add-member — `manage_roster` exigé par la route
 * ---------------------------------------------------------------------- */

/** Adresse du membre ajouté, pour l'e-mail de bienvenue (best-effort). */
async function resolveWelcomeEmail(
  ctx: ManagedTeamContext,
  email: string | null | undefined,
  userId: string
): Promise<string | null> {
  const fromBody =
    typeof email === 'string' ? email.trim().toLowerCase() : null;
  if (fromBody) return fromBody;
  try {
    const { data } = await ctx.db.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null; // pas d'email = pas de mail à envoyer
  }
}

export async function addMember(ctx: ManagedTeamContext, body: AddMemberInput) {
  const { db, tenantId } = ctx;
  const { team } = await readTeamHead(db, tenantId, ctx.team.teamId);
  if (!team) throw fail(404, 'Team not found');

  // Une capitaine ne force pas le verrouillage d'un tournoi.
  await assertRosterOpen(tenantId, team.id);

  const { userId, email, role, battleTag } = body;
  const validatedRole = validateRole(role);
  let resolvedUserId =
    typeof userId === 'string' && userId.trim().length > 0 ? userId.trim() : '';

  // BattleTag exigé des rôles jouants uniquement (coach / manager exemptés).
  let battleTagValue: string | null;
  try {
    battleTagValue = validateBattleTagForRole(battleTag, validatedRole);
  } catch (err: unknown) {
    throw fail(400, (err as Error)?.message || 'Invalid BattleTag');
  }

  try {
    if (!resolvedUserId) {
      if (!email || typeof email !== 'string') {
        throw fail(400, 'Provide userId or email to find the user');
      }
      // Compte créé à la volée si l'adresse est inconnue (route capitaine).
      const resolved = await resolveUserIdByEmail({
        email,
        create: true,
        defaultRole: validatedRole,
      });
      if (!resolved.ok) throw fail(resolved.status, resolved.error);
      resolvedUserId = resolved.userId;
      if (resolved.created) {
        ctx.logger.info(`[add-member] auto-created user for ${email}`);
      }
    }

    // Le helper fait le pré-contrôle max_players et traduit les erreurs.
    const inserted = await insertTeamMember({
      tenantId,
      teamId: team.id,
      userId: resolvedUserId,
      role: validatedRole,
      battleTag: battleTagValue,
      enforceMaxPlayersPreCheck: true,
    });
    if (!inserted.ok) throw fail(inserted.status, inserted.error);

    // Alerte (ne bloque pas) si le membre ajouté est sur liste noire.
    void alertIfBlacklisted(db as never, tenantId, 'add_member', {
      battleTag: battleTagValue,
    });

    // E-mail attendu : un échec est remonté en avertissement, pas enterré.
    let emailWarning: string | null = null;
    const to = await resolveWelcomeEmail(ctx, email, resolvedUserId);
    if (to) {
      try {
        const sent = await sendTeamJoinEmail(
          to,
          team.name,
          validatedRole,
          tenantId
        );
        if (!sent.success) {
          emailWarning = `Email d'invitation non envoye (${sent.error ?? 'raison inconnue'}).`;
          ctx.logger.error('[add-member] team join email failed:', sent.error);
        }
      } catch (err: unknown) {
        emailWarning = "Email d'invitation non envoye (erreur reseau).";
        ctx.logger.error('[add-member] team join email error:', err);
      }
    }

    try {
      // Sans BattleTag (coach / manager) : partie locale de l'e-mail, puis
      // libellé neutre — jamais « undefined rejoint… ».
      const playerName =
        battleTagValue?.split('#')[0] ||
        (typeof email === 'string' && email.includes('@')
          ? email.split('@')[0]
          : 'Un nouveau membre');
      await insertTeamNews(db, {
        title: `${playerName} rejoint ${team.name}`,
        slug: `team-${team.id}-member-${Date.now().toString(36)}`,
        tag: 'teams',
        excerpt: `${playerName} rejoint ${team.name} en tant que ${validatedRole}.`,
        content: `${playerName} a rejoint ${team.name} en tant que ${validatedRole}. Bienvenue !`,
        image_url: team.logo_url ?? null,
        team_id: team.id,
        status: 'published',
        published_at: new Date().toISOString(),
        tenant_id: tenantId,
      });
    } catch (newsErr) {
      ctx.logger.error('[/api/teams/add-member] create news error:', newsErr);
    }

    return {
      teamMemberId: inserted.memberId ?? undefined,
      teamId: team.id,
      userId: resolvedUserId,
      role: validatedRole,
      battle_tag: battleTagValue,
      info: "Membre ajouté à l'équipe",
      ...(emailWarning ? { emailWarning } : {}),
    };
  } catch (err: unknown) {
    if (err instanceof AdminError) throw err;
    ctx.logger.error('[/api/teams/add-member] error:', err);
    throw fail(500, (err as Error)?.message || 'Internal server error');
  }
}

/* ------------------------------------------------------------------------
 * POST /api/teams/leave — appartenance, pas de permission d'équipe
 * ---------------------------------------------------------------------- */

export async function leaveTeam(
  ctx: TeamSubjectContext,
  requestedTeamId: string | null
) {
  const { db, tenantId } = ctx;
  const userId = ctx.subject.userId;

  // Une manager peut appartenir à plusieurs équipes : sans `?teamId=`, deviner
  // serait destructeur — on exige alors la précision.
  const memberships = await listMemberships(userId, tenantId);
  if (memberships.length === 0) {
    throw fail(400, "Tu n'es membre d'aucune équipe.");
  }
  const membership = requestedTeamId
    ? (memberships.find((m) => m.team_id === requestedTeamId) ?? null)
    : memberships.length === 1
      ? memberships[0]
      : null;
  if (!membership) {
    throw fail(
      400,
      requestedTeamId
        ? "Tu n'es pas membre de cette équipe."
        : 'Tu encadres plusieurs équipes : précise celle que tu veux quitter.',
      'TEAM_AMBIGUOUS'
    );
  }

  const team = await readLeavingTeam(db, tenantId, membership.team_id);
  // Capitanat voulu (S4) : la capitaine transfère d'abord, ou dissout si
  // elle est seule.
  const isCaptain = team?.captain_id === userId;
  const memberCount = isCaptain
    ? ((await countRoster(db, tenantId, membership.team_id)) ?? 1)
    : 1;
  if (isCaptain && memberCount > 1) {
    throw fail(
      403,
      "Le capitaine ne peut pas quitter l'équipe tant qu'il reste d'autres membres. Transfère le rôle de capitaine à un autre membre d'abord."
    );
  }

  await assertRosterOpen(tenantId, membership.team_id);

  const { error: deleteErr } = await deleteMembership(
    db,
    tenantId,
    membership.id
  );

  if (isCaptain) {
    if (deleteErr) {
      ctx.logger.error(
        '[teams/leave] delete membership (dissolve) error:',
        deleteErr
      );
      throw fail(500, 'Failed to leave team.');
    }
    const nowIso = new Date().toISOString();
    const { error: dissolveErr } = await dissolveTeam(
      db,
      tenantId,
      membership.team_id,
      nowIso
    );
    if (dissolveErr) {
      ctx.logger.error('[teams/leave] dissolve team error:', dissolveErr);
      throw fail(500, 'Failed to dissolve team.');
    }
    void emitBotEvent(
      'team.dissolved',
      {
        teamId: membership.team_id,
        name: team?.name ?? null,
        hardDelete: false,
        discordRoleId: team?.discord_role_id ?? null,
        discordChannelId: team?.discord_channel_id ?? null,
        discordVoiceChannelId: team?.discord_voice_channel_id ?? null,
      },
      tenantId
    ).catch((e) =>
      ctx.logger.error('[botEvents] team.dissolved emit error:', e)
    );
    return {
      success: true,
      info: "Tu as quitté l'équipe et elle a été dissoute (dernier membre).",
      dissolved: true,
    };
  }

  if (deleteErr) {
    ctx.logger.error('[teams/leave] delete error:', deleteErr);
    throw fail(500, 'Failed to leave team.');
  }
  void emitBotEvent(
    'team.member.removed',
    { authUserId: userId, teamId: membership.team_id },
    tenantId
  ).catch((e) =>
    ctx.logger.error('[botEvents] team.member.removed emit error:', e)
  );
  return { success: true, info: "Tu as quitté l'équipe." };
}
