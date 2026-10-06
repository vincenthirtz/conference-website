// components/player/screens/PlayerManageTeamScreen.tsx
//
// « Gérer mon équipe » — coquille de l'archétype FICHE (lot P10,
// docs/PLAN-industrialisation-joueur.md). L'état et les gestes vivent dans
// `useManageTeamScreen`, les panneaux dans features/player/team/ui ; cet
// écran ne fait que les composer, dans l'ordre où la capitaine les lit.
//
// En inspection admin (`readOnly`), l'écran reste la photo fidèle de ce que
// voit la capitaine — roster, invitations en attente, demandes — mais tout
// ce qui agit disparaît. En act-as (vue capitaine), les gestes portent la
// portée du SUJET (`?as=…&act=1`), journalisés côté serveur.

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { loginHrefFor } from '@/utils/player/sessionExpiry';
import { useStaffSession } from '@/hooks/useStaffSession';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import CopyButton from '@/components/player/CopyButton';
import FreePlayersSection from '@/components/player/FreePlayersSection';
import TeamJoinLinkPanel from '@/components/player/TeamJoinLinkPanel';
import MemberRightsPanel from '@/components/player/MemberRightsPanel';
import BattlenetVerifyCard from '@/components/player/BattlenetVerifyCard';
import RegistrationDeadlineBanner from '@/components/player/RegistrationDeadlineBanner';
import TeamRegistrationCard from '@/components/player/TeamRegistrationCard';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import ActiveTeamSwitcher from '@/components/player/ActiveTeamSwitcher';
import { format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { FicheView } from '@/features/player/_shared/ui';
import { useManageTeamScreen } from '@/features/player/team/hooks/useManageTeamScreen';
import TeamHeaderBlock from '@/features/player/team/ui/TeamHeaderBlock';
import RoleScopePanel from '@/features/player/team/ui/RoleScopePanel';
import TeamOpennessPanel from '@/features/player/team/ui/TeamOpennessPanel';
import InviteByEmailPanel from '@/features/player/team/ui/InviteByEmailPanel';
import RosterPanel from '@/features/player/team/ui/RosterPanel';
import SentInvitationsPanel from '@/features/player/team/ui/SentInvitationsPanel';
import JoinRequestsPanel from '@/features/player/team/ui/JoinRequestsPanel';
import {
  ManageTeamError,
  ManageTeamNoTeam,
} from '@/features/player/team/ui/ManageTeamFallback';

export default function PlayerManageTeamScreen() {
  const router = useRouter();
  const locale = useLocale();
  const { withSubject, isInspecting } = usePlayerArea();
  const { withTeam } = useActiveTeam();
  // Un admin sans équipe arrivait ici sur un refus sec, alors que la liste
  // des joueuses libres lui est ouverte côté administration.
  const { staffPermissions } = useStaffSession();
  const staffSeesFreePlayers = staffPermissions.includes('manage_teams');

  // Reconnexion qui RAMÈNE ici, `?welcome=1` et équipe choisie compris.
  const s = useManageTeamScreen(loginHrefFor(router.asPath));
  const { t, team, actions: a } = s;

  // Onboarding post-création (magic-link → `?welcome=1`) : le meilleur moment
  // pour proposer la vérification Battle.net. Refermable.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const showWelcome =
    !isInspecting && router.query.welcome === '1' && !welcomeDismissed;

  if (s.loading) return <PlayerPageSkeleton rows={4} />;
  // Une panne réseau ne se déguise pas en refus : on propose de réessayer.
  if (s.failed) return <ManageTeamError t={t} onRetry={s.retry} />;
  // Seule l'absence totale d'équipe reste un refus.
  if (!team) {
    return (
      <ManageTeamNoTeam t={t} staffSeesFreePlayers={staffSeesFreePlayers} />
    );
  }

  const scopeUrl = (url: string) => withTeam(withSubject(url));
  const canEditRoster = s.canDo('manage_roster');
  const canSeeRoster = s.can('manage_roster');

  return (
    <>
      {s.dialog}
      <Head>
        <title>
          {format(s.canManage ? t.tabTitle : t.tabTitleMember, {
            name: team.name,
          })}
        </title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-3xl mx-auto py-10 pt-header">
          <div className="px-4">
            <Link
              href="/player"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
            >
              &larr; {t.backToSpace}
            </Link>
            {showWelcome && (
              <BattlenetVerifyCard
                variant="onboarding"
                hideWhenVerified
                // `welcome=1` gardé : la carte porte le toast du retour Blizzard.
                returnTo="/player/manage-team?welcome=1"
                onDismiss={() => setWelcomeDismissed(true)}
              />
            )}
          </div>

          <FicheView
            header={
              <TeamHeaderBlock
                team={team}
                canEditPublicPage={s.can('edit_public_page')}
                t={t}
              />
            }
            status={s.successMsg}
          >
            {/* Date butoir : c'est ici que se compose un roster. */}
            {!isInspecting && s.sessionUserId && (
              <RegistrationDeadlineBanner userId={s.sessionUserId} />
            )}
            {/* Manager multi-équipes : tout ce qui suit porte sur l'équipe
                choisie. */}
            <ActiveTeamSwitcher />
            {/* On nomme les droits avant que leur absence ne se remarque. */}
            {s.showRoleScope && (
              <RoleScopePanel
                roleLabel={s.roleLabel(s.viewerRole)}
                permissions={s.permissions}
                t={t}
              />
            )}
            <TeamRegistrationCard />

            {s.error && (
              <div
                role="alert"
                aria-live="assertive"
                className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
              >
                {s.error}
              </div>
            )}

            <TeamOpennessPanel
              t={t}
              recruitment={{
                on: !!team.is_joinable,
                editable: s.canDo('manage_join_requests'),
                busy: s.actionLoading === 'joinable',
                onToggle: a.toggleRecruitment,
              }}
              scrims={{
                on: !!team.open_for_scrim,
                editable: s.canDo('manage_scrims'),
                busy: s.actionLoading === 'scrim-open',
                onToggle: a.toggleScrims,
              }}
            />

            {canEditRoster && (
              <InviteByEmailPanel
                t={t}
                hasCaptain={s.hasCaptain}
                busy={s.actionLoading === 'invite'}
                result={s.inviteResult}
                onInvite={a.invite}
                copyButton={(url) => (
                  <CopyButton value={url} label={t.inviteCopyLink} />
                )}
              />
            )}
            {/* Le pendant sans e-mail : « comment je fais entrer quelqu'un ? » */}
            {canEditRoster && (
              <TeamJoinLinkPanel scopeUrl={scopeUrl} isCaptain={s.isCaptain} />
            )}

            <RosterPanel
              t={t}
              tRank={s.tRank}
              locale={locale}
              team={team}
              members={s.members}
              hasCaptain={s.hasCaptain}
              canEditRoster={canEditRoster}
              canEditTeamInfo={s.canDo('manage_team_info')}
              actionLoading={s.actionLoading}
              memberLabel={s.memberLabel}
              roleLabel={s.roleLabel}
              onCommitTeamSkillRating={a.commitTeamSkillRating}
              onCommitTeamIdentity={a.commitTeamIdentity}
              rowHandlers={(m) => ({
                confirmingRemoval: s.pendingRemoval === m.id,
                roleLocked: s.isRoleLockedFor(m),
                rightsOpen: !!m.user_id && s.rightsFor === m.user_id,
                onCommitBattleTag: (raw) => a.commitBattleTag(m, raw),
                onCommitSkillRating: (raw) => a.commitSkillRating(m, raw),
                onSpecialty: (value) => void a.changeSpecialty(m.id, value),
                onRole: (role) => void a.changeRole(m.id, role),
                onToggleRights: () => m.user_id && s.toggleRights(m.user_id),
                onPromote: () => void a.promote(m),
                onAskRemoval: () => s.setPendingRemoval(m.id),
                onCancelRemoval: () => s.setPendingRemoval(null),
                onRemove: () => void a.remove(m.id),
              })}
              rightsPanel={(m) =>
                canEditRoster && m.user_id && s.rightsFor === m.user_id ? (
                  <MemberRightsPanel memberUserId={m.user_id} />
                ) : null
              }
            />

            {/* Données de gestion, refusées par le serveur à une membre
                simple : une section vide lui laisserait croire qu'elle peut
                agir. */}
            {canSeeRoster && (
              <SentInvitationsPanel
                t={t}
                locale={locale}
                invitations={s.sentInvitations}
                failed={s.invitationsError}
                editable={canEditRoster}
                actionLoading={s.actionLoading}
                roleLabel={s.roleLabel}
                onResend={(inv) => void a.resend(inv)}
                onCancel={(inv) => void a.cancel(inv)}
              />
            )}
            {s.can('manage_join_requests') && (
              <JoinRequestsPanel
                t={t}
                locale={locale}
                requests={s.joinRequests}
                editable={s.canDo('manage_join_requests')}
                actionLoading={s.actionLoading}
                roleLabel={s.roleLabel}
                onDecide={(id, action, battleTag, reason) =>
                  void a.decideJoin(id, action, battleTag, reason)
                }
              />
            )}
            {/* Outil de recrutement : réservé à qui recrute. */}
            {!isInspecting && canSeeRoster && (
              <FreePlayersSection teamId={team.id} />
            )}
          </FicheView>
        </main>
      </div>
    </>
  );
}
