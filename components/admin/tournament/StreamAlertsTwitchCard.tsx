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
import { tournamentsUrls } from '@/features/admin/tournaments/client';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminStreamAlerts from '@/lib/i18n/locales/admin-fr/adminStreamAlerts';
import { logger } from '@/utils/logger';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { rubanErrBox, rubanMuted } from '@/features/admin/_shared/ui/ruban';

const ENDPOINT = tournamentsUrls.twitchEventsubAlerts;

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
      <section className={rubanErrBox}>
        <h4 className="text-sm font-semibold text-white">{t.twitchHeading}</h4>
        <p className="mt-1 text-xs">{state.message}</p>
      </section>
    );
  }

  const subs = state.subscriptions;
  const active = subs.filter((s) => s.subscribed).length;
  const healthy = active === subs.length && subs.length > 0;

  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-white">{t.twitchHeading}</h4>
        <Chip tone={healthy ? 'ok' : 'err'}>
          {format(t.twitchCount, { active, total: subs.length })}
        </Chip>
      </div>
      <p className={`mt-1 text-xs ${rubanMuted}`}>{t.twitchHelp}</p>

      {state.secretConfigured === false && (
        <p className="mt-2 text-xs text-[var(--err,#ff6b6b)]">
          {t.twitchSecretMissing}
        </p>
      )}
      {state.readable === false && (
        <p className={`mt-2 text-xs ${rubanMuted}`}>{t.twitchUnreadable}</p>
      )}

      <ul className="mt-3 space-y-1">
        {subs.map((s) => (
          <li key={s.type} className="flex flex-wrap gap-x-2 text-xs">
            <span className="font-mono text-[var(--t2,#c7bfca)]">{s.type}</span>
            <span
              className={
                s.subscribed
                  ? 'text-[var(--lf-200,#b3e7a3)]'
                  : 'text-[var(--err,#ff6b6b)]'
              }
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
        <AdminButton
          variant="secondary"
          size="sm"
          className="mt-3"
          onClick={() => void subscribe()}
          disabled={busy}
        >
          {busy ? t.twitchSubscribing : t.twitchSubscribe}
        </AdminButton>
      )}
    </section>
  );
}
