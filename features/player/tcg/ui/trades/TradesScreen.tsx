// features/player/tcg/ui/trades/TradesScreen.tsx — « Échanges de cartes »
// (lot P14, archétype LISTE ; extrait de pages/player/tcg/echanges.tsx).
//
// L'ACTIVATION VIENT APRÈS L'EXPLICATION (préférence en tête). ON NE VOIT PAS
// LA COLLECTION D'UNE AUTRE : seulement ses doubles échangeables. LES FACES
// SONT RELUES À CHAQUE CHARGEMENT. AUCUN MONTANT, AUCUN PAQUET, AUCUN MESSAGE.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
import { Button } from '@/features/ruban';
import ListeView from '../../../_shared/ui/ListeView';
import { useAnnouncer } from '../../hooks/useAnnouncer';
import { useTradeSettings } from '../../hooks/useTradeSettings';
import { useTradeInbox } from '../../hooks/useTradeInbox';
import { useTradeComposer } from '../../hooks/useTradeComposer';
import { useTradeActions } from '../../hooks/useTradeActions';
import { useTcgCardLabels } from '../useTcgCardLabels';
import TradePrefPanel from './TradePrefPanel';
import TradeComposerPanel from './TradeComposerPanel';
import TradeBoxTabs from './TradeBoxTabs';
import TradeItem from './TradeItem';

export default function TradesScreen() {
  const t = useT(nsTcgTrade);
  const locale = useLocale();
  const labels = useTcgCardLabels();
  const { confirm, dialog } = useConfirmDialog();
  // La coquille redirige déjà ; `ready` retient les lectures jusqu'à la
  // session résolue (sans quoi elles partiraient sans jeton).
  const { ready } = usePlayerSession({
    redirectTo: '/login?next=/player/tcg/echanges',
  });
  const { announcement, announce } = useAnnouncer();
  const [busy, setBusy] = useState<string | null>(null);

  const formatDate = useCallback(
    (iso: string | null) =>
      iso
        ? new Date(iso).toLocaleString(locale, {
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Paris',
          })
        : '',
    [locale]
  );

  const settings = useTradeSettings({ announce, setBusy });
  const inbox = useTradeInbox();
  const maxCards = settings.settings?.limits.maxCardsPerSide ?? 5;
  const { setBox, setListState } = inbox;
  const composer = useTradeComposer({
    maxCards,
    announce,
    setBusy,
    reloadSettings: settings.load,
    // PAS de relecture de la boîte ici : passer à « envoyées » la recharge
    // déjà (effet sur la boîte) — deux lectures se disputeraient la liste.
    showSent: useCallback(() => {
      setBox('sent');
      setListState('open');
    }, [setBox, setListState]),
  });
  const { load: loadTrades } = inbox;
  const { load: loadSettings } = settings;
  const actions = useTradeActions({
    confirm,
    limits: settings.settings?.limits,
    busy,
    setBusy,
    announce,
    reload: useCallback(
      () => Promise.all([loadTrades(false, null), loadSettings()]),
      [loadTrades, loadSettings]
    ),
  });

  useEffect(() => {
    if (ready) void loadSettings();
  }, [ready, loadSettings]);
  useEffect(() => {
    if (ready) void loadTrades(false, null);
  }, [ready, loadTrades]);

  // Le composeur ne se charge qu'échanges ACTIVÉS, une fois par activation.
  const tradingOn = settings.settings?.acceptsProposals === true;
  const composerLoadedRef = useRef(false);
  const { load: loadComposer } = composer;
  useEffect(() => {
    if (ready && tradingOn && !composerLoadedRef.current) {
      composerLoadedRef.current = true;
      void loadComposer();
    }
    if (!tradingOn) composerLoadedRef.current = false;
  }, [ready, tradingOn, loadComposer]);

  const loadMore = useCallback(async () => {
    setBusy('more');
    await loadTrades(true, inbox.cursor);
    setBusy(null);
  }, [loadTrades, inbox.cursor]);

  return (
    <main className="pt-header pb-16">
      {/* Région d'annonce, montée vide en permanence. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <ListeView
        title={t.title}
        subtitle={
          <>
            <Link
              href="/player/tcg"
              className="block text-sm text-[var(--or-300,#dea3f6)] underline-offset-4 hover:underline"
            >
              {t.backToCollection}
            </Link>
            <span className="mt-2 block max-w-prose text-sm">{t.intro}</span>
          </>
        }
        labels={{
          filters: t.boxLabel,
          closeFilters: t.confirmBack,
          loadMore: busy === 'more' ? t.loadingMore : t.loadMore,
          loading: t.loading,
        }}
        lead={
          <div className="flex flex-col gap-8">
            <TradePrefPanel
              settings={settings.settings}
              state={settings.state}
              busy={busy}
              formatDate={formatDate}
              onRetry={() => void loadSettings()}
              onToggle={() => void settings.toggle()}
            />
            {tradingOn && (
              <TradeComposerPanel
                composer={composer}
                maxCards={maxCards}
                busy={busy}
                labels={labels}
              />
            )}
            <TradeBoxTabs
              box={inbox.box}
              listState={inbox.listState}
              onBox={setBox}
              onState={setListState}
            />
          </div>
        }
        loading={inbox.state === 'loading'}
        empty={
          inbox.state === 'error' ? (
            <div role="alert" className="text-sm text-[var(--err,#ff6b6b)]">
              {t.listError}{' '}
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void loadTrades(false, null)}
              >
                {t.retry}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-[var(--t3,#a39ba6)]">
              {inbox.listState === 'closed'
                ? t.emptyClosed
                : inbox.box === 'received'
                  ? t.emptyReceived
                  : t.emptySent}
            </p>
          )
        }
        hasMore={inbox.state === 'ready' && inbox.cursor !== null}
        loadingMore={busy !== null}
        onLoadMore={() => void loadMore()}
      >
        {inbox.state === 'ready'
          ? inbox.trades.map((trade) => (
              <TradeItem
                key={trade.id}
                trade={trade}
                busy={busy}
                labels={labels}
                formatDate={formatDate}
                onAct={(tr, action) => void actions.act(tr, action)}
                onBlock={(tr) => void actions.blockProposer(tr)}
              />
            ))
          : null}
      </ListeView>
      {dialog}
    </main>
  );
}
