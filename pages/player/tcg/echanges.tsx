// pages/player/tcg/echanges.tsx
//
// Espace joueuse — « Échanges de cartes ».
//
// `noindex` comme le reste de l'espace : un échange entre deux personnes n'a
// rien à faire dans un moteur de recherche.
//
// L'ACTIVATION VIENT APRÈS L'EXPLICATION. Échanger, c'est devenir visible
// d'autres collectionneuses (son pseudo, ses doubles). La page le dit AVANT
// l'interrupteur — même discipline que la photo de carte, dont le consentement
// n'est éclairé que parce qu'il est expliqué d'abord.
//
// ON NE VOIT PAS LA COLLECTION D'UNE AUTRE. Le composeur ne montre, chez la
// partenaire choisie, que ses DOUBLES ÉCHANGEABLES (ce qu'elle expose en
// activant les échanges). Ses cartes uniques et ses comptes d'exemplaires ne
// sortent jamais du serveur.
//
// LES FACES SONT RELUES À CHAQUE CHARGEMENT, jamais conservées : une photo
// retirée disparaît aussi des propositions et des cartes reçues.
//
// AUCUN MONTANT, AUCUN PAQUET, AUCUN MESSAGE dans une proposition : l'interface
// n'en propose pas, et l'API les refuserait.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import TcgCard, { type TcgCardSubject } from '@/components/tcg/TcgCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { TcgRarity } from '@/utils/tcg/rarity';
// Types SEULEMENT : effacés à la compilation. Importer le module lui-même ferait
// entrer `supabaseAdmin` dans le bundle navigateur.
import type { TradeCardView, TradeView } from '@/utils/tcg/trades';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';
// Les libellés de rareté vivent déjà là : les recopier donnerait deux jeux de
// mots libres de diverger.
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

type Limits = {
  maxCardsPerSide: number;
  ttlHours: number;
  maxPendingSent: number;
  maxPendingReceived: number;
  declineCooldownHours: number;
  maxAcceptedPerDay: number;
  minAccountAgeDays: number;
  minCollectionAgeDays: number;
};

type Settings = {
  acceptsProposals: boolean;
  eligible: boolean | null;
  eligibleAt: string | null;
  eligibilityReason: 'no_account' | 'no_collection' | 'too_recent' | null;
  limits: Limits;
  pending: { sent: number | null; received: number | null };
};

type Partner = { userId: string; displayName: string };

type MyCard = TradeCardView & {
  copies: number;
  tradeableCopies: number;
  available: number;
};

type LoadState = 'loading' | 'ready' | 'error';
type Box = 'received' | 'sent';
type ListState = 'open' | 'closed';

/** Clé d'un sujet : même forme que `utils/tcg/subjectKey.ts`. */
function keyOf(card: TradeCardView): string {
  if (card.kind === 'player') return `player:${card.userId}`;
  if (card.kind === 'team') return `team:${card.teamId}`;
  return `map:${card.slug}`;
}

function subjectRefOf(card: TradeCardView): { kind: string; id: string } {
  if (card.kind === 'player') return { kind: 'player', id: card.userId };
  if (card.kind === 'team') return { kind: 'team', id: card.teamId };
  return { kind: 'map', id: card.slug };
}

function subjectOf(card: TradeCardView): TcgCardSubject {
  if (card.kind === 'player') {
    return {
      kind: 'player',
      userId: card.userId,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
    };
  }
  if (card.kind === 'team') {
    return {
      kind: 'team',
      teamId: card.teamId,
      name: card.name,
      slug: card.slug,
      logoUrl: card.logoUrl,
      cardImageUrl: card.cardImageUrl,
    };
  }
  return {
    kind: 'map',
    slug: card.slug,
    name: card.name,
    imageUrl: card.imageUrl,
  };
}

function nameOf(card: TradeCardView): string | null {
  return card.kind === 'player' ? card.displayName : card.name;
}

const FOCUS_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]';

