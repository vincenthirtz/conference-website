// features/player/notifications/ui/NotificationPrefsPanel.tsx — préférences
// de la joueuse (lot P15) : opt-in push de CET appareil, grille par canal,
// puis l'abonnement aux annonces & campagnes. Présentationnel.
//
// Le toggle « Annonces & campagnes » est OPT-OUT (abonnée par défaut) : la
// sémantique INVERSE de la grille e-mail au-dessus — d'où sa ligne à part.

import PushOptIn from '@/components/shared/PushOptIn';
import Switch from '@/components/ui/Switch';
import { Card, rubanHelp, rubanStrong } from '@/features/ruban';
import { useT } from '@/lib/i18n/useT';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import type { NotificationChannel, NotificationPrefs } from '../schemas';
import NotificationPrefsGrid from './NotificationPrefsGrid';

export default function NotificationPrefsPanel({
  prefs,
  savingKey,
  onToggle,
}: {
  prefs: NotificationPrefs | null;
  savingKey: string | null;
  onToggle: (
    eventType: string,
    channel: NotificationChannel,
    enabled: boolean
  ) => void;
}) {
  const t = useT(nsPlayerNotifications);
  const broadcast = prefs?.broadcastEmail ?? true;
  return (
    <>
      <div className="mb-4">
        {/* Repli explicite (iOS hors PWA, permission refusée) : c'est ICI
            qu'on vient comprendre pourquoi aucune alerte n'arrive. */}
        <PushOptIn
          audience="player"
          variant="card"
          loginPath="/login"
          showFallback
        />
      </div>

      <NotificationPrefsGrid
        prefs={prefs}
        savingKey={savingKey}
        onToggle={onToggle}
      />

      <Card padding="none" className="mt-4 flex items-center gap-4 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${rubanStrong}`}>
            {t.broadcastTitle}
          </p>
          <p className={rubanHelp}>{t.broadcastDesc}</p>
        </div>
        <Switch
          checked={broadcast}
          disabled={savingKey === 'email:broadcast'}
          onChange={() => onToggle('broadcast', 'email', !broadcast)}
          label={t.broadcastAriaLabel}
        />
      </Card>

      <p className={`mt-3 ${rubanHelp}`}>{t.prefsFootnote}</p>
    </>
  );
}
