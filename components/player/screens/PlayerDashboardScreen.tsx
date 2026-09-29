// components/player/screens/PlayerDashboardScreen.tsx
//
// Corps du tableau de bord joueuse — archétype FIL du kit « Le Ruban » (lot
// P12, docs/PLAN-industrialisation-joueur.md). Rendu tel quel par l'admin
// (inspection, docs/PLAN-espace-unifie.md) au lieu d'en maintenir une copie.
//
// Deux modes, pilotés par PlayerAreaContext :
//   - self : /player, l'utilisatrice agit sur ses propres données ;
//   - inspection : /admin/users/[id]/player-view, `?as=` sur chaque lecture et
//     toute mutation masquée (readOnly).
//
// L'écran ne fait plus que composer : l'état et les gestes vivent dans
// usePlayerDashboard (features/player/dashboard), les panneaux dans son ui/.
// Les cartes qui lisent leur propre tranche (NextMatchCard, TeamHealthCard,
// MyScrimsCard…) le font toujours de leur côté. Un soir de match, l'action
// principale (le check-in) est collée en bas du pouce.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Router from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import ProfileSummaryCard from '@/components/player/ProfileSummaryCard';
import WelcomeGiftCard from '@/components/player/WelcomeGiftCard';
import SupporterWelcomeCard from '@/components/player/SupporterWelcomeCard';
import DiscordLinkCard from '@/components/player/DiscordLinkCard';
import NetworkOnboardingCard from '@/components/player/NetworkOnboardingCard';
import RegistrationDeadlineBanner from '@/components/player/RegistrationDeadlineBanner';
import InvitationsSection from '@/components/player/InvitationsSection';
import MyScrimsCard from '@/components/player/MyScrimsCard';
import TeamRhythmCard from '@/components/player/TeamRhythmCard';
import TeamMemoryCard from '@/components/player/TeamMemoryCard';
import TeamHealthCard from '@/components/player/TeamHealthCard';
import ProgressionCard from '@/components/player/ProgressionCard';
import TeamCard from '@/components/player/TeamCard';
import DemandesHistory from '@/components/player/DemandesHistory';
import QuickAction from '@/components/player/QuickAction';
import NextMatchCard from '@/components/player/NextMatchCard';
import MatchLineupCard from '@/components/player/MatchLineupCard';
import { PlayerDashboardSkeleton } from '@/components/player/Skeletons';
import TodoBanner from '@/components/player/TodoBanner';
import ScrimPlanningsDashboardCard from '@/components/player/ScrimPlanningsDashboardCard';
import ScrimsHubCard from '@/components/player/ScrimsHubCard';
import SupportAssoCard from '@/components/player/SupportAssoCard';
import PushOptIn from '@/components/shared/PushOptIn';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import ActiveTeamSwitcher from '@/components/player/ActiveTeamSwitcher';
import { ButtonLink, Card } from '@/features/ruban';
import { FilView } from '@/features/player/_shared/ui';
import { usePlayerDashboard } from '@/features/player/dashboard/hooks/usePlayerDashboard';
import CategorySection from '@/features/player/dashboard/ui/CategorySection';
import MatchReadinessCard, {
  CheckinActionLink,
  checkinActionable,
} from '@/features/player/dashboard/ui/MatchReadinessCard';
import PendingScrimsPanel from '@/features/player/dashboard/ui/PendingScrimsPanel';
import {
  buildQuickActions,
  SVG_PATHS,
} from '@/features/player/dashboard/ui/quickActions';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type { NetworkStatus } from '@/features/player/network/schemas';
import type { PlayerWelcomeGiftResponse } from '@/features/player/tcg/schemas';
import { tcgClient } from '@/features/player/tcg/client';
import { networkClient } from '@/features/player/network/client';
import {
  DASHBOARD_ANCHORS,
  hashTargetId,
} from '@/utils/player/dashboardAnchors';

import { logger } from '../../../utils/logger';
import nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';

