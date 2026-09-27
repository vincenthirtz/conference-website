// components/admin/broadcast/TcgDropHealthCard.tsx
//
// « La chaîne de drop TCG est-elle vivante ? » — l'état de la souscription
// EventSub, en une carte de la console régie.
//
// POURQUOI CETTE CARTE EXISTE. Twitch DÉSACTIVE une souscription tout seul :
// autorisation retirée par la chaîne, compte supprimé, ou trop d'échecs de
// livraison de notre côté. Il ne prévient que par un message `revocation`
// envoyé une fois au webhook — un `logger.warn` dans une fonction serverless,
// que personne ne lit. Les drops cesseraient donc de tomber en plein direct
// sans qu'aucun écran ne le montre : exactement le mode de panne silencieux que
// ce produit s'emploie à supprimer partout ailleurs.
//
// LA DONNÉE EXISTAIT DÉJÀ. `GET /api/admin/twitch/eventsub/tcg-drop` liste nos
// souscriptions AVEC leur `status`, quel que soit leur état. Rien à construire
// côté serveur : il manquait un écran.
//
// TROIS CAUSES, TROIS GESTES OPPOSÉS — et c'est pourquoi on affiche le statut
// brut plutôt qu'un simple voyant rouge : `authorization_revoked` demande de
// reconnecter la chaîne, `notification_failures_exceeded` de réparer le
// récepteur, `user_removed` ne demande rien. Un « ça ne marche plus » unique
// enverrait chercher au mauvais endroit.
//
// ELLE DIAGNOSTIQUE, ET DEPUIS LE 2026-09-27 ELLE RÉPARE. Toute la chaîne
// était livrée — récompense, abonnement, webhook signé — mais le `POST` qui met
// le drop en service n'avait AUCUNE interface : il fallait créer une récompense
// à la main puis appeler une API sans écran. Mesuré ce jour-là : chaîne
// connectée, dix-huit comptes rattachés, zéro crédit versé. Un écran qui montre
// une panne sans offrir le geste qui la répare n'est qu'à moitié un écran.
//
// SE MASQUE PLUTÔT QUE D'AFFICHER UN 403. La route exige `manage_broadcast`,
// réservée à l'admin, alors que cette console est ouverte au rôle `caster`.
// Une casteuse ne doit pas voir un bloc en erreur permanente : on rend `null`,
// comme `TwitchPredictionsPanel` le fait déjà dans ce même écran.

