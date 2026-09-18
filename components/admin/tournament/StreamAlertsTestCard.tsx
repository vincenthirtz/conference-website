// components/admin/tournament/StreamAlertsTestCard.tsx
//
// « Lancer une alerte de test » : un type, un bouton, et l'alerte apparaît dans
// la source OBS en moins de cinq secondes — par le même chemin qu'un vrai
// événement Twitch (cf. `pages/api/admin/stream-alert-test.ts`).
//
// Les RÈGLES s'appliquent à l'alerte de test comme aux vraies : un type éteint
// ou un seuil trop haut la filtre. C'est dit à côté du bouton, sinon « rien ne
// s'affiche » passerait pour une panne.

import { useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStreamAlerts from '@/lib/i18n/locales/admin-fr/adminStreamAlerts';
import { TWITCH_ALERT_KINDS, type AlertKind } from '@/utils/overlay/alertBox';
import { logger } from '@/utils/logger';

export default function StreamAlertsTestCard() {
  const t = useAdminT(nsAdminStreamAlerts);
  const { adminFetch } = useAdminFetch();
  const { addToast } = useToast();
  const [kind, setKind] = useState<AlertKind>('follow');
  const [busy, setBusy] = useState(false);

  const fire = async () => {
    setBusy(true);
    try {
      const res = await adminFetch('/api/admin/stream-alert-test', {
        method: 'POST',
        body: JSON.stringify({ kind }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        addToast(json?.error ?? t.testError, 'error');
        return;
      }
      addToast(t.testSent, 'success');
    } catch (err) {
      logger.error('[admin/stream-alerts-test] error:', err);
      addToast(t.testError, 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border border-neutral-700/40 bg-neutral-900/50 p-4">
      <h4 className="text-sm font-semibold text-white">{t.testHeading}</h4>
      <p className="mt-1 text-xs text-neutral-400">{t.testHelp}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label htmlFor="stream-alerts-test-kind" className="sr-only">
          {t.testKindLabel}
        </label>
        <select
          id="stream-alerts-test-kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as AlertKind)}
          className="rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
        >
          {TWITCH_ALERT_KINDS.map((k) => (
            <option key={k} value={k}>
              {t[`kind_${k}` as keyof typeof t] as string}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void fire()}
          disabled={busy}
          className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t.testSending : t.testButton}
        </button>
      </div>
    </section>
  );
}