function PlayerTcgTrades() {
  const t = useT(nsTcgTrade);
  const tc = useT(nsPlayerTcg);
  const locale = useLocale();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { ready } = usePlayerSession({
    redirectTo: '/login?next=/player/tcg/echanges',
  });
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const labels = useMemo(
    () => ({
      rarity: {
        common: tc.rarityCommon,
        rare: tc.rarityRare,
        epic: tc.rarityEpic,
        legendary: tc.rarityLegendary,
      } as Record<TcgRarity, string>,
      foil: tc.foil,
      copies: tc.copies,
    }),
    [tc]
  );

  const errorText = useCallback(
    (code: unknown): string => {
      const key = `err_${typeof code === 'string' ? code : 'generic'}`;
      const dict = t as unknown as Record<string, string>;
      return dict[key] ?? t.err_generic;
    },
    [t]
  );

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

  /* ---------------------------------------------------------------------- */
  /* Annonces lecteur d'écran                                                */
  /* ---------------------------------------------------------------------- */

  const [announcement, setAnnouncement] = useState('');
  const announce = useCallback((text: string) => {
    // Vider d'abord : un texte identique au précédent ne serait pas relu.
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  const [busy, setBusy] = useState<string | null>(null);

  /* ---------------------------------------------------------------------- */
  /* Préférence                                                              */
  /* ---------------------------------------------------------------------- */

  const [settings, setSettings] = useState<Settings | null>(null);
  const [settingsState, setSettingsState] = useState<LoadState>('loading');

  const loadSettings = useCallback(async () => {
    setSettingsState('loading');
    try {
      const data = await adminFetchJson<Settings>(
        '/api/player/tcg/trades/settings'
      );
      setSettings(data);
      setSettingsState('ready');
    } catch {
      setSettingsState('error');
    }
  }, [adminFetchJson]);

  const toggleTrading = useCallback(async () => {
    if (!settings) return;
    const next = !settings.acceptsProposals;
    setBusy('settings');
    try {
      const res = await adminFetch('/api/player/tcg/trades/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acceptsProposals: next }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        code?: string;
        cancelled?: { received: number; sent: number };
      };
      if (!res.ok) {
        addToast(errorText(body.code), 'error');
        return;
      }
      const cancelledCount =
        (body.cancelled?.received ?? 0) + (body.cancelled?.sent ?? 0);
      const message = next
        ? t.prefToastOn
        : cancelledCount > 0
          ? format(t.prefToastOffCancelled, { count: cancelledCount })
          : t.prefToastOff;
      addToast(message, 'success');
      announce(message);
      await loadSettings();
    } catch {
      addToast(t.err_generic, 'error');
    } finally {
      setBusy(null);
    }
  }, [settings, adminFetch, addToast, errorText, t, announce, loadSettings]);

  /* ---------------------------------------------------------------------- */
  /* Boîtes                                                                  */
  /* ---------------------------------------------------------------------- */

  const [box, setBox] = useState<Box>('received');
  const [listState, setListState] = useState<ListState>('open');
  const [trades, setTrades] = useState<TradeView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tradesState, setTradesState] = useState<LoadState>('loading');

  const loadTrades = useCallback(
    async (append: boolean, fromCursor: string | null) => {
      if (!append) setTradesState('loading');
      const params = new URLSearchParams({ box, state: listState });
      if (append && fromCursor) params.set('cursor', fromCursor);
      try {
        const data = await adminFetchJson<{
          trades: TradeView[];
          nextCursor: string | null;
        }>(`/api/player/tcg/trades?${params.toString()}`);
        setTrades((prev) => (append ? [...prev, ...data.trades] : data.trades));
        setCursor(data.nextCursor);
        setTradesState('ready');
      } catch {
        if (!append) setTradesState('error');
        else addToast(t.listError, 'error');
      }
    },
    [adminFetchJson, box, listState, addToast, t]
  );

  /* ---------------------------------------------------------------------- */
  /* Composeur                                                               */
  /* ---------------------------------------------------------------------- */

  const [partners, setPartners] = useState<Partner[] | null>(null);
  const [partnerId, setPartnerId] = useState('');
  const [theirCards, setTheirCards] = useState<TradeCardView[] | null>(null);
  const [myCards, setMyCards] = useState<MyCard[] | null>(null);
  const [offered, setOffered] = useState<string[]>([]);
  const [requested, setRequested] = useState<string[]>([]);

  const loadComposer = useCallback(async () => {
    try {
      const [p, mine] = await Promise.all([
        adminFetchJson<{ partners: Partner[] }>(
          '/api/player/tcg/trades/partners'
        ),
        adminFetchJson<{ cards: MyCard[] }>('/api/player/tcg/trades/cards'),
      ]);
      setPartners(p.partners);
      setMyCards(mine.cards);
    } catch {
      setPartners([]);
      setMyCards([]);
    }
  }, [adminFetchJson]);

  const choosePartner = useCallback(
    async (id: string) => {
      setPartnerId(id);
      setRequested([]);
      setTheirCards(null);
      if (!id) return;
      try {
        const data = await adminFetchJson<{ cards: TradeCardView[] }>(
          `/api/player/tcg/trades/cards?userId=${encodeURIComponent(id)}`
        );
        setTheirCards(data.cards);
      } catch (err) {
        const code = (err as { payload?: { code?: string } })?.payload?.code;
        addToast(errorText(code), 'error');
        setTheirCards([]);
      }
    },
    [adminFetchJson, addToast, errorText]
  );

  const maxCards = settings?.limits.maxCardsPerSide ?? 5;

  const togglePick = useCallback(
    (side: 'offered' | 'requested', key: string) => {
      const setter = side === 'offered' ? setOffered : setRequested;
      setter((prev) =>
        prev.includes(key)
          ? prev.filter((k) => k !== key)
          : prev.length >= maxCards
            ? prev
            : [...prev, key]
      );
    },
    [maxCards]
  );

  const canSubmit =
    partnerId !== '' &&
    offered.length > 0 &&
    offered.length === requested.length &&
    offered.length <= maxCards;

  const submitProposal = useCallback(async () => {
    if (!canSubmit || !myCards || !theirCards) return;
    const byKey = new Map<string, TradeCardView>();
    for (const c of myCards) byKey.set(keyOf(c), c);
    for (const c of theirCards) byKey.set(keyOf(c), c);
    const toRef = (k: string) => {
      const card = byKey.get(k);
      return card ? subjectRefOf(card) : null;
    };
    setBusy('propose');
    try {
      const res = await adminFetch('/api/player/tcg/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipientId: partnerId,
          offered: offered.map(toRef).filter(Boolean),
          requested: requested.map(toRef).filter(Boolean),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string };
      if (!res.ok) {
        addToast(errorText(body.code), 'error');
        announce(errorText(body.code));
        return;
      }
      addToast(t.proposedToast, 'success');
      announce(t.proposedToast);
      setOffered([]);
      setRequested([]);
      setBox('sent');
      setListState('open');
      await Promise.all([loadComposer(), loadSettings()]);
    } catch {
      addToast(t.err_generic, 'error');
    } finally {
      setBusy(null);
    }
  }, [
    canSubmit,
    myCards,
    theirCards,
    adminFetch,
    partnerId,
    offered,
    requested,
    addToast,
    errorText,
    announce,
    t,
    loadComposer,
    loadSettings,
  ]);

  /* ---------------------------------------------------------------------- */
  /* Actions sur une proposition                                             */
  /* ---------------------------------------------------------------------- */

  const act = useCallback(
    async (trade: TradeView, action: 'accept' | 'decline' | 'cancel') => {
      const name = trade.counterpart.displayName ?? t.unknownName;
      const limits = settings?.limits;
      let ok = false;
      if (action === 'accept') {
        const givesLast = trade.requested.some(
          (c) =>
            typeof (c as { ownedCopies?: number }).ownedCopies === 'number' &&
            ((c as { ownedCopies?: number }).ownedCopies ?? 0) <= 1
        );
        ok = await confirm({
          title: t.confirmAcceptTitle,
          subtitle: format(t.confirmAcceptBody, {
            give: trade.requested.length,
            get: trade.offered.length,
          }),
          body: givesLast ? (
            <p className="text-sm text-amber-300">{t.confirmAcceptLastCopy}</p>
          ) : undefined,
          variant: givesLast ? 'warning' : 'info',
          confirmLabel: t.accept,
          cancelLabel: t.confirmBack,
        });
      } else if (action === 'decline') {
        ok = await confirm({
          title: t.confirmDeclineTitle,
          subtitle: format(t.confirmDeclineBody, {
            hours: limits?.declineCooldownHours ?? 24,
          }),
          variant: 'warning',
          confirmLabel: t.decline,
          cancelLabel: t.confirmBack,
        });
      } else {
        ok = await confirm({
          title: t.confirmCancelTitle,
          subtitle: name,
          variant: 'warning',
          confirmLabel: t.cancel,
          cancelLabel: t.confirmBack,
        });
      }
      if (!ok) return;

      setBusy(`${action}:${trade.id}`);
      try {
        const res = await adminFetch(
          `/api/player/tcg/trades/${encodeURIComponent(trade.id)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
          }
        );
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        if (!res.ok) {
          addToast(errorText(body.code), 'error');
          announce(errorText(body.code));
        } else {
          const message =
            action === 'accept'
              ? t.toastAccepted
              : action === 'decline'
                ? t.toastDeclined
                : t.toastCancelled;
          addToast(message, 'success');
          announce(message);
        }
        await Promise.all([loadTrades(false, null), loadSettings()]);
      } catch {
        addToast(t.err_generic, 'error');
      } finally {
        setBusy(null);
      }
    },
    [
      t,
      settings,
      confirm,
      adminFetch,
      addToast,
      errorText,
      announce,
      loadTrades,
      loadSettings,
    ]
  );

  /* ---------------------------------------------------------------------- */
  /* Chargements                                                             */
  /* ---------------------------------------------------------------------- */

  useEffect(() => {
    if (ready) void loadSettings();
  }, [ready, loadSettings]);

  useEffect(() => {
    if (ready) void loadTrades(false, null);
  }, [ready, loadTrades]);

  const tradingOn = settings?.acceptsProposals === true;
  const composerLoadedRef = useRef(false);
  useEffect(() => {
    if (ready && tradingOn && !composerLoadedRef.current) {
      composerLoadedRef.current = true;
      void loadComposer();
    }
    if (!tradingOn) composerLoadedRef.current = false;
  }, [ready, tradingOn, loadComposer]);

  /* ---------------------------------------------------------------------- */
  /* Rendu                                                                   */
  /* ---------------------------------------------------------------------- */

  const statusLabel: Record<TradeView['status'], string> = {
    pending: t.statusPending,
    accepted: t.statusAccepted,
    declined: t.statusDeclined,
    cancelled: t.statusCancelled,
    expired: t.statusExpired,
  };
  const reasonLabel = (reason: TradeView['reason']): string | null => {
    switch (reason) {
      case 'offered_unavailable':
        return t.reasonOfferedUnavailable;
      case 'card_unavailable':
        return t.reasonCardUnavailable;
      case 'trading_disabled':
        return t.reasonTradingDisabled;
      case 'proposer_cancelled':
        return t.reasonProposerCancelled;
      default:
        return null;
    }
  };

  const renderPickGrid = (
    side: 'offered' | 'requested',
    cards: Array<TradeCardView | MyCard>
  ) => {
    const picked = side === 'offered' ? offered : requested;
    return (
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => {
          const key = keyOf(card);
          const mine = side === 'offered' ? (card as MyCard) : null;
          const unavailable = mine !== null && mine.available < 1;
          const isPicked = picked.includes(key);
          const note = mine
            ? mine.tradeableCopies < 1
              ? t.notTradeable
              : mine.available < 1
                ? t.alreadyPromised
                : mine.copies <= 1
                  ? t.lastCopy
                  : null
            : null;
          const rarity = card.rarity ?? 'common';
          return (
            <li key={key}>
              <button
                type="button"
                aria-pressed={isPicked}
                disabled={unavailable || busy !== null}
                onClick={() => togglePick(side, key)}
                aria-label={format(t.pickAria, {
                  name: nameOf(card) ?? t.unnamedCard,
                  rarity: labels.rarity[rarity],
                })}
                className={`block w-full rounded-xl text-left transition ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-40 ${
                  isPicked
                    ? 'ring-2 ring-[var(--color-green)] ring-offset-2 ring-offset-neutral-950'
                    : ''
                }`}
              >
                <TcgCard
                  subject={subjectOf(card)}
                  rarity={rarity}
                  isFoil={card.isFoil ?? false}
                  noLink
                  labels={labels}
                />
              </button>
              {note && (
                <p className="mt-1 text-center text-[11px] text-gray-400">
                  {note}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    );
  };

  const renderTradeCards = (
    cards: TradeView['offered'] | TradeView['requested'],
    showOwned: boolean
  ) => (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {cards.map((card) => {
        const owned = (card as { ownedCopies?: number }).ownedCopies;
        return (
          <li key={keyOf(card)}>
            <TcgCard
              subject={subjectOf(card)}
              rarity={card.rarity ?? 'common'}
              isFoil={card.isFoil ?? false}
              noLink
              labels={labels}
            />
            {showOwned && typeof owned === 'number' && (
              <p
                className={`mt-1 text-center text-[11px] ${owned <= 1 ? 'text-amber-300' : 'text-gray-400'}`}
              >
                {owned === 0
                  ? t.youOwnNone
                  : format(t.youOwn, { count: owned })}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );

  const tabClass = (active: boolean) =>
    `min-h-11 rounded-full px-4 py-2 text-sm font-semibold transition ${FOCUS_RING} ${
      active
        ? 'bg-white/15 text-white'
        : 'text-gray-400 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      <main className="container mx-auto px-4 pb-16 pt-24">
        <Link
          href="/player/tcg"
          className={`text-sm text-purple-300 underline-offset-4 hover:underline ${FOCUS_RING}`}
        >
          {t.backToCollection}
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight md:text-4xl">
          {t.title}
        </h1>
        <p className="mt-2 max-w-prose text-sm text-gray-300">{t.intro}</p>

        {/* Région d'annonce, montée vide en permanence. */}
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>

        {/* Préférence — l'explication AVANT l'interrupteur. */}
        <section
          aria-labelledby="trade-pref-title"
          className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
        >
          <h2 id="trade-pref-title" className="text-lg font-semibold">
            {t.prefTitle}
          </h2>
          {settingsState === 'loading' && !settings ? (
            <Skeleton className="mt-4 h-24 w-full" />
          ) : settingsState === 'error' || !settings ? (
            <div role="alert" className="mt-3 text-sm text-red-300">
              {t.err_generic}{' '}
              <button
                type="button"
                onClick={() => void loadSettings()}
                className={`underline ${FOCUS_RING}`}
              >
                {t.retry}
              </button>
            </div>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-300">
                {tradingOn ? t.prefStateOn : t.prefStateOff}
              </p>
              <p className="mt-4 text-sm font-medium text-gray-200">
                {t.prefWhatItMeans}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-300">
                <li>{t.prefVisible}</li>
                <li>{t.prefDoubles}</li>
                <li>{t.prefNoMessage}</li>
                <li>{t.prefOffCancels}</li>
              </ul>

              {!tradingOn && settings.eligible === false && (
                <p className="mt-4 text-sm text-amber-300">
                  {settings.eligibilityReason === 'too_recent' &&
                  settings.eligibleAt
                    ? format(t.prefOpensOn, {
                        date: formatDate(settings.eligibleAt),
                      })
                    : t.prefNoCollection}
                </p>
              )}

              <button
                type="button"
                onClick={() => void toggleTrading()}
                disabled={
                  busy !== null || (!tradingOn && settings.eligible === false)
                }
                aria-busy={busy === 'settings'}
                className={`mt-4 min-h-11 rounded-xl px-5 py-2 text-sm font-semibold transition disabled:opacity-50 ${FOCUS_RING} ${
                  tradingOn
                    ? 'border border-white/20 text-gray-200 hover:bg-white/10'
                    : 'bg-[var(--color-violet)]/40 text-white hover:bg-[var(--color-violet)]/60'
                }`}
              >
                {busy === 'settings'
                  ? t.prefSaving
                  : tradingOn
                    ? t.prefDisable
                    : t.prefEnable}
              </button>

              <details className="mt-5 text-sm text-gray-300">
                <summary
                  className={`cursor-pointer font-medium text-gray-200 ${FOCUS_RING}`}
                >
                  {t.rulesTitle}
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  <li>
                    {format(t.rulesParity, {
                      max: settings.limits.maxCardsPerSide,
                    })}
                  </li>
                  <li>{t.rulesNoCoins}</li>
                  <li>{t.rulesTradeable}</li>
                  <li>{t.rulesDoubles}</li>
                  <li>{t.rulesSets}</li>
                  <li>
                    {format(t.rulesExpiry, { hours: settings.limits.ttlHours })}
                  </li>
                  <li>
                    {format(t.rulesLimits, {
                      sent: settings.limits.maxPendingSent,
                      daily: settings.limits.maxAcceptedPerDay,
                    })}
                  </li>
                  <li>
                    {format(t.rulesCooldown, {
                      hours: settings.limits.declineCooldownHours,
                    })}
                  </li>
                  <li>
                    {format(t.rulesAge, {
                      account: settings.limits.minAccountAgeDays,
                      collection: settings.limits.minCollectionAgeDays,
                    })}
                  </li>
                </ul>
              </details>
            </>
          )}
        </section>

        {/* Composeur — seulement échanges activés. */}
        {tradingOn && (
          <section
            aria-labelledby="trade-compose-title"
            className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
          >
            <h2 id="trade-compose-title" className="text-lg font-semibold">
              {t.composeTitle}
            </h2>

            {partners === null ? (
              <p className="mt-3 text-sm text-gray-400">{t.loading}</p>
            ) : partners.length === 0 ? (
              <p className="mt-3 text-sm text-gray-400">{t.partnersEmpty}</p>
            ) : (
              <>
                <label
                  htmlFor="trade-partner"
                  className="mt-4 block text-sm font-medium text-gray-200"
                >
                  {t.partnerLabel}
                </label>
                <select
                  id="trade-partner"
                  value={partnerId}
                  onChange={(e) => void choosePartner(e.target.value)}
                  className={`mt-2 min-h-11 w-full max-w-sm rounded-xl border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-white ${FOCUS_RING}`}
                >
                  <option value="">{t.partnerPlaceholder}</option>
                  {partners.map((p) => (
                    <option key={p.userId} value={p.userId}>
                      {p.displayName}
                    </option>
                  ))}
                </select>

                {partnerId && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold text-gray-200">
                      {t.theirDoublesTitle}
                    </h3>
                    <div className="mt-3">
                      {theirCards === null ? (
                        <p className="text-sm text-gray-400">{t.loading}</p>
                      ) : theirCards.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          {t.theirDoublesEmpty}
                        </p>
                      ) : (
                        renderPickGrid('requested', theirCards)
                      )}
                    </div>

                    <h3 className="mt-6 text-sm font-semibold text-gray-200">
                      {t.myCardsTitle}
                    </h3>
                    <div className="mt-3">
                      {myCards === null ? (
                        <p className="text-sm text-gray-400">{t.loading}</p>
                      ) : myCards.length === 0 ? (
                        <p className="text-sm text-gray-400">
                          {t.myCardsEmpty}
                        </p>
                      ) : (
                        renderPickGrid('offered', myCards)
                      )}
                    </div>

                    <div className="sticky bottom-3 mt-6 flex flex-col gap-2 rounded-xl border border-white/10 bg-neutral-900/95 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-gray-200" aria-live="polite">
                        {format(t.summary, {
                          offered: offered.length,
                          requested: requested.length,
                        })}
                        {offered.length !== requested.length && (
                          <span className="block text-xs text-gray-400">
                            {t.parityHint}
                          </span>
                        )}
                        <span className="block text-xs text-gray-500">
                          {format(t.maxHint, { max: maxCards })}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={() => void submitProposal()}
                        disabled={!canSubmit || busy !== null}
                        aria-busy={busy === 'propose'}
                        className={`min-h-11 rounded-xl bg-[var(--color-green)]/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-green)]/45 disabled:opacity-40 ${FOCUS_RING}`}
                      >
                        {busy === 'propose' ? t.submitting : t.submit}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* Boîtes de propositions. */}
        <section
          aria-labelledby="trade-box-title"
          className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6"
        >
          <h2 id="trade-box-title" className="text-lg font-semibold">
            {t.boxLabel}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <div className="flex gap-1" role="group" aria-label={t.boxLabel}>
              <button
                type="button"
                aria-pressed={box === 'received'}
                onClick={() => setBox('received')}
                className={tabClass(box === 'received')}
              >
                {t.boxReceived}
              </button>
              <button
                type="button"
                aria-pressed={box === 'sent'}
                onClick={() => setBox('sent')}
                className={tabClass(box === 'sent')}
              >
                {t.boxSent}
              </button>
            </div>
            <div className="flex gap-1" role="group">
              <button
                type="button"
                aria-pressed={listState === 'open'}
                onClick={() => setListState('open')}
                className={tabClass(listState === 'open')}
              >
                {t.stateOpen}
              </button>
              <button
                type="button"
                aria-pressed={listState === 'closed'}
                onClick={() => setListState('closed')}
                className={tabClass(listState === 'closed')}
              >
                {t.stateClosed}
              </button>
            </div>
          </div>

          <div className="mt-4" aria-busy={tradesState === 'loading'}>
            {tradesState === 'loading' ? (
              <Skeleton className="h-40 w-full" />
            ) : tradesState === 'error' ? (
              <div role="alert" className="text-sm text-red-300">
                {t.listError}{' '}
                <button
                  type="button"
                  onClick={() => void loadTrades(false, null)}
                  className={`underline ${FOCUS_RING}`}
                >
                  {t.retry}
                </button>
              </div>
            ) : trades.length === 0 ? (
              <p className="text-sm text-gray-400">
                {listState === 'closed'
                  ? t.emptyClosed
                  : box === 'received'
                    ? t.emptyReceived
                    : t.emptySent}
              </p>
            ) : (
              <ul className="space-y-4">
                {trades.map((trade) => {
                  const name = trade.counterpart.displayName ?? t.unknownName;
                  const received = trade.direction === 'received';
                  const reason = reasonLabel(trade.reason);
                  const pending = trade.status === 'pending';
                  return (
                    <li
                      key={trade.id}
                      className="rounded-xl border border-white/10 bg-black/20 p-4"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold">
                          {format(received ? t.fromName : t.toName, { name })}
                        </h3>
                        <p className="text-xs text-gray-400">
                          <span className="mr-2 rounded-full bg-white/10 px-2 py-0.5 font-semibold text-gray-200">
                            {statusLabel[trade.status]}
                          </span>
                          {pending
                            ? format(t.expiresOn, {
                                date: formatDate(trade.expiresAt),
                              })
                            : format(t.resolvedOn, {
                                date: formatDate(trade.resolvedAt),
                              })}
                        </p>
                      </div>
                      {reason && trade.status === 'cancelled' && (
                        <p className="mt-1 text-xs text-gray-400">{reason}</p>
                      )}

                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {received ? t.theyOffer : t.youOffer}
                          </h4>
                          {renderTradeCards(trade.offered, false)}
                        </div>
                        <div>
                          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {received ? t.theyRequest : t.youRequest}
                          </h4>
                          {renderTradeCards(
                            trade.requested,
                            received && pending
                          )}
                        </div>
                      </div>

                      {pending && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {received ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void act(trade, 'accept')}
                                disabled={busy !== null}
                                aria-busy={busy === `accept:${trade.id}`}
                                aria-label={format(t.acceptAria, { name })}
                                className={`min-h-11 rounded-xl bg-[var(--color-green)]/30 px-5 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-green)]/45 disabled:opacity-40 ${FOCUS_RING}`}
                              >
                                {busy === `accept:${trade.id}`
                                  ? t.working
                                  : t.accept}
                              </button>
                              <button
                                type="button"
                                onClick={() => void act(trade, 'decline')}
                                disabled={busy !== null}
                                aria-busy={busy === `decline:${trade.id}`}
                                aria-label={format(t.declineAria, { name })}
                                className={`min-h-11 rounded-xl border border-white/15 px-5 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10 disabled:opacity-40 ${FOCUS_RING}`}
                              >
                                {busy === `decline:${trade.id}`
                                  ? t.working
                                  : t.decline}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => void act(trade, 'cancel')}
                              disabled={busy !== null}
                              aria-busy={busy === `cancel:${trade.id}`}
                              aria-label={format(t.cancelAria, { name })}
                              className={`min-h-11 rounded-xl border border-white/15 px-5 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10 disabled:opacity-40 ${FOCUS_RING}`}
                            >
                              {busy === `cancel:${trade.id}`
                                ? t.working
                                : t.cancel}
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {tradesState === 'ready' && cursor && (
              <div className="mt-6 flex justify-center">
                <button
                  type="button"
                  onClick={async () => {
                    setBusy('more');
                    await loadTrades(true, cursor);
                    setBusy(null);
                  }}
                  disabled={busy !== null}
                  aria-busy={busy === 'more'}
                  className={`min-h-11 rounded-full border border-white/15 bg-white/5 px-6 py-2 text-sm font-semibold text-white transition hover:border-white/40 disabled:opacity-50 ${FOCUS_RING}`}
                >
                  {busy === 'more' ? t.loadingMore : t.loadMore}
                </button>
              </div>
            )}
          </div>
        </section>

        {dialog}
      </main>
    </div>
  );
}

const playerTcgTradesSeo: SeoProps = {
  title: { fr: 'Échanges de cartes', en: 'Card trades' },
  description: {
    fr: 'Échange tes cartes en double avec d’autres collectionneuses.',
    en: 'Trade your duplicate cards with other collectors.',
  },
  noindex: true,
};

PlayerTcgTrades.seo = playerTcgTradesSeo;

export default PlayerTcgTrades;
