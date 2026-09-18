// components/admin/tournament/StreamAlertsTwitchCard.tsx
//
// « Twitch envoie-t-il bien ses événements à la boîte d'alertes ? » — l'état
// des abonnements EventSub, et le bouton qui les crée.
//
// POURQUOI CETTE CARTE EXISTE. `/api/admin/twitch/eventsub/alerts` savait
// créer les abonnements, mais aucun écran ne l'appelait : la boîte n'a donc
// jamais rien reçu de Twitch — sans erreur, sans trace (constaté le
// 2026-09-18, zéro ligne dans `stream_alert_events`). Les dons HelloAsso, eux,
// arrivent par un autre chemin, d'où l'illusion que « la boîte marche ».
//
// UN TYPE, UNE LIGNE. Le POST crée ce qu'il peut et rapporte le reste type par
// type (scope manquant, refus Twitch) : on l'affiche tel quel, pour que la
// régie sache si elle doit reconnecter la chaîne ou regarder ailleurs.
//
// SE MASQUE SUR UN 403, comme `TcgDropHealthCard` : la route exige
// `manage_broadcast`, et une casteuse ne doit pas voir un bloc en erreur.

import { useCallback, useEffect, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminStreamAlerts from '@/lib/i18n/locales/admin-fr/adminStreamAlerts';
import { logger } from '@/utils/logger';

const ENDPOINT = '/api/admin/twitch/eventsub/alerts';

type SubState = {
  type: string;
  scope: string | null;
  subscribed: boolean;
  missingScope: boolean;
  error?: string;
};

type State = {
  secretConfigured?: boolean;
  readable?: boolean;
  subscriptions: SubState[];
};

/** Erreur « métier » de la route : chaîne non connectée, Twitch non configuré… */
type Blocked = { message: string };

export default function StreamAlertsTwitchCard() {
  const t = useAdminT(nsAdminStreamAlerts);
  const { adminFetch } = useAdminFetch();
  const { addToast } = useToast();

  // `undefined` = pas encore lu ; `null` = carte masquée (403, panne réseau).
  const [state, setState] = useState<State | Blocked | null | undefined>(
    undefined
  );
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetch(ENDPOINT);
      const json = await res.json().catch(() => null);
      if (res.status === 403) return setState(null);
      if (!res.ok) {
        return setState({ message: json?.error ?? `HTTP ${res.status}` });
      }
      setState(json as State);
    } catch (err) {
      logger.error('[admin/stream-alerts-twitch] load error:', err);
      setState(null);
    }
  }, [adminFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  const subscribe = async () => {
    setBusy(true);
    try {
      const res = await adminFetch(ENDPOINT, { method: 'POST' });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        addToast(json?.error ?? t.twitchSubscribeError, 'error');
        return;
      }
      // Le POST rend l'état type par type, erreurs Twitch comprises : on le
      // garde tel quel plutôt que de relire (un GET perdrait `error`).
      setState((prev) => ({
        ...(prev && 'subscriptions' in prev ? prev : {}),
        subscriptions: (json as State).subscriptions,
      }));
      const ok = (json as State).subscriptions.every((s) => s.subscribed);
      addToast(
        ok ? t.twitchSubscribed : t.twitchSubscribedPartial,
        ok ? 'success' : 'warning'
      );
    } catch (err) {
      logger.error('[admin/stream-alerts-twitch] subscribe error:', err);
      addToast(t.twitchSubscribeError, 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return null;

  if ('message' in state) {
    return (
      <section className="rounded-xl border border-red-500/40 bg-red-500/10 p-4">
        <h4 className="text-sm font-semibold text-white">{t.twitchHeading}</h4>
        <p className="mt-1 text-xs text-red-200">{state.message}</p>
      </section>
    );
  }

  const subs = state.subscriptions;
  const active = subs.filter((s) => s.subscribed).length;
  const healthy = active === subs.length && subs.length > 0;

  return (
    <section className="rounded-xl border border-neutral-700/40 bg-neutral-900/50 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-white">{t.twitchHeading}</h4>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            healthy
              ? 'bg-emerald-500/15 text-emerald-300'
              : 'bg-red-500/15 text-red-300'
          }`}
        >
          {format(t.twitchCount, { active, total: subs.length })}
        </span>
      </div>
      <p className="mt-1 text-xs text-neutral-400">{t.twitchHelp}</p>

      {state.secretConfigured === false && (
        <p className="mt-2 text-xs text-red-200">{t.twitchSecretMissing}</p>
      )}
      {state.readable === false && (
        <p className="mt-2 text-xs text-neutral-400">{t.twitchUnreadable}</p>
      )}

      <ul className="mt-3 space-y-1">
        {subs.map((s) => (
          <li key={s.type} className="flex flex-wrap gap-x-2 text-xs">
            <span className="font-mono text-neutral-300">{s.type}</span>
            <span
              className={s.subscribed ? 'text-emerald-300' : 'text-red-300'}
            >
              {s.subscribed
                ? t.twitchSubOk
                : s.missingScope
                  ? format(t.twitchSubMissingScope, { scope: s.scope ?? '' })
                  : (s.error ?? t.twitchSubMissing)}
            </span>
          </li>
        ))}
      </ul>

      {!healthy && (
        <button
          type="button"
          onClick={() => void subscribe()}
          disabled={busy}
          className="mt-3 rounded-lg bg-purple-600 px-4 py-2 text-sm font-bold text-white hover:bg-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? t.twitchSubscribing : t.twitchSubscribe}
        </button>
      )}
    </section>
  );
}
