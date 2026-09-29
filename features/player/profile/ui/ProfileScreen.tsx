// features/player/profile/ui/ProfileScreen.tsx — écran « Mon profil » sur
// l'archétype FICHE (lot P9) : en-tête d'entité, sections du compte, fiche
// d'identité en colonne de droite (après les sections sous `xl`).
//
// Ordre des sections INCHANGÉ — il porte des règles (Twitch avant les cartes
// TCG dont il est la condition, héros avant la carte dont il est le repli).
// Les cartes de rattachement et de préférences restent celles de
// components/player (chacune porte son état) ; la migration des comptes liés
// est un module à part.
//
// PAS EN INSPECTION : toutes les routes de l'écran sont « soi seulement ».
// Rendu sous l'inspection staff, il montrerait le compte DU STAFF sous le nom
// de la joueuse inspectée — il ne rend donc rien.

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsPlayerProfile from '@/lib/i18n/locales/fr/playerProfile';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import DiscoveryCard from '@/components/player/DiscoveryCard';
import BattlenetVerifyCard from '@/components/player/BattlenetVerifyCard';
import TcgPhotoCard from '@/components/player/TcgPhotoCard';
import HeroPreferencesCard from '@/components/player/HeroPreferencesCard';
import TwitchLinkCard from '@/components/player/TwitchLinkCard';
import DiscordLinkCard from '@/components/player/DiscordLinkCard';
import PlayerAvatar from '@/components/player/PlayerAvatar';
import {
  ButtonLink,
  Chip,
  EntityHeader,
  FicheSection,
  MetaList,
} from '@/features/ruban';
import FicheView from '../../_shared/ui/FicheView';
import ProfileEditPanel from './ProfileEditPanel';
import { EmailChangePanel, PasswordChangePanel } from './AccountSecurityPanels';
import DataRightsPanel from './DataRightsPanel';

/**
 * Le retrait du TCG, chargé À LA DEMANDE : sous la ligne de flottaison d'une
 * longue page de réglages, avec sa propre boîte de dialogue (5 ko gzippés à
 * chaque visite en statique). Un contrôle de consentement doit être
 * JOIGNABLE, pas présent dans le premier octet.
 */
const TcgExclusionCard = dynamic(
  () => import('@/components/player/TcgExclusionCard'),
  { ssr: false, loading: () => null }
);

export default function ProfileScreen() {
  const { isInspecting } = usePlayerArea();
  if (isInspecting) return null;
  return <ProfileFiche />;
}

function ProfileFiche() {
  const router = useRouter();
  const t = useT(nsPlayerProfile);
  const locale = useLocale();
  // La coquille redirige la visiteuse non connectée ; l'écran ne fait que lire.
  const { user, loading } = usePlayerSession({ redirect: false });

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-header">
        <div
          role="status"
          aria-label={t.pageTitle}
          className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 pt-header-xl text-center">
        <h1 className="text-3xl text-[var(--t1,#f4edf7)]">
          {t.signedOutTitle}
        </h1>
        <p className="mt-4 text-[var(--t3,#a39ba6)]">{t.signedOutText}</p>
        <div className="mt-8">
          <ButtonLink href="/login?next=/player/profile" variant="primary">
            {t.signIn}
          </ButtonLink>
        </div>
      </main>
    );
  }

  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const displayName =
    (meta.display_name as string) ||
    (meta.full_name as string) ||
    user.email?.split('@')[0] ||
    t.defaultName;
  // Mapping complet : un manager/coach/remplaçant ne retombe pas sur « Joueuse ».
  const roleLabels: Record<string, string> = {
    captain: t.roleCaptain,
    player: t.rolePlayer,
    manager: t.roleManager,
    coach: t.roleCoach,
    substitute: t.roleSubstitute,
    supporter: t.roleSupporter,
  };
  const role = (meta.role as string | undefined) || 'player';
  const avatarUrl = (meta.avatar_url as string) || '';
  const battleTag = (meta.battle_tag as string) || '';
  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleString(locale)
    : '—';
  // Arrivée depuis la liaison Discord (qui ne demande jamais de BattleTag) :
  // le champ est mis en avant plutôt que découvert plus tard, manquant.
  const needsBattleTagSetup =
    router.query.setup === 'battletag' && !battleTag.trim();

  return (
    <main className="pt-header pb-16">
      <FicheView
        header={
          <EntityHeader
            crest={
              <PlayerAvatar
                avatarUrl={avatarUrl || null}
                teamName={null}
                teamSlug={null}
                teamLogoUrl={null}
                label={displayName}
                size={52}
                className="h-[52px] w-[52px]"
                initialsClassName="text-lg"
              />
            }
            title={t.pageTitle}
            meta={t.pageSubtitle}
            actions={
              <Link
                href="/player"
                className="text-[13px] text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
              >
                &larr; {t.backToDashboard}
              </Link>
            }
          />
        }
        aside={
          <FicheSection
            title={displayName}
            aside={<Chip tone="brand">{roleLabels[role] ?? t.rolePlayer}</Chip>}
          >
            <MetaList
              items={[
                { label: t.email, value: user.email },
                { label: t.battleTag, value: battleTag || '—' },
                { label: t.createdOn, value: createdAt },
                {
                  label: t.userId,
                  value: <span className="break-all">{user.id}</span>,
                },
              ]}
            />
          </FicheSection>
        }
      >
        <ProfileEditPanel
          userId={user.id}
          displayName={displayName}
          meta={meta}
          needsBattleTagSetup={needsBattleTagSetup}
        />
        {/* Découverte / Réseau joueurs — opt-in global, invisible par défaut. */}
        <DiscoveryCard />
        {/* Battle.net OAuth — ne rend rien si la fonctionnalité dort. */}
        <BattlenetVerifyCard variant="section" />
        {/* Twitch AVANT les cartes TCG : c'en est la condition d'accès. */}
        <TwitchLinkCard />
        {/* Discord : seule sortie en libre-service du piège du double compte. */}
        <DiscordLinkCard id="discord" />
        {/* Héros AVANT la carte : ils en sont le repli sans photo. */}
        <HeroPreferencesCard />
        {/* Ancre de l'invitation posée sur /player/tcg. */}
        <div id="tcg-photo" className="scroll-mt-24">
          <TcgPhotoCard displayName={displayName} />
        </div>
        {/* Retrait TOTAL, à part du dépôt : joignable même si la carte échoue. */}
        <TcgExclusionCard />
        <EmailChangePanel email={user.email ?? ''} />
        <PasswordChangePanel email={user.email ?? ''} />
        <DataRightsPanel />
      </FicheView>
    </main>
  );
}
