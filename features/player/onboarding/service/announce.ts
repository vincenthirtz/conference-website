// features/player/onboarding/service/announce.ts — étape 8 : le message de
// synthèse, les alertes de liste noire et l'annonce `team.created` au bot
// (provisionnement Discord : rôle + vocal + salon texte de l'équipe).

import { emitBotEvent } from '@/utils/botEvents';
import { getDiscordLinkForUser } from '@/utils/discordLinks';
import { alertIfBlacklisted } from '@/utils/moderation/blacklist';
import { alertIfEntityBlacklisted } from '@/utils/moderation/entityBlacklist';
import type { CreatedMember, InvitedMember } from '../schemas';
import type { CreatedTeamRow } from '../repository/teamCreation';
import type { OnboardingCtx } from './context';
import type { ResolvedAccounts } from './accounts';
import type { TournamentOutcome } from './tournament';

export function summaryInfo(
  accounts: ResolvedAccounts,
  inserted: CreatedMember[],
  invited: InvitedMember[],
  outcome: TournamentOutcome,
  tournamentId: string | null
): string {
  const parts: string[] = [];
  if (accounts.managerUserId) parts.push('Équipe créée et manager ajouté');
  else if (inserted.length) parts.push('Équipe créée et capitaine ajouté');
  else parts.push('Équipe créée');
  const sent = invited.filter((i) => i.invitation_id).length;
  if (sent > 0) {
    parts.push(
      `${sent} invitation(s) envoyée(s) — chaque joueuse doit l'accepter pour rejoindre l'équipe`
    );
  }
  if (outcome.registration) {
    parts.push(`inscrite au tournoi "${outcome.registration.tournament_name}"`);
  } else if (outcome.application) {
    parts.push(
      `candidature déposée pour le tournoi "${outcome.application.tournament_name}" — le staff la validera`
    );
  } else if (tournamentId) {
    parts.push(
      "L'inscription au tournoi n'a pas pu être effectuée (nombre de joueurs insuffisant ou tournoi complet). Vous pourrez la déposer depuis votre espace équipe."
    );
  }
  return parts.join(' — ');
}

/** Liste noire : alertes (jamais bloquantes), fire-and-forget. */
export function alertBlacklists(
  ctx: OnboardingCtx,
  team: CreatedTeamRow,
  inserted: CreatedMember[]
): void {
  for (const m of inserted) {
    if (!m.battle_tag) continue;
    void alertIfBlacklisted(ctx.db, ctx.tenantId, 'team_create', {
      battleTag: m.battle_tag,
    });
  }
  void alertIfEntityBlacklisted(ctx.db, ctx.tenantId, 'team_create', {
    name: team.name,
  });
}

async function discordIdOf(authUserId: string | null): Promise<string | null> {
  if (!authUserId) return null;
  // Helper canonique (colonne `auth_user_id`).
  const link = await getDiscordLinkForUser(authUserId);
  return link?.discordUserId ?? null;
}

/**
 * `team.created` → le bot provisionne l'équipe (idempotent côté bot). SAUF en
 * inscription individuelle : une « équipe » d'une joueuse ne mérite ni rôle
 * ni salons — un événement solo à trente inscrites en créerait soixante.
 */
export function announceTeamCreated(
  ctx: OnboardingCtx,
  team: CreatedTeamRow,
  accounts: ResolvedAccounts,
  solo: boolean,
  tournamentId: string | null
): void {
  if (solo) {
    ctx.logger.info(
      '[/api/teams/create-with-member] solo: team.created non émis',
      { teamId: team.id, tournamentId }
    );
    return;
  }
  const { managerUserId, captainUserId, creatorUserId } = accounts;
  void (async () => {
    // Mode manager : pas encore de capitaine (la désignée n'a pas accepté) ;
    // on n'en annonce aucune, le créateur reçoit le rôle à sa place.
    const effectiveCaptain = managerUserId ? null : captainUserId;
    const captainDiscordUserId = await discordIdOf(effectiveCaptain);
    const creatorDiscordUserId = managerUserId
      ? await discordIdOf(managerUserId)
      : captainDiscordUserId;
    await emitBotEvent(
      'team.created',
      {
        teamId: team.id,
        name: team.name,
        slug: team.slug ?? null,
        captainAuthUserId: effectiveCaptain,
        captainDiscordUserId,
        creatorAuthUserId: creatorUserId,
        creatorDiscordUserId,
        creatorRole: managerUserId ? 'manager' : 'captain',
        discordRoleId: team.discord_role_id ?? null,
      },
      ctx.tenantId
    );
  })().catch((e) =>
    ctx.logger.error('[botEvents] team.created emit error:', e)
  );
}
