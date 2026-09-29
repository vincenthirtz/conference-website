// features/player/tcg/ui/TcgCollectionScreen.tsx — « Ma collection » :
// paquets, solde, collection (lot P14, archétype COLLECTION). Extrait de
// pages/player/tcg.tsx ; état et gestes dans `../hooks`, panneaux dans `./`.
//
// Grille de vignettes (sans lien : elles sont des boutons) et fiche plein
// écran par carte, où vivent le lien vers le sujet et le recyclage d'un
// doublon. La pagination reste celle de l'API (curseur) : la fenêtre de
// l'archétype est donc désactivée, « Afficher plus » demande la page suivante.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import TcgCollectionProgress from '@/components/tcg/TcgCollectionProgress';
import TcgSetsPanel from '@/components/tcg/TcgSetsPanel';
import TwitchLinkCard, {
  type TwitchLinkStatus,
} from '@/components/player/TwitchLinkCard';
import { Button } from '@/features/ruban';
import CollectionView from '../../_shared/ui/CollectionView';
import { useTcgHome } from '../hooks/useTcgHome';
import { useTcgGestures } from '../hooks/useTcgGestures';
import { useTcgWallet } from '../hooks/useTcgWallet';
import { useTradesReceived } from '../hooks/useTradesReceived';
import { cardLabel, cardName, subjectKey, type CollectionCard } from '../model';
import { useTcgCardLabels } from './useTcgCardLabels';
import TcgHeaderLinks from './TcgHeaderLinks';
import TcgLoadError from './TcgLoadError';
import PacksPanel from './PacksPanel';
import WalletHistoryPanel from './WalletHistoryPanel';
import PredictionsTeaser from './PredictionsTeaser';
import RecycleConfirmBody from './RecycleConfirmBody';
import { CollectionEmpty, CollectionSkeleton } from './CollectionStates';
import CollectionCardDetail, {
  CollectionCardTile,
} from './CollectionCardDetail';
import RevealSection from './RevealSection';
import {
  FanartSubmitPanel,
  TcgCosmeticsPanel,
  TcgForgePanel,
  TcgPhotoInvite,
  TcgShowcaseEditor,
  loadPackReveal,
} from './lazyPanels';

/** Ancre de la carte Twitch, visée par le lien du barème. */
const TWITCH_ANCHOR = 'tcg-twitch';
/** La fenêtre de l'archétype est désactivée : l'API pagine déjà. */
const NO_WINDOW = Number.MAX_SAFE_INTEGER;