import { useCallback, useEffect, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../../utils/logger';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';

type Subscription = {
  id: string | null;
  status: string | null;
  rewardId: string | null;
};

type EventSubState = {
  rewardId: string | null;
  callbackUrl: string;
  secretConfigured: boolean;
  hasScope: boolean;
  subscriptions: Subscription[] | null;
};

/** Le seul état où les drops tombent réellement. */
const HEALTHY = 'enabled';

export default function TcgDropHealthCard() {
  const t = useAdminT(nsAdminBroadcastLive);
  const { adminFetchJson } = useAdminFetch();

  // `undefined` = pas encore lu ; `null` = illisible (droits insuffisants,
  // panne) → la carte se retire.
  const [state, setState] = useState<EventSubState | null | undefined>(
    undefined
  );
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(
        await adminFetchJson<EventSubState>(
          '/api/admin/twitch/eventsub/tcg-drop'
        )
      );
    } catch (err) {
      // Un 403 est le cas NORMAL pour une casteuse : on n'en fait pas une
      // erreur visible, seulement une carte absente.
      logger.error('[admin/tcg-drop-health] load error:', err);
      setState(null);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Met le drop en service : la récompense, puis l'abonnement.
   *
   * DEUX APPELS, MAIS UN SEUL EFFET DE BORD REJOUABLE. `setup` reprend la
   * récompense existante plutôt que d'en créer une seconde, et l'abonnement
   * vérifie l'existence avant de créer : relancer après un échec partiel est
   * sans danger — c'est ce qui permet d'offrir un simple bouton « réessayer »
   * plutôt qu'une procédure.
   */
  const setup = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { rewardId } = await adminFetchJson<{ rewardId: string }>(
        '/api/admin/twitch/tcg-drop/setup',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
        }
      );
      await adminFetchJson('/api/admin/twitch/eventsub/tcg-drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rewardId }),
      });
      await load();
    } catch (err) {
      logger.error('[admin/tcg-drop-health] setup error:', err);
      // L'état est rechargé quoi qu'il arrive : la carte dira elle-même ce qui
      // reste bloquant, ce qui vaut mieux qu'un message d'erreur générique.
      await load();
    } finally {
      setBusy(false);
    }
  }, [busy, adminFetchJson, load]);

  if (!state) return null;

  const subs = state.subscriptions;
  // `null` = Helix n'a pas répondu. On le distingue d'une liste vide : « on ne
  // sait pas » n'est pas « il n'y en a aucune ».
  const unknown = subs === null;
  const active = (subs ?? []).filter((s) => s.status === HEALTHY);
  const ailing = (subs ?? []).filter((s) => s.status !== HEALTHY);

  // Ordre de gravité : ce qui empêche les drops en premier.
  const blocking: string[] = [];
  if (!state.secretConfigured) blocking.push(t.dropSecretMissing);
  if (!state.hasScope) blocking.push(t.dropScopeMissing);
  if (!state.rewardId) blocking.push(t.dropRewardMissing);
  if (!unknown && active.length === 0) blocking.push(t.dropNoSubscription);

  const healthy = blocking.length === 0 && !unknown && ailing.length === 0;

  return (
    <section className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold text-white">{t.dropHeading}</h2>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            unknown
              ? 'bg-neutral-700/60 text-neutral-300'
              : healthy
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-red-500/15 text-red-300'
          }`}
        >
          {unknown
            ? t.dropStatusUnknown
            : healthy
              ? t.dropStatusHealthy
              : t.dropStatusBroken}
        </span>
      </div>

      <p className="mt-1 text-[11px] text-neutral-400">{t.dropSubtitle}</p>

      {unknown && (
        <p className="mt-2 text-xs text-neutral-400">{t.dropUnreadable}</p>
      )}

      {blocking.length > 0 && (
        <ul className="mt-3 space-y-1">
          {blocking.map((reason) => (
            <li key={reason} className="text-xs text-red-200">
              {reason}
            </li>
          ))}
        </ul>
      )}

      {/* LE GESTE QUI RÉPARE, à côté de la panne qu'il répare. Il n'est offert
          que pour ce qu'il sait faire : ni le secret HMAC (variable
          d'environnement) ni le scope (reconnexion de la chaîne) ne se
          rattrapent d'ici, et proposer un bouton qui ne peut pas aboutir
          enverrait chercher au mauvais endroit — le reproche exact que
          l'en-tête de cette carte adresse au voyant rouge unique. */}
      {!healthy && !unknown && state.secretConfigured && state.hasScope && (
        <button
          type="button"
          onClick={() => void setup()}
          disabled={busy}
          className="mt-3 inline-flex min-h-9 items-center rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {busy ? t.dropSetupBusy : t.dropSetupCta}
        </button>
      )}

      {/* Le statut BRUT de chaque souscription en peine : les causes appellent
          des gestes opposés, un voyant unique enverrait chercher au mauvais
          endroit. */}
      {ailing.length > 0 && (
        <ul className="mt-3 space-y-1">
          {ailing.map((s) => (
            <li
              key={s.id ?? s.status ?? 'sub'}
              className="text-xs text-red-200"
            >
              {format(t.dropSubscriptionAiling, {
                status: s.status ?? t.dropStatusUnknown,
              })}
            </li>
          ))}
        </ul>
      )}

      {healthy && (
        <p className="mt-3 text-xs text-emerald-200">
          {format(t.dropHealthyDetail, { count: active.length })}
        </p>
      )}
    </section>
  );
}
