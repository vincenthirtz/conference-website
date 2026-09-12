// pages/player/tcg.tsx
//
// Espace joueuse — « Mon TCG » : mes paquets, mon solde, ma collection.
//
// `noindex` comme les autres pages de l'espace : une collection personnelle
// n'a rien à faire dans un moteur de recherche.
//
// LES CARTES SONT RELUES, JAMAIS MISES EN CACHE CÔTÉ CLIENT au-delà de
// l'affichage courant. C'est ce qui fait qu'un retrait de consentement d'une
// joueuse retire sa photo des cartes déjà distribuées : la face vient du
// serveur à chaque chargement (cf. `utils/tcg/readCardFaces.ts`).
//
// L'OUVERTURE ET L'ACHAT SONT DES ACTIONS SÉPARÉES, comme côté serveur :
// acheter crée un paquet FERMÉ, ouvrir le consomme. Les fusionner masquerait
// qu'un paquet acheté peut attendre, et rendrait impossible d'annuler l'une
// sans l'autre.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import TcgCard from '@/components/tcg/TcgCard';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { TcgRarity } from '@/utils/tcg/rarity';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

type Pack = {
  id: string;
  source: 'victory' | 'purchase';
  grantedAt: string;
  openedAt: string | null;
};

type CollectionCard =
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
      count: number;
    }
  | {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
      count: number;
    };