export default function TcgCollectionScreen() {
  const t = useT(nsPlayerTcg);
  const labels = useTcgCardLabels();
  const home = useTcgHome();
  const gestures = useTcgGestures(home, labels.rarity);
  const wallet = useTcgWallet();
  const tradesReceived = useTradesReceived();
  // Recycler MARQUE une carte définitivement : confirmation obligatoire.
  const { confirm, dialog } = useConfirmDialog();
  const [twitchStatus, setTwitchStatus] = useState<TwitchLinkStatus | null>(
    null
  );
  const packsHeadingRef = useRef<HTMLHeadingElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const {
    loadState,
    cards,
    totals,
    pool,
    balance,
    busy,
    earn,
    recycleRefund,
    unopenedCount,
  } = home;
  const isLoading = loadState === 'loading';
  const ready = loadState === 'ready';

  // PRÉCHARGEMENT de la révélation dès qu'un paquet attend : le moment où
  // l'on ouvre est le pire pour montrer un squelette à la place des cartes.
  const hasUnopened = unopenedCount > 0;
  useEffect(() => {
    if (hasUnopened) void loadPackReveal().catch(() => undefined);
  }, [hasUnopened]);

  const goToPacks = useCallback(() => packsHeadingRef.current?.focus(), []);
  const dismissReveal = useCallback(() => {
    gestures.dismissReveal();
    // « Fermer » disparaît avec la révélation : retour aux paquets.
    requestAnimationFrame(() => packsHeadingRef.current?.focus());
  }, [gestures]);

  // LE FOCUS SUIT LA SUITE : « Afficher plus » disparaît à la dernière page ;
  // on pose le focus sur la première carte ajoutée.
  const loadMoreCards = useCallback(async () => {
    const before = await home.loadMoreCards();
    if (before === null) return;
    requestAnimationFrame(() => {
      gridRef.current
        ?.querySelectorAll<HTMLElement>(':scope > ul > li > button')
        .item(before)
        ?.focus();
    });
  }, [home]);

  const recycle = useCallback(
    async (card: CollectionCard) => {
      if (!card.recyclable || recycleRefund === null) return;
      const ok = await confirm({
        title: format(t.recycleConfirmTitleNamed, {
          name: cardName(card) ?? t.revealUnnamed,
        }),
        variant: 'warning',
        confirmLabel: t.recycleConfirmYes,
        cancelLabel: t.recycleConfirmNo,
        body: (
          <RecycleConfirmBody
            card={card}
            refund={recycleRefund}
            balance={balance}
          />
        ),
      });
      if (ok) await gestures.recycleCard(card);
    },
    [balance, confirm, gestures, recycleRefund, t]
  );

  // Ce que la forge peut consommer : les sujets dont l'API a désigné un
  // exemplaire cédable (`recyclable`), projetés pour le panneau.
  const forgeCards = useMemo(
    () =>
      cards
        .filter((card) => card.recyclable)
        .map((card) => ({
          key: subjectKey(card),
          label: cardLabel(card),
          rarity: card.rarity,
          count: card.count,
          recyclable: card.recyclable ?? null,
        })),
    [cards]
  );

  // La carte Twitch prend l'argument « ce qu'on gagne » UNIQUEMENT si le drop
  // est réellement branché : c'est la seule situation où le montant est vrai.
  const twitchPitch =
    typeof earn?.twitchDrop === 'number'
      ? {
          title: t.twitchPitchTitle,
          body: format(t.twitchPitchBody, { drop: earn.twitchDrop }),
        }
      : undefined;
  const showTwitchEarnLink =
    twitchPitch !== undefined &&
    twitchStatus?.configured === true &&
    !twitchStatus.linked;

  const summary =
    ready && cards.length > 0
      ? cards.length < totals.distinct
        ? format(t.collectionShown, {
            shown: cards.length,
            distinct: totals.distinct,
          })
        : format(t.collectionCount, {
            distinct: totals.distinct,
            total: totals.total,
          })
      : null;

  const lead = (
    <div className="mb-8 flex flex-col gap-8">
      {loadState === 'error' ? (
        <TcgLoadError onRetry={home.retryLoad} />
      ) : (
        <PacksPanel
          headingRef={packsHeadingRef}
          isLoading={isLoading}
          unopenedCount={unopenedCount}
          balance={balance}
          earn={earn}
          boosterPrice={home.boosterPrice}
          packs={home.packs}
          hasMorePacks={home.packsCursor !== null}
          busy={busy}
          twitchAnchor={showTwitchEarnLink ? TWITCH_ANCHOR : null}
          onBuy={() => void gestures.buyBooster()}
          onOpen={(packId) => void gestures.openPack(packId)}
          onMorePacks={() => void home.loadMorePacks()}
        />
      )}
      {/* Le tirage, là où le regard va après le clic ; il reste jusqu'à ce
          qu'on le ferme. */}
      {gestures.revealed !== null && (
        <RevealSection
          revealed={gestures.revealed}
          recycleRefund={recycleRefund}
          labels={labels}
          onDismiss={dismissReveal}
        />
      )}
      {/* Juste sous le barème : la promesse et le moyen de l'honorer. Se
          masque d'elle-même quand la fonctionnalité est dormante. */}
      <TwitchLinkCard
        id={TWITCH_ANCHOR}
        pitch={twitchPitch}
        onStatus={setTwitchStatus}
      />
      <WalletHistoryPanel
        open={wallet.open}
        state={wallet.state}
        wallet={wallet.wallet}
        onToggle={() => void wallet.toggle()}
      />
      {ready && (
        <TcgCollectionProgress
          owned={{ distinct: totals.distinct, total: totals.total }}
          pool={pool ?? undefined}
          labels={{
            title: t.progressTitle,
            count:
              (pool?.distinct ?? 0) > 1
                ? t.progressCount_other
                : t.progressCount_one,
            percent: t.progressPercent,
            copies:
              totals.total > 1 ? t.progressCopies_other : t.progressCopies_one,
            progressAria: t.progressAria,
            byRarityTitle: t.progressByRarity,
            rarityCount: t.progressRarityCount,
            complete: t.progressComplete,
            rarity: labels.rarity,
          }}
        />
      )}
      {/* `reloadToken` = le nombre d'exemplaires, qui bouge à chaque
          ouverture et chaque recyclage. */}
      {ready && (
        <TcgSetsPanel
          reloadToken={totals.total}
          celebrate={gestures.setsCompleted}
        />
      )}
      {ready && <PredictionsTeaser />}
      {ready && <FanartSubmitPanel />}
    </div>
  );

  const trail = (
    <div className="mt-8 flex flex-col gap-8">
      {home.collectionCursor && (
        <div className="flex justify-center">
          <Button
            variant="secondary"
            onClick={() => void loadMoreCards()}
            disabled={busy !== null}
            aria-busy={busy === 'more-cards'}
          >
            {busy === 'more-cards'
              ? t.collectionLoadingMore
              : t.collectionLoadMore}
          </Button>
        </div>
      )}
      {ready && <TcgShowcaseEditor reloadToken={totals.total} />}
      <TcgPhotoInvite />
      {/* Les deux débits, après la collection : on ne propose de dépenser
          qu'à qui a déjà vu ce qu'il possède. */}
      <TcgForgePanel
        cards={forgeCards}
        balance={balance}
        onForged={() => void home.load()}
      />
      <TcgCosmeticsPanel onChanged={() => void home.load()} />
      <p className="text-xs text-[var(--t3,#a39ba6)]">
        <Link href="/player/profile" className="hover:text-[var(--t1,#f4edf7)]">
          {t.title}
        </Link>
      </p>
    </div>
  );

  return (
    <main className="pt-header pb-16" aria-busy={isLoading}>
      {/* Région d'annonce, montée VIDE en permanence. */}
      <p role="status" aria-live="polite" className="sr-only">
        {isLoading ? t.loadingCollection : gestures.announcement}
      </p>
      <CollectionView<CollectionCard>
        title={t.collectionTitle}
        subtitle={<TcgHeaderLinks tradesReceived={tradesReceived} />}
        items={ready ? cards : []}
        getKey={subjectKey}
        tileLabel={(card) =>
          format(t.collectionTileAria, {
            name: cardName(card) ?? t.revealUnnamed,
            rarity: labels.rarity[card.rarity],
          })
        }
        renderTile={(card) => (
          <CollectionCardTile card={card} labels={labels} />
        )}
        renderDetail={(card) => (
          <CollectionCardDetail
            card={card}
            labels={labels}
            recycleRefund={recycleRefund}
            busy={busy}
            onRecycle={(c) => void recycle(c)}
          />
        )}
        summary={summary}
        empty={
          isLoading ? (
            <CollectionSkeleton />
          ) : loadState === 'error' ? null : (
            <CollectionEmpty
              unopenedCount={unopenedCount}
              onGoToPacks={goToPacks}
            />
          )
        }
        labels={{ close: t.collectionDetailClose, more: t.collectionLoadMore }}
        pageSize={NO_WINDOW}
        gridRef={gridRef}
        lead={lead}
        trail={trail}
      />
      {/* Sans ce rendu, `await confirm(...)` ne se résoudrait jamais. */}
      {dialog}
    </main>
  );
}
