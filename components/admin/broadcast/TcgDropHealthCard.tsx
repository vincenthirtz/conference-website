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

import {
  useReloadTcgDropState,
  useTcgDropState,
} from '@/features/admin/diffusion/hooks/useBroadcastCards';
import {
  broadcastCardsClient,
  type TcgDropEventSubState as EventSubState,
} from '@/features/admin/diffusion/liveClient';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../../utils/logger';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { rubanEyebrow, rubanInput } from '@/features/admin/_shared/ui/ruban';

/** Le seul état où les drops tombent réellement. */
const HEALTHY = 'enabled';

export default function TcgDropHealthCard() {
  const t = useAdminT(nsAdminBroadcastLive);
  // Absente tant qu'elle n'est pas lue, et si elle est illisible (droits
  // insuffisants, panne) → la carte se retire. Un 403 est le cas NORMAL pour
  // une casteuse : on n'en fait pas une erreur visible, seulement une carte
  // absente.
  const stateQuery = useTcgDropState();
  const state: EventSubState | null = stateQuery.isError
    ? null
    : (stateQuery.data ?? null);
  const load = useReloadTcgDropState();
  useEffect(() => {
    if (stateQuery.error) {
      logger.error('[admin/tcg-drop-health] load error:', stateQuery.error);
    }
  }, [stateQuery.error]);
  const [busy, setBusy] = useState(false);
  const [featuredCard, setFeaturedCard] = useState('');
  const [featuredCost, setFeaturedCost] = useState(10_000);
  const [featuredError, setFeaturedError] = useState(false);

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
      const { rewardId } = await broadcastCardsClient.tcgDropSetupReward();
      await broadcastCardsClient.tcgDropSubscribe({ rewardId });
      await load();
    } catch (err) {
      logger.error('[admin/tcg-drop-health] setup error:', err);
      // L'état est rechargé quoi qu'il arrive : la carte dira elle-même ce qui
      // reste bloquant, ce qui vaut mieux qu'un message d'erreur générique.
      await load();
    } finally {
      setBusy(false);
    }
  }, [busy, load]);

  /**
   * La récompense MISE EN AVANT : même enchaînement que le drop (récompense,
   * puis abonnement), avec la carte que son paquet garantit.
   */
  const setupFeatured = async (fanartId: string) => {
    if (busy || !fanartId) return;
    setBusy(true);
    setFeaturedError(false);
    try {
      const { rewardId } = await broadcastCardsClient.tcgDropSetupReward({
        cost: featuredCost,
        featuredFanartId: fanartId,
      });
      await broadcastCardsClient.tcgDropSubscribe({
        rewardId,
        featuredFanartId: fanartId,
      });
    } catch (err) {
      logger.error('[admin/tcg-drop-health] featured setup error:', err);
      setFeaturedError(true);
    } finally {
      await load();
      setBusy(false);
    }
  };

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
    <section
      className={`mb-4 rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] px-5 py-4 ${
        !unknown && !healthy
          ? 'border-[rgba(255,107,107,.45)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={rubanEyebrow}>{t.dropHeading}</h2>
        <Chip tone={unknown ? 'neutral' : healthy ? 'ok' : 'err'}>
          {unknown
            ? t.dropStatusUnknown
            : healthy
              ? t.dropStatusHealthy
              : t.dropStatusBroken}
        </Chip>
      </div>

      <p className="mt-1 text-[11px] text-[var(--t3,#a39ba6)]">
        {t.dropSubtitle}
      </p>

      {unknown && (
        <p className="mt-2 text-xs text-neutral-400">{t.dropUnreadable}</p>
      )}

      {blocking.length > 0 && (
        <ul className="mt-3 space-y-1">
          {blocking.map((reason) => (
            <li key={reason} className="text-xs text-[#ffc2c2]">
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
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => void setup()}
          disabled={busy}
          className="mt-3"
        >
          {busy ? t.dropSetupBusy : t.dropSetupCta}
        </AdminButton>
      )}

      {/* Le statut BRUT de chaque souscription en peine : les causes appellent
          des gestes opposés, un voyant unique enverrait chercher au mauvais
          endroit. */}
      {ailing.length > 0 && (
        <ul className="mt-3 space-y-1">
          {ailing.map((s) => (
            <li
              key={s.id ?? s.status ?? 'sub'}
              className="text-xs text-[#ffc2c2]"
            >
              {format(t.dropSubscriptionAiling, {
                status: s.status ?? t.dropStatusUnknown,
              })}
            </li>
          ))}
        </ul>
      )}

      {healthy && (
        <p className="mt-3 text-xs text-[var(--lf-200,#b3e7a3)]">
          {format(t.dropHealthyDetail, { count: active.length })}
        </p>
      )}

      {state.featuredCandidates && (
        <FeaturedRewardBlock
          t={t}
          state={state}
          busy={busy}
          card={featuredCard}
          cost={featuredCost}
          error={featuredError}
          onCard={setFeaturedCard}
          onCost={setFeaturedCost}
          onSetup={(id) => void setupFeatured(id)}
        />
      )}
    </section>
  );
}

/** L'encart de la récompense mise en avant, sous l'état du drop. */
function FeaturedRewardBlock({
  t,
  state,
  busy,
  card,
  cost,
  error,
  onCard,
  onCost,
  onSetup,
}: {
  t: typeof nsAdminBroadcastLive.fr;
  state: EventSubState;
  busy: boolean;
  card: string;
  cost: number;
  error: boolean;
  onCard: (id: string) => void;
  onCost: (cost: number) => void;
  onSetup: (id: string) => void;
}) {
  const candidates = state.featuredCandidates ?? [];
  const current = candidates.find((c) => c.id === state.featuredFanartId);
  const live = Boolean(state.featuredRewardId && current);
  const selected = card || current?.id || candidates[0]?.id || '';
  const input = `mt-1 ${rubanInput}`;

  return (
    <div className="mt-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3">
      <h3 className={rubanEyebrow}>{t.dropFeaturedHeading}</h3>
      <p className="mt-1 text-[11px] text-neutral-400">{t.dropFeaturedIntro}</p>
      {live && current && (
        <p className="mt-2 text-xs text-[var(--lf-200,#b3e7a3)]">
          {format(t.dropFeaturedActive, { title: current.title })}
        </p>
      )}
      {candidates.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-400">{t.dropFeaturedNone}</p>
      ) : (
        <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <label className="block text-[11px] text-neutral-400">
            {t.dropFeaturedCard}
            <select
              value={selected}
              onChange={(e) => onCard(e.target.value)}
              className={input}
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-[11px] text-neutral-400">
            {t.dropFeaturedCost}
            <input
              type="number"
              min={1}
              step={100}
              value={cost}
              onChange={(e) => onCost(Number(e.target.value) || 1)}
              className={input}
            />
          </label>
          <AdminButton
            variant="secondary"
            size="sm"
            disabled={busy || !selected}
            onClick={() => onSetup(selected)}
          >
            {busy ? t.dropSetupBusy : t.dropFeaturedCta}
          </AdminButton>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-[#ffc2c2]">
          {t.dropFeaturedError}
        </p>
      )}
    </div>
  );
}
