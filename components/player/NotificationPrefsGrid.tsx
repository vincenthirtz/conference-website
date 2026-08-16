// components/player/NotificationPrefsGrid.tsx
// Espace joueur — grille de préférences de notifications par canal.
//
// Rendu piloté par la réponse du GET /api/player/push/prefs :
//   { push: { [eventType]: boolean }, email: { [eventType]: boolean } }
// - push  = opt-OUT (clé absente => activé par défaut) ; temps réel.
// - email = opt-IN  (clé absente => désactivé par défaut) ; digest ~2x/jour.
//
// Les deux maps peuvent couvrir des ensembles d'event_types DIFFÉRENTS. On
// affiche une ligne par event_type présent dans l'une OU l'autre map, avec :
//   - une colonne Push : toggle si l'event existe dans `push`, sinon tiret.
//   - une colonne E-mail : toggle si l'event existe dans `email`, sinon tiret.
//
// Le composant est purement présentationnel : il remonte les changements via
// `onToggle(eventType, channel, enabled)` ; l'optimistic update / rollback /
// toast est géré par la page parente.

import { useT } from '@/lib/i18n/useT';
import Switch from '@/components/ui/Switch';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';

type NotificationChannel = 'push' | 'email';

export type NotificationPrefs = {
  push: Record<string, boolean>;
  email: Record<string, boolean>;
};

type Props = {
  prefs: NotificationPrefs | null;
  // Clé en cours d'enregistrement, au format `${channel}:${eventType}`, ou null.
  savingKey: string | null;
  onToggle: (
    eventType: string,
    channel: NotificationChannel,
    enabled: boolean
  ) => void;
};

/**
 * Interrupteur de canal — conservé comme point d'entrée nommé (plusieurs
 * écrans l'importent), mais ce n'est plus qu'un alias du kit partagé.
 */
export function ChannelToggle({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <Switch
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      label={label}
    />
  );
}

export default function NotificationPrefsGrid({
  prefs,
  savingKey,
  onToggle,
}: Props) {
  const t = useT(nsPlayerNotifications);

  // Libellés fusionnés : event types push (existants) + extras email.
  const labels: Record<string, string> = {
    ...t.eventLabels,
    ...t.extraEventLabels,
  };
  const descriptions: Record<string, string> = {
    ...t.eventDescriptions,
    ...t.extraEventDescriptions,
  };

  const pushMap = prefs?.push ?? {};
  const emailMap = prefs?.email ?? {};

  // Union ordonnée des event_types : on respecte l'ordre des libellés connus
  // (eventLabels d'abord, puis extras), puis on ajoute en fin tout event_type
  // inattendu renvoyé par l'API mais sans libellé local.
  const knownOrder = Object.keys(labels);
  const seen = new Set<string>();
  const eventTypes: string[] = [];
  for (const et of knownOrder) {
    if ((et in pushMap || et in emailMap) && !seen.has(et)) {
      eventTypes.push(et);
      seen.add(et);
    }
  }
  for (const et of [...Object.keys(pushMap), ...Object.keys(emailMap)]) {
    if (!seen.has(et)) {
      eventTypes.push(et);
      seen.add(et);
    }
  }

  return (
    <div>
      {/* Hints canaux */}
      <div className="mb-3 space-y-1.5">
        <p className="text-xs text-gray-400">{t.prefsPushHint}</p>
        <p className="text-xs text-gray-400">{t.prefsEmailOptInHint}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl">
        {/* En-tête colonnes */}
        <div className="flex items-center gap-4 border-b border-white/[0.06] px-5 py-3">
          <div className="min-w-0 flex-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t.prefsChannelEvent}
          </div>
          <div className="w-14 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t.prefsChannelPush}
          </div>
          <div className="w-14 text-center text-xs font-semibold uppercase tracking-wide text-gray-400">
            {t.prefsChannelEmail}
          </div>
        </div>

        <div className="divide-y divide-white/[0.06]">
          {eventTypes.map((eventType) => {
            const label = labels[eventType] ?? eventType;
            const description = descriptions[eventType] ?? '';

            const hasPush = eventType in pushMap;
            const hasEmail = eventType in emailMap;
            // push = opt-out (défaut true) ; email = opt-in (défaut false).
            const pushEnabled = pushMap[eventType] ?? true;
            const emailEnabled = emailMap[eventType] ?? false;

            return (
              <div
                key={eventType}
                className="flex items-center gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-white">{label}</p>
                  {description && (
                    <p className="mt-0.5 text-xs text-gray-500">
                      {description}
                    </p>
                  )}
                </div>

                {/* Push */}
                <div className="flex w-14 justify-center">
                  {hasPush ? (
                    <ChannelToggle
                      checked={pushEnabled}
                      disabled={savingKey === `push:${eventType}`}
                      onChange={() => onToggle(eventType, 'push', !pushEnabled)}
                      label={`${t.prefsChannelPush} — ${label}`}
                    />
                  ) : (
                    <span
                      aria-label={t.prefsChannelNotApplicable}
                      title={t.prefsChannelNotApplicable}
                      className="select-none text-gray-600"
                    >
                      —
                    </span>
                  )}
                </div>

                {/* E-mail */}
                <div className="flex w-14 justify-center">
                  {hasEmail ? (
                    <ChannelToggle
                      checked={emailEnabled}
                      disabled={savingKey === `email:${eventType}`}
                      onChange={() =>
                        onToggle(eventType, 'email', !emailEnabled)
                      }
                      label={`${t.prefsChannelEmail} — ${label}`}
                    />
                  ) : (
                    <span
                      aria-label={t.prefsChannelNotApplicable}
                      title={t.prefsChannelNotApplicable}
                      className="select-none text-gray-600"
                    >
                      —
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
