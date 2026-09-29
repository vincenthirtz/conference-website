// features/player/notifications/ui/NotificationPrefsGrid.tsx — la grille
// « type d'événement × canal » des préférences (lot P15). Présentationnelle :
// l'état et le geste viennent de l'écran.
//
// Push = OPT-OUT (absent = activé), e-mail = OPT-IN (absent = désactivé). Les
// deux cartes peuvent couvrir des event_types DIFFÉRENTS : un couple absent
// d'un canal s'affiche « — » (indisponible), jamais comme un interrupteur.

import { Card, rubanEyebrow, rubanHelp, rubanStrong } from '@/features/ruban';
import Switch from '@/components/ui/Switch';
import { useT } from '@/lib/i18n/useT';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import type { NotificationChannel, NotificationPrefs } from '../schemas';

type Props = {
  prefs: NotificationPrefs | null;
  /** `${channel}:${eventType}` en cours d'enregistrement, ou null. */
  savingKey: string | null;
  onToggle: (
    eventType: string,
    channel: NotificationChannel,
    enabled: boolean
  ) => void;
};

/** Ordre : libellés connus d'abord, puis tout event_type inattendu. */
function orderedEventTypes(
  known: string[],
  pushMap: Record<string, boolean>,
  emailMap: Record<string, boolean>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const et of [
    ...known.filter((k) => k in pushMap || k in emailMap),
    ...Object.keys(pushMap),
    ...Object.keys(emailMap),
  ]) {
    if (!seen.has(et)) {
      seen.add(et);
      out.push(et);
    }
  }
  return out;
}

export default function NotificationPrefsGrid({
  prefs,
  savingKey,
  onToggle,
}: Props) {
  const t = useT(nsPlayerNotifications);
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
  const eventTypes = orderedEventTypes(Object.keys(labels), pushMap, emailMap);

  const cell = (
    eventType: string,
    label: string,
    channel: NotificationChannel,
    present: boolean,
    enabled: boolean,
    channelLabel: string
  ) => (
    <div className="flex w-14 justify-center">
      {present ? (
        <Switch
          checked={enabled}
          disabled={savingKey === `${channel}:${eventType}`}
          onChange={() => onToggle(eventType, channel, !enabled)}
          label={`${channelLabel} — ${label}`}
        />
      ) : (
        <span
          aria-label={t.prefsChannelNotApplicable}
          title={t.prefsChannelNotApplicable}
          className="select-none text-[var(--t4,#807984)]"
        >
          —
        </span>
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-3 space-y-1.5">
        <p className={rubanHelp}>{t.prefsPushHint}</p>
        <p className={rubanHelp}>{t.prefsEmailOptInHint}</p>
      </div>
      <Card padding="none">
        <div className="flex items-center gap-4 border-b border-[var(--line,rgba(194,196,201,.12))] px-5 py-3">
          <div className={`min-w-0 flex-1 ${rubanEyebrow}`}>
            {t.prefsChannelEvent}
          </div>
          <div className={`w-14 text-center ${rubanEyebrow}`}>
            {t.prefsChannelPush}
          </div>
          <div className={`w-14 text-center ${rubanEyebrow}`}>
            {t.prefsChannelEmail}
          </div>
        </div>
        <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
          {eventTypes.map((eventType) => {
            const label = labels[eventType] ?? eventType;
            const description = descriptions[eventType] ?? '';
            return (
              <div
                key={eventType}
                className="flex items-center gap-4 px-5 py-4"
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${rubanStrong}`}>
                    {label}
                  </p>
                  {description && <p className={rubanHelp}>{description}</p>}
                </div>
                {cell(
                  eventType,
                  label,
                  'push',
                  eventType in pushMap,
                  pushMap[eventType] ?? true,
                  t.prefsChannelPush
                )}
                {cell(
                  eventType,
                  label,
                  'email',
                  eventType in emailMap,
                  emailMap[eventType] ?? false,
                  t.prefsChannelEmail
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