// Ré-export : la catégorie a déménagé dans le module (lot P12).
export { default as CategorySection } from '@/features/player/dashboard/ui/CategorySection';

const PAGE =
  'min-h-screen bg-[var(--canvas,#07030a)] pt-header text-[var(--t1,#f4edf7)]';

/**
 * Défile jusqu'à la cible du hash courant, deux images plus tard : le temps
 * qu'une `CategorySection` repliée se déplie. Sans cible, ne fait rien.
 */
function scrollToHashTarget() {
  const targetId = hashTargetId(window.location.hash);
  if (!targetId) return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document
        .getElementById(targetId)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  });
}

export default function PlayerDashboardScreen() {
  const t = useT(nsPlayerIndex);
  const locale = useLocale();
  // `next` : une visiteuse déconnectée arrivée par un lien (mail de scrim,
  // notification) revient ICI après la connexion.
  const {
    user,
    token,
    loading: authLoading,
    ready,
  } = usePlayerSession({ redirectTo: '/login?next=/player' });
  const { readOnly, isInspecting, subjectName, subjectId, isActingAs } =
    usePlayerArea();
  const { confirm, dialog } = useConfirmDialog();
  const d = usePlayerDashboard({ ready, token, t, confirm });

  // Lectures PARTAGÉES par deux cartes voisines, faites ici une seule fois
  // (`null` = pas encore de réponse, ou échec : chaque carte se comporte alors
  // comme pendant son propre chargement).
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(
    null
  );
  const [welcomeGift, setWelcomeGift] =
    useState<PlayerWelcomeGiftResponse | null>(null);
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    // Hors inspection seulement : les deux cartes qui la lisent sont masquées
    // en inspection, et la route ne suit pas `?as=`.
    if (!isInspecting) {
      networkClient
        .networkStatus()
        .then((data) => {
          if (!cancelled) setNetworkStatus(data);
        })
        .catch((err: unknown) => {
          logger.error('[player] network-status load error:', err);
        });
    }
    tcgClient
      .welcomeGift({ subjectId, actAs: isActingAs, teamId: null })
      .then((data) => {
        if (!cancelled) setWelcomeGift(data);
      })
      .catch((err: unknown) => {
        logger.error('[player] welcome-gift load error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, isInspecting, subjectId, isActingAs]);

  // Arrivée sur `/player#…` : le navigateur a tenté le défilement pendant le
  // squelette. On le refait une fois le contenu rendu, puis à chaque hash.
  useEffect(() => {
    if (d.loading) return;
    scrollToHashTarget();
    window.addEventListener('hashchange', scrollToHashTarget);
    Router.events.on('hashChangeComplete', scrollToHashTarget);
    return () => {
      window.removeEventListener('hashchange', scrollToHashTarget);
      Router.events.off('hashChangeComplete', scrollToHashTarget);
    };
  }, [d.loading]);

  // `loading` ne retombe qu'une fois la session prête : déconnectée, on ne
  // reste pas sur un squelette qui ne se remplit jamais.
  if (authLoading || (ready && d.loading)) {
    return <PlayerDashboardSkeleton />;
  }

  if (!user) {
    return (
      <div className={PAGE}>
        <div className="mx-auto max-w-md px-4 py-10 pt-header-xl text-center">
          <h1 className="text-3xl font-bold">{t.playerSpace}</h1>
          <p className="mt-4 text-[var(--t2,#c7bfca)]">{t.connectPrompt}</p>
          <ButtonLink
            variant="primary"
            href="/login?next=/player"
            className="mt-8"
          >
            {t.signIn}
          </ButtonLink>
        </div>
      </div>
    );
  }

  // En inspection, `user` est le STAFF : on prend le nom fourni par l'hôte.
  const displayName = isInspecting
    ? subjectName || t.fallbackName
    : user.user_metadata?.display_name ||
      user.user_metadata?.full_name ||
      user.email?.split('@')[0] ||
      t.fallbackName;

  const { team, nextMatch, can } = d;
  const canManage = d.isCaptain || d.isManager;
  const pendingCaptainRequest = d.demandes.find(
    (x) => x.type === 'captain_request' && x.status === 'pending'
  );
  const pendingJoinRequest = d.demandes.find(
    (x) => x.type === 'join' && x.status === 'pending'
  );
  // Un soir de match : le check-in sous le pouce (et plus dans la carte).
  const checkinDocked = !readOnly && checkinActionable(nextMatch);

  return (
    <>
      {dialog}
      <div className={PAGE}>
        <FilView
          columns={1}
          title={format(t.welcome, { name: displayName })}
          subtitle={t.headerSubtitle}
          primaryAction={
            checkinDocked && nextMatch ? (
              <CheckinActionLink nextMatch={nextMatch} t={t} />
            ) : undefined
          }
        >
          {/* Ce qui attend une action, avant tout le reste. Se masque de
              lui-même quand il n'y a rien à faire. */}
          {!isInspecting && <TodoBanner items={d.todo} />}

          {/* Date butoir des inscriptions : la seule information qui périme. */}
          {!isInspecting && user?.id && (
            <RegistrationDeadlineBanner
              userId={user.id}
              networkStatus={networkStatus}
            />
          )}

          {/* Sélecteur d'équipe (manager multi-équipes) : tout ce qui suit
              porte sur l'équipe choisie. */}
          <ActiveTeamSwitcher />

          {d.error && (
            <Card
              padding="sm"
              role="alert"
              aria-live="assertive"
              className="text-red-100"
            >
              {d.error}
            </Card>
          )}

          {/* Invitations reçues ; l'enveloppe porte l'ancre du bandeau « à
              faire », même avant que la liste soit chargée. */}
          {!isInspecting && (
            <div id={DASHBOARD_ANCHORS.invitations} className="scroll-mt-24">
              <InvitationsSection
                onJoined={() => {
                  void d.reload();
                }}
              />
            </div>
          )}

          {/* Compétition : JUSTE après ce qui attend une action — la porte
              d'entrée d'un soir de match. */}
          <CategorySection
            id="competition"
            label={t.catCompetition}
            action={
              isInspecting ? undefined : (
                <Link
                  href="/player/matches"
                  className="shrink-0 text-xs font-medium text-purple-300 transition hover:text-purple-200"
                >
                  {t.competitionAllMatches} <span aria-hidden>→</span>
                </Link>
              )
            }
          >
            <NextMatchCard initialData={nextMatch} />
            <MatchReadinessCard
              nextMatch={nextMatch}
              t={t}
              checkinDocked={checkinDocked}
            />
            {/* Feuille de match : se tait sans match, sans `validate_lineup`,
                ou avant le check-in de l'équipe. */}
            {nextMatch?.match?.id && (
              <MatchLineupCard matchId={nextMatch.match.id} />
            )}
            <ProgressionCard />
            {team && !isInspecting && <TeamMemoryCard />}
          </CategorySection>

          {!isInspecting && (
            <PushOptIn audience="player" variant="card" loginPath="/login" />
          )}
          {!isInspecting && <SupportAssoCard />}
          {!isInspecting && user?.id && (
            <NetworkOnboardingCard userId={user.id} status={networkStatus} />
          )}

          {/* Profil & équipe */}
          <CategorySection id="profile-team" label={t.catProfileTeam}>
            <div className="grid gap-6 md:grid-cols-2">
              {/* En inspection ce serait la fiche du staff. */}
              {!isInspecting && (
                <ProfileSummaryCard user={user} displayName={displayName} />
              )}
              <TeamCard
                team={team}
                isCaptain={d.isCaptain}
                pendingCaptainRequest={pendingCaptainRequest}
                pendingJoinRequest={pendingJoinRequest}
                onLeaveTeam={readOnly ? undefined : d.leaveTeam}
                members={d.members}
              />
            </div>
            {team && canManage && <TeamHealthCard />}
            {team && <TeamRhythmCard />}
            {/* id : cible du lien « lier Discord » de la checklist réseau. */}
            {!isInspecting && (
              <div id="discord-link" className="scroll-mt-24">
                <DiscordLinkCard />
              </div>
            )}
          </CategorySection>

          {/* Scrims : réservée à qui gère les scrims d'une équipe. */}
          {team && d.canManageScrims && (
            <CategorySection id="scrims" label={t.catScrims}>
              <ScrimsHubCard
                team={team}
                isCaptain={d.isCaptain}
                isManager={d.isManager}
                pendingCount={d.pendingScrims.length}
                gridsCount={d.scrimPlannings.length}
                openForScrim={!!team.open_for_scrim}
                onToggle={readOnly ? undefined : d.toggleScrims}
                toggling={d.scrimToggling}
                t={t}
              />
              <MyScrimsCard />
              <PendingScrimsPanel
                scrims={d.pendingScrims}
                busyId={d.scrimActionId}
                error={d.scrimError}
                locale={locale}
                t={t}
                onAction={readOnly ? undefined : d.scrimAction}
              />
              {/* Ancre ciblée par le CTA « Voir les grilles » du hub. */}
              <div id="scrim-plannings" className="scroll-mt-24">
                <ScrimPlanningsDashboardCard entries={d.scrimPlannings} />
              </div>
            </CategorySection>
          )}

          {/* Actions rapides */}
          {team && (
            <CategorySection id="quick-actions" label={t.catQuickActions}>
              <Card>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {buildQuickActions({
                    team,
                    isCaptain: d.isCaptain,
                    isManager: d.isManager,
                    can,
                    unreadMessages: d.unreadMessages,
                    t,
                  }).map((action) => (
                    <QuickAction key={action.href} {...action} />
                  ))}
                </div>
              </Card>
            </CategorySection>
          )}

          {/* Ma collection (TCG) : SANS condition d'équipe — on reçoit un
              paquet dès sa première victoire, scrim compris. */}
          <CategorySection id="tcg" label={t.catTcg}>
            <WelcomeGiftCard data={welcomeGift} />
            <SupporterWelcomeCard data={welcomeGift} />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickAction
                href="/player/tcg"
                label={t.qaTcg}
                description={t.qaTcgDesc}
                tone="purple"
              />
              <QuickAction
                href="/player/tcg-guide"
                label={t.qaTcgGuide}
                description={t.qaTcgGuideDesc}
                tone="purple"
              />
            </div>
          </CategorySection>

          {/* Pronostics : ouverts à tout compte, supportrices comprises. */}
          <CategorySection id="predictions" label={t.catPredictions}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <QuickAction
                href="/player/pronostics"
                label={t.qaPredictions}
                description={t.qaPredictionsDesc}
                tone="emerald"
              />
            </div>
          </CategorySection>

          {/* Rejoindre le cast — pour les joueuses SANS équipe. */}
          {!team && (
            <Card as="section">
              <h2 className="mb-4 text-lg font-semibold">{t.wantToCast}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                <QuickAction
                  href="/player/caster-application"
                  label={t.qaBecomeCaster}
                  description={t.qaJoinCast}
                  iconPath={SVG_PATHS.caster}
                  tone="cyan"
                />
              </div>
            </Card>
          )}

          {/* Activité : l'en-tête n'existe que s'il y a des demandes. */}
          {d.demandes.length > 0 && (
            <CategorySection id="activity" label={t.catActivity}>
              <DemandesHistory
                demandes={d.demandes}
                onCancel={readOnly ? undefined : d.cancelDemande}
              />
            </CategorySection>
          )}

          <div className="flex flex-wrap gap-2">
            <ButtonLink size="sm" href="/">
              {t.backToSite}
            </ButtonLink>
            <ButtonLink size="sm" href="/tournaments">
              {t.viewTournaments}
            </ButtonLink>
          </div>
        </FilView>
      </div>
    </>
  );
}
