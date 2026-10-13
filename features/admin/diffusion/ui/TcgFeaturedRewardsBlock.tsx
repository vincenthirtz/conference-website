// features/admin/diffusion/ui/TcgFeaturedRewardsBlock.tsx — les récompenses
// Twitch « mises en avant » : chacune garantit UNE carte de « L'association »
// dans le paquet du drop. Plusieurs à la fois depuis le 2026-10-13 (lot 1 de
// docs/PLAN-tcg-2.md) : Octobre Rose ET Halloween, à côté du drop ordinaire.
//
// POURQUOI UNE LISTE ET PAS UN RÉGLAGE. La première version tenait sur deux
// colonnes : mettre Halloween en service REMPLAÇAIT Octobre Rose dans la
// désignation, pendant que la récompense Octobre Rose restait sur la chaîne —
// un échange tombait alors en « autre récompense », points dépensés, rien reçu.
// Ici, désigner AJOUTE une ligne ; retirer n'enlève que la sienne.
//
// CE QUE « RETIRER » FAIT, DANS CET ORDRE : l'abonnement EventSub de cette
// récompense, puis la récompense désactivée sur Twitch (pas supprimée : elle se
// réactive depuis l'onglet Récompenses), puis la désignation. L'API tient
// l'ordre ; l'écran dit seulement le résultat.
//
// Sorti de TcgDropHealthCard (components/admin) : le bloc porte son propre
// état de saisie, et le cliquet `ui.useState` interdit d'en ajouter là-bas.

import { useState } from 'react';

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminBroadcastLive from '@/lib/i18n/locales/admin-fr/adminBroadcastLive';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { rubanEyebrow, rubanInput } from '@/features/admin/_shared/ui/ruban';
import { logger } from '@/utils/logger';
import {
  broadcastCardsClient,
  type TcgDropEventSubState,
  type TcgFeaturedReward,
} from '../liveClient';

/** Coût proposé par défaut : dix fois le drop ordinaire (1 000). */
const DEFAULT_FEATURED_COST = 10_000;

/**
 * La liste telle que l'API la rend, ou, face à une API plus ancienne qui ne
 * connaît qu'une récompense, reconstituée depuis les deux champs hérités.
 */
export function featuredRewardsOf(
  state: Pick<
    TcgDropEventSubState,
    'featured' | 'featuredRewardId' | 'featuredFanartId' | 'featuredCandidates'
  >
): TcgFeaturedReward[] {
  if (state.featured) return state.featured;
  if (!state.featuredRewardId || !state.featuredFanartId) return [];
  const card = (state.featuredCandidates ?? []).find(
    (c) => c.id === state.featuredFanartId
  );
  return [
    {
      rewardId: state.featuredRewardId,
      fanartId: state.featuredFanartId,
      title: card?.title ?? '—',
      cost: null,
      published: Boolean(card),
    },
  ];
}

export default function TcgFeaturedRewardsBlock({
  state,
  reload,
}: {
  state: TcgDropEventSubState;
  /** Relit l'état du drop après une désignation ou un retrait. */
  reload: () => Promise<unknown>;
}) {
  const t = useAdminT(nsAdminBroadcastLive);
  const [card, setCard] = useState('');
  const [cost, setCost] = useState(DEFAULT_FEATURED_COST);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const featured = featuredRewardsOf(state);
  const bound = new Set(featured.map((f) => f.fanartId));
  // Une carte n'a qu'une récompense : celles déjà désignées sortent du choix.
  const candidates = (state.featuredCandidates ?? []).filter(
    (c) => !bound.has(c.id)
  );
  const selected =
    card && candidates.some((c) => c.id === card)
      ? card
      : (candidates[0]?.id ?? '');

  /** Même enchaînement que le drop : la récompense, puis l'abonnement. */
  const add = async () => {
    if (busy || !selected) return;
    setBusy('add');
    setError(null);
    try {
      const { rewardId } = await broadcastCardsClient.tcgDropSetupReward({
        cost,
        featuredFanartId: selected,
      });
      await broadcastCardsClient.tcgDropSubscribe({
        rewardId,
        featuredFanartId: selected,
        cost,
      });
      setCard('');
    } catch (err) {
      logger.error('[admin/tcg-drop-featured] add error:', err);
      setError(t.dropFeaturedError);
    } finally {
      await reload();
      setBusy(null);
    }
  };

  const remove = async (reward: TcgFeaturedReward) => {
    if (busy) return;
    setBusy(reward.rewardId);
    setError(null);
    try {
      const result = await broadcastCardsClient.tcgDropFeaturedRemove(
        reward.rewardId
      );
      // Retirée chez nous, mais Twitch n'a pas désactivé la récompense : les
      // spectatrices peuvent encore l'échanger pour rien — à dire, pas à taire.
      if (!result.rewardDisabled) {
        setError(
          format(t.dropFeaturedRemovedStillEnabled, { title: reward.title })
        );
      }
    } catch (err) {
      logger.error('[admin/tcg-drop-featured] remove error:', err);
      setError(format(t.dropFeaturedRemoveError, { title: reward.title }));
    } finally {
      await reload();
      setBusy(null);
    }
  };

  const input = `mt-1 ${rubanInput}`;
  const noCardAtAll = (state.featuredCandidates ?? []).length === 0;

  return (
    <div
      className="mt-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3"
      data-testid="tcg-featured-rewards"
    >
      <h3 className={rubanEyebrow}>{t.dropFeaturedHeading}</h3>
      <p className="mt-1 text-[11px] text-neutral-400">{t.dropFeaturedIntro}</p>

      {featured.length > 0 ? (
        <ul className="mt-2 space-y-1.5" aria-label={t.dropFeaturedListLabel}>
          {featured.map((f) => (
            <li
              key={f.rewardId}
              className="flex flex-wrap items-center gap-2 text-xs text-[var(--t1,#f3eef5)]"
            >
              <span className="font-medium">{f.title}</span>
              {f.cost !== null && (
                <span className="text-neutral-400">
                  {format(t.dropFeaturedCostValue, { cost: f.cost })}
                </span>
              )}
              <Chip tone={f.published ? 'ok' : 'warn'}>
                {f.published ? t.dropFeaturedLive : t.dropFeaturedUnpublished}
              </Chip>
              <AdminButton
                variant="ghost"
                size="sm"
                disabled={busy !== null}
                onClick={() => void remove(f)}
                aria-label={format(t.dropFeaturedRemoveAria, {
                  title: f.title,
                })}
              >
                {busy === f.rewardId
                  ? t.dropFeaturedRemoving
                  : t.dropFeaturedRemove}
              </AdminButton>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-neutral-400">{t.dropFeaturedEmpty}</p>
      )}

      {noCardAtAll ? (
        <p className="mt-2 text-xs text-neutral-400">{t.dropFeaturedNone}</p>
      ) : candidates.length === 0 ? (
        <p className="mt-2 text-xs text-neutral-400">
          {t.dropFeaturedAllBound}
        </p>
      ) : (
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <label className="block text-[11px] text-neutral-400">
            {t.dropFeaturedCard}
            <select
              value={selected}
              onChange={(e) => setCard(e.target.value)}
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
              onChange={(e) => setCost(Number(e.target.value) || 1)}
              className={input}
            />
          </label>
          <AdminButton
            variant="secondary"
            size="sm"
            disabled={busy !== null || !selected}
            onClick={() => void add()}
          >
            {busy === 'add' ? t.dropSetupBusy : t.dropFeaturedAdd}
          </AdminButton>
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 text-xs text-[#ffc2c2]">
          {error}
        </p>
      )}
    </div>
  );
}
