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
// VIT DANS DIFFUSION › OVERLAYS, ONGLET « RÉCOMPENSES », au-dessus des points
// de chaîne : le drop est une récompense de points de chaîne, et ses
// récompenses se modifient dans le panneau juste en dessous.
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
import TcgFeaturedRewardsBlock from '@/features/admin/diffusion/ui/TcgFeaturedRewardsBlock';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { logger } from '../../../utils/logger';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { rubanEyebrow } from '@/features/admin/_shared/ui/ruban';

/** Le seul état où les drops tombent réellement. */
const HEALTHY = 'enabled';

export type UnsubscribedReward = {
  rewardId: string;
  /** Titre de la carte garantie ; `null` pour le drop ordinaire. */
  title: string | null;
  /** Carte garantie, pour ré-abonner une mise en avant ; absent = drop. */
  fanartId?: string;
};

/**
 * Récompenses DÉSIGNÉES (drop ordinaire et mises en avant) qu'aucun abonnement
 * actif ne vise. PURE.
 *
 * POURQUOI. Twitch filtre chaque abonnement sur UNE récompense : une
 * récompense désignée sans le sien n'envoie rien au site, et ses échanges
 * coûtent des points pour rien, sans remboursement ni message. La carte se
 * disait pourtant « saine » dès qu'UN abonnement était actif — c'est le cas
 * d'une désignation refaite en base sans passer par Twitch (Octobre Rose, le
 * 2026-10-14). Constaté le 2026-10-18 : plus aucun drop crédité depuis le 7.
 *
 * Muette si aucun abonnement actif ne porte son `rewardId` (API plus ancienne,
 * ou aucun abonnement — déjà signalé par `dropNoSubscription`) : sans la
 * donnée, elle crierait à tort sur chaque récompense.
 */
export function unsubscribedRewards(
  state: EventSubState
): UnsubscribedReward[] {
  const active = (state.subscriptions ?? []).filter(
    (s) => s.status === HEALTHY
  );
  const covered = new Set(
    active.map((s) => s.rewardId).filter((id): id is string => !!id)
  );
  if (covered.size === 0) return [];

  const designated: UnsubscribedReward[] = [];
  if (state.rewardId)
    designated.push({ rewardId: state.rewardId, title: null });
  if (state.featured) {
    for (const f of state.featured) {
      designated.push({
        rewardId: f.rewardId,
        title: f.title,
        fanartId: f.fanartId,
      });
    }
  } else if (state.featuredRewardId) {
    designated.push({
      rewardId: state.featuredRewardId,
      title: null,
      fanartId: state.featuredFanartId ?? undefined,
    });
  }
  return designated.filter((d) => !covered.has(d.rewardId));
}

export type RepairStep =
  /** Aucune récompense désignée : la créer (ou la reprendre), puis l'abonner. */
  | { kind: 'setupThenSubscribe' }
  /** Ré-abonner une récompense DÉJÀ désignée, telle quelle (409 = déjà là). */
  | { kind: 'subscribe'; rewardId: string; featuredFanartId?: string };

/**
 * Ce que fait « Mettre le drop en service », dans l'ordre. PURE.
 *
 * UNE RÉCOMPENSE DÉJÀ DÉSIGNÉE SE RÉ-ABONNE, ELLE NE SE RECHERCHE PAS. La mise
 * en service retrouve la sienne par son TITRE exact (« Carte à collectionner »).
 * Renommée dans Twitch — « Carte à collectionner simple », 8 000 points, la
 * Cup 2026 —, elle n'était plus reconnue : le bouton en créait une SECONDE à
 * 1 000 points et la désignait à sa place, pendant que celle que le public
 * échangeait restait sourde. Le titre ne sert donc qu'en l'absence de
 * désignation.
 */
export function repairSteps(state: EventSubState | null): RepairStep[] {
  const steps: RepairStep[] = state?.rewardId
    ? [{ kind: 'subscribe', rewardId: state.rewardId }]
    : [{ kind: 'setupThenSubscribe' }];
  for (const missing of state ? unsubscribedRewards(state) : []) {
    if (!missing.fanartId) continue;
    steps.push({
      kind: 'subscribe',
      rewardId: missing.rewardId,
      featuredFanartId: missing.fanartId,
    });
  }
  return steps;
}

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
  // La raison d'un échec de mise en service, telle que l'API la rend. Avalée,
  // elle laissait la carte « À réparer » après le clic sans dire pourquoi.
  const [setupError, setSetupError] = useState<string | null>(null);

  /**
   * Met le drop en service : la récompense, puis l'abonnement (cf.
   * `repairSteps`).
   *
   * CHAQUE ÉTAPE SE REJOUE SANS DANGER. `setup` reprend la récompense existante
   * plutôt que d'en créer une seconde, une récompense déjà désignée est
   * ré-abonnée telle quelle, et l'abonnement vérifie l'existence avant de
   * créer : relancer après un échec partiel est sans danger — c'est ce qui
   * permet d'offrir un simple bouton « réessayer » plutôt qu'une procédure.
   */
  const setup = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setSetupError(null);
    try {
      for (const step of repairSteps(state)) {
        if (step.kind === 'setupThenSubscribe') {
          const { rewardId } = await broadcastCardsClient.tcgDropSetupReward();
          await broadcastCardsClient.tcgDropSubscribe({ rewardId });
        } else {
          await broadcastCardsClient.tcgDropSubscribe(
            step.featuredFanartId
              ? {
                  rewardId: step.rewardId,
                  featuredFanartId: step.featuredFanartId,
                }
              : { rewardId: step.rewardId }
          );
        }
      }
      await load();
    } catch (err) {
      logger.error('[admin/tcg-drop-health] setup error:', err);
      setSetupError((err as Error)?.message || '—');
      // L'état est rechargé quoi qu'il arrive : la carte dira elle-même ce qui
      // reste bloquant, ce qui vaut mieux qu'un message d'erreur générique.
      await load();
    } finally {
      setBusy(false);
    }
  }, [busy, load, state]);

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
  // `false` seulement : une API plus ancienne ne rend pas le champ.
  const cannotCreateReward =
    !state.rewardId && state.canManageRewards === false;
  if (cannotCreateReward) blocking.push(t.dropManageScopeMissing);
  if (!state.rewardId) blocking.push(t.dropRewardMissing);
  if (!unknown && active.length === 0) blocking.push(t.dropNoSubscription);
  for (const missing of unsubscribedRewards(state)) {
    blocking.push(
      format(t.dropRewardUnsubscribed, {
        name: missing.title ?? t.dropRewardOrdinaryName,
      })
    );
  }

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
      {!healthy &&
        !unknown &&
        state.secretConfigured &&
        state.hasScope &&
        !cannotCreateReward && (
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

      {setupError && (
        <p role="alert" className="mt-2 text-xs text-[#ffc2c2]">
          {format(t.dropSetupFailed, { message: setupError })}
        </p>
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

      {/* Les récompenses à carte garantie — plusieurs à la fois (lot 1 de
          PLAN-tcg-2). Le bloc porte sa saisie et ses appels ; il n'est caché
          que face à une API trop ancienne pour rendre les candidates. */}
      {state.featuredCandidates && (
        <TcgFeaturedRewardsBlock state={state} reload={load} />
      )}
    </section>
  );
}
