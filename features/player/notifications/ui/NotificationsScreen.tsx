// features/player/notifications/ui/NotificationsScreen.tsx — écran
// « Notifications » sur l'archétype FIL (lot P15) :
//   (a) invitations reçues (masquées en lecture seule) ;
//   (b) « En attente » : compteurs actionnables (GET /api/player/notifications) ;
//   (c) préférences : opt-in push de l'appareil + grille par canal + annonces
//       (GET/PUT /api/player/push/prefs).
// Pas d'historique : la PWA ne stocke pas les notifications passées.
//
// INSPECTION (player-view admin) : les COMPTEURS suivent le sujet ; les
// préférences, personnelles (appareil + consentement), ne le suivent pas —
// elles ne sont ni lues ni montrées, la route refuse d'ailleurs `?as=`.

import { useState } from 'react';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import InvitationsSection from '@/components/player/InvitationsSection';
import BattlenetVerifyCard from '@/components/player/BattlenetVerifyCard';
import ActiveTeamSwitcher from '@/components/player/ActiveTeamSwitcher';
import { ButtonLink, rubanErrBox, rubanSpinner } from '@/features/ruban';
import { FilView } from '../../_shared/ui';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import {
  useNotificationCounters,
  useNotificationPrefs,
  useToggleNotificationPref,
} from '../hooks/useNotifications';
import type { NotificationChannel } from '../schemas';
import PendingActions from './PendingActions';
import NotificationPrefsPanel from './NotificationPrefsPanel';

const LOGIN = '/login?next=/player/notifications';
const H2 = 'mb-4 text-lg font-semibold text-[var(--t1,#f4edf7)]';

export default function NotificationsScreen() {
  const t = useT(nsPlayerNotifications);
  const { addToast } = useToast();
  const errorText = usePlayerErrorText();
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirectTo: LOGIN,
  });
  const { readOnly, isInspecting } = usePlayerArea();
  // Publie les équipes gérées dans ActiveTeamContext : le sélecteur dit QUELLE
  // équipe l'écran montre (et efface un choix mémorisé périmé).
  useManagedTeam();

  const counters = useNotificationCounters(ready);
  const prefs = useNotificationPrefs(ready && !isInspecting);
  const toggle = useToggleNotificationPref();
  // Passe à vrai dès qu'une invitation est acceptée : propose alors la
  // vérification Battle.net (personnelle, donc attrapée ici).
  const [justJoined, setJustJoined] = useState(false);

  if (authLoading || (ready && counters.isPending && !prefs.data)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center pt-header">
        <div role="status" aria-label={t.pageTitle} className={rubanSpinner} />
      </div>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 pt-header-xl text-center">
        <h1 className="text-3xl text-[var(--t1,#f4edf7)]">{t.pageTitle}</h1>
        <p className="mt-4 text-[var(--t3,#a39ba6)]">{t.signedOutIntro}</p>
        <div className="mt-8">
          <ButtonLink href={LOGIN} variant="primary">
            {t.signIn}
          </ButtonLink>
        </div>
      </main>
    );
  }

  // Erreur seulement si RIEN n'a pu être lu (hors inspection, comme avant).
  const failed = !isInspecting && counters.isError && prefs.isError;

  const saving = toggle.isPending ? toggle.variables : undefined;
  const handleToggle = (
    eventType: string,
    channel: NotificationChannel,
    enabled: boolean
  ) =>
    toggle.mutate(
      { eventType, channel, enabled },
      {
        onSuccess: () => addToast(t.prefSaved, 'success'),
        onError: (err) => addToast(errorText(err, t.prefSaveError), 'error'),
      }
    );

  return (
    <div className="pt-header pb-16">
      <FilView
        title={t.pageTitle}
        subtitle={t.intro}
        actions={
          <ButtonLink href="/player" variant="ghost" size="sm">
            &larr; {t.backToDashboard}
          </ButtonLink>
        }
        columns={1}
      >
        <ActiveTeamSwitcher />

        {failed && (
          <div role="alert" aria-live="assertive" className={rubanErrBox}>
            {t.loadError}
          </div>
        )}

        {/* En inspection, /api/player/invitations se lit mais accepter à la
            place de quelqu'un ne se fait pas : la section est masquée. */}
        {!readOnly && (
          <InvitationsSection onJoined={() => setJustJoined(true)} />
        )}

        {justJoined && (
          <BattlenetVerifyCard
            variant="onboarding"
            hideWhenVerified
            returnTo="/player/notifications"
          />
        )}

        <section>
          <h2 className={H2}>{t.pendingHeading}</h2>
          <PendingActions counters={counters.data} />
        </section>

        {!isInspecting && (
          <section>
            <h2 className={H2}>{t.prefsHeading}</h2>
            <NotificationPrefsPanel
              prefs={prefs.data ?? null}
              savingKey={
                saving ? `${saving.channel}:${saving.eventType}` : null
              }
              onToggle={handleToggle}
            />
          </section>
        )}
      </FilView>
    </div>
  );
}