function PlayerTcg() {
  const t = useT(nsPlayerTcg);
  const { addToast } = useToast();
  usePlayerSession({ redirectTo: '/login?next=/player/tcg' });
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [packs, setPacks] = useState<Pack[]>([]);
  const [balance, setBalance] = useState(0);
  // Le prix vient de l'API : le coder ici en dur ferait mentir le bouton dès
  // que le barème bougerait, et importer `economy.ts` traînerait le moteur de
  // rating dans le bundle navigateur.
  const [boosterPrice, setBoosterPrice] = useState<number | null>(null);
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [totals, setTotals] = useState({ distinct: 0, total: 0 });
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const labels = {
    rarity: {
      common: t.rarityCommon,
      rare: t.rarityRare,
      epic: t.rarityEpic,
      legendary: t.rarityLegendary,
    } as Record<TcgRarity, string>,
    foil: t.foil,
    copies: t.copies,
  };

  const load = useCallback(async () => {
    try {
      const [packsData, collData] = await Promise.all([
        adminFetchJson<{
          packs: Pack[];
          balance: number;
          boosterPrice: number;
        }>('/api/player/tcg/packs'),
        adminFetchJson<{
          cards: CollectionCard[];
          distinct: number;
          total: number;
        }>('/api/player/tcg/collection'),
      ]);
      setPacks(packsData.packs ?? []);
      setBalance(packsData.balance ?? 0);
      if (typeof packsData.boosterPrice === 'number') {
        setBoosterPrice(packsData.boosterPrice);
      }
      setCards(collData.cards ?? []);
      setTotals({
        distinct: collData.distinct ?? 0,
        total: collData.total ?? 0,
      });
    } catch {
      // Lecture impossible : on n'affiche pas une collection vide, qui ferait
      // croire à une perte. L'écran reste en attente.
      return;
    } finally {
      setLoaded(true);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPack = useCallback(
    async (packId: string) => {
      setBusy(packId);
      try {
        const res = await adminFetch('/api/player/tcg/packs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ packId }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            code?: string;
          };
          addToast(
            body.code === 'already_opened'
              ? t.errAlreadyOpened
              : body.code === 'empty_pool'
                ? t.errEmptyPool
                : t.errGeneric,
            'error'
          );
          await load();
          return;
        }
        await load();
      } catch {
        addToast(t.errGeneric, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetch, addToast, load, t]
  );

  const buyBooster = useCallback(async () => {
    setBusy('buy');
    try {
      const res = await adminFetch('/api/player/tcg/booster', {
        method: 'POST',
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          code?: string;
          price?: number;
        };
        addToast(
          body.code === 'insufficient_funds'
            ? format(t.errInsufficientFunds, { price: body.price ?? '' })
            : body.code === 'balance_changed'
              ? t.errBalanceChanged
              : t.errGeneric,
          'error'
        );
        await load();
        return;
      }
      addToast(t.buySuccess, 'success');
      await load();
    } catch {
      addToast(t.errGeneric, 'error');
    } finally {
      setBusy(null);
    }
  }, [adminFetch, addToast, load, t]);

  const unopened = packs.filter((p) => !p.openedAt);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      <main className="container mx-auto px-4 pb-16 pt-24">
        <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
          {t.collectionTitle}
        </h1>

        {/* Paquets et solde */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">{t.packsTitle}</h2>
              <p className="mt-1 text-sm text-gray-400">
                {unopened.length === 0
                  ? t.packsNone
                  : format(
                      unopened.length > 1
                        ? t.packsUnopened_other
                        : t.packsUnopened_one,
                      { count: unopened.length }
                    )}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-300">
                {format(t.balance, { count: balance })}
              </p>
              {/* Prix inconnu = bouton absent. Afficher « Acheter (— pièces) »
                  proposerait une dépense dont on ignore le montant. */}
              {boosterPrice !== null && (
                <button
                  type="button"
                  onClick={() => void buyBooster()}
                  disabled={busy !== null}
                  className="mt-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-[var(--color-yellow)]/60 hover:text-[var(--color-yellow)] disabled:opacity-50"
                >
                  {busy === 'buy'
                    ? t.buying
                    : format(t.buyBooster, { price: boosterPrice })}
                </button>
              )}
            </div>
          </div>

          {unopened.length > 0 && (
            <ul className="mt-5 flex flex-wrap gap-2">
              {unopened.map((pack) => (
                <li key={pack.id}>
                  <button
                    type="button"
                    onClick={() => void openPack(pack.id)}
                    disabled={busy !== null}
                    className="rounded-xl border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/10 px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--color-violet)]/20 disabled:opacity-50"
                  >
                    {busy === pack.id ? t.packOpening : t.packOpen}
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {pack.source === 'purchase'
                        ? t.packFromPurchase
                        : t.packFromVictory}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Collection */}
        <section className="mt-8">
          {loaded && cards.length === 0 ? (
            <p className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-300">
              {t.collectionEmpty}
            </p>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-400">
                {format(t.collectionCount, {
                  distinct: totals.distinct,
                  total: totals.total,
                })}
              </p>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {cards.map((card) => (
                  <li
                    key={
                      card.kind === 'player'
                        ? `p-${card.userId}`
                        : `t-${card.teamId}`
                    }
                  >
                    <TcgCard
                      subject={
                        card.kind === 'player'
                          ? {
                              kind: 'player',
                              userId: card.userId,
                              displayName: card.displayName,
                              imageUrl: card.imageUrl,
                            }
                          : {
                              kind: 'team',
                              teamId: card.teamId,
                              name: card.name,
                              slug: card.slug,
                              logoUrl: card.logoUrl,
                            }
                      }
                      rarity={card.rarity}
                      isFoil={card.isFoil}
                      count={card.count}
                      labels={labels}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <p className="mt-10 text-xs text-gray-500">
          <Link href="/player/profile" className="hover:text-gray-300">
            {t.title}
          </Link>
        </p>
      </main>
    </div>
  );
}

const playerTcgSeo: SeoProps = {
  title: { fr: 'Ma collection', en: 'My collection' },
  description: {
    fr: 'Tes cartes à collectionner OW Women’s Cup : paquets, pièces et collection.',
    en: 'Your OW Women’s Cup collectible cards: packs, coins and collection.',
  },
  noindex: true,
};

PlayerTcg.seo = playerTcgSeo;

export default PlayerTcg;
