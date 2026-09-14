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
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import TcgCard from '@/components/tcg/TcgCard';
import { TcgCoin, TcgAmount } from '@/components/tcg/TcgCoin';
import TcgCollectionProgress from '@/components/tcg/TcgCollectionProgress';
import TwitchLinkCard from '@/components/player/TwitchLinkCard';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { TcgRarity } from '@/utils/tcg/rarity';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

type Pack = {
  id: string;
  // `welcome` = cadeau d'accueil d'une édition. L'API rend `source_kind` brut ;
  // l'union doit donc suivre le CHECK de `tcg_packs`, sans quoi une origine
  // ajoutée en base retombe silencieusement sur le libellé d'à côté.
  source: 'victory' | 'purchase' | 'welcome';
  grantedAt: string;
  openedAt: string | null;
};

/**
 * D'où vient ce paquet, en toutes lettres.
 *
 * LA BRANCHE PAR DÉFAUT N'EST PAS DÉCORATIVE. L'API rend `source_kind` en
 * chaîne BRUTE, sans union fermée côté serveur : une origine ajoutée en base
 * arriverait ici sans que TypeScript s'en aperçoive. Sans ce repli, elle
 * prendrait le libellé de la branche voisine — c'est exactement ainsi qu'un
 * paquet de bienvenue se serait annoncé « Gagné en match ».
 */
function packOriginLabel(
  source: Pack['source'],
  t: typeof nsPlayerTcg.fr
): string {
  switch (source) {
    case 'purchase':
      return t.packFromPurchase;
    case 'welcome':
      return t.packFromWelcome;
    case 'victory':
      return t.packFromVictory;
    default:
      return t.packFromVictory;
  }
}

type CollectionCard =
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
      count: number;
      /**
       * L'exemplaire que l'API propose au recyclage — le MOINS précieux — ou
       * `null` quand il n'y a qu'un exemplaire : la route refuse de retirer le
       * dernier, et un bouton condamné au refus ne doit pas s'afficher.
       */
      recyclable?: { packId: string; position: number } | null;
    }
  | {
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      /** Illustration déposée par l'équipe ; `null` ⇒ la carte prend le logo. */
      cardImageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
      count: number;
      /**
       * L'exemplaire que l'API propose au recyclage — le MOINS précieux — ou
       * `null` quand il n'y a qu'un exemplaire : la route refuse de retirer le
       * dernier, et un bouton condamné au refus ne doit pas s'afficher.
       */
      recyclable?: { packId: string; position: number } | null;
    }
  | {
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
      count: number;
      /**
       * L'exemplaire que l'API propose au recyclage — le MOINS précieux — ou
       * `null` quand il n'y a qu'un exemplaire : la route refuse de retirer le
       * dernier, et un bouton condamné au refus ne doit pas s'afficher.
       */
      recyclable?: { packId: string; position: number } | null;
    };

/**
 * Une carte tout juste tirée. Même forme que `CollectionCard` à `count` près :
 * un exemplaire unique n'a pas de compte, et le composant de carte masque déjà
 * le compteur à 1.
 */
type DrawnCard =
  | {
      position: number;
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      position: number;
      kind: 'team';
      teamId: string;
      name: string | null;
      slug: string | null;
      logoUrl: string | null;
      cardImageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
      position: number;
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    };

/**
 * Clé d'un sujet, commune aux deux formes de carte.
 *
 * Sert à répondre à LA question qu'on se pose en ouvrant un paquet : nouvelle
 * carte, ou doublon ? La page détient déjà la collection d'avant le
 * rechargement, donc la réponse ne coûte aucune requête — encore faut-il la
 * calculer avant de rafraîchir, après quoi tout paraît possédé.
 */
function subjectKey(card: DrawnCard | CollectionCard): string {
  // Pendant CLIENT de `utils/tcg/subjectKey.ts`, qui travaille sur des lignes
  // de base ; ici les cartes arrivent déjà mises en forme par l'API et portent
  // des noms de champs différents. Les préfixes doivent rester distincts entre
  // types, sinon une map et une équipe de même identifiant se confondraient.
  if (card.kind === 'player') return `p-${card.userId}`;
  if (card.kind === 'map') return `m-${card.slug}`;
  return `t-${card.teamId}`;
}

/** Un mouvement du registre. `amount` est signé : gain positif, dépense négative. */
type WalletEntry = {
  id: string;
  amount: number;
  sourceKind: string;
  sourceRef: string;
  createdAt: string;
};

function PlayerTcg() {
  const t = useT(nsPlayerTcg);
  const { addToast } = useToast();
  usePlayerSession({ redirectTo: '/login?next=/player/tcg' });
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [packs, setPacks] = useState<Pack[]>([]);
  const [balance, setBalance] = useState(0);
  // Recycler MARQUE une carte définitivement : le geste passe par une
  // confirmation, comme les autres actions irréversibles de l'espace joueuse.
  const { confirm, dialog } = useConfirmDialog();

  // Le prix vient de l'API : le coder ici en dur ferait mentir le bouton dès
  // que le barème bougerait, et importer `economy.ts` traînerait le moteur de
  // rating dans le bundle navigateur.
  const [boosterPrice, setBoosterPrice] = useState<number | null>(null);
  /**
   * Ce que rapporte le recyclage d'un doublon, rendu par l'API.
   *
   * `null` tant qu'on ne l'a pas lu — et le bouton reste alors absent : « +—
   * pièces » proposerait un échange dont on ignore le montant, exactement la
   * raison qui fait déjà disparaître le bouton d'achat sans prix connu.
   */
  const [recycleRefund, setRecycleRefund] = useState<number | null>(null);
  // Le barème vient de l'API, comme le prix : sans lui, la page affichait un
  // solde et un bouton d'achat sans jamais dire comment gagner des pièces.
  const [earn, setEarn] = useState<{
    matchWin: number;
    scrimWin: number;
    /**
     * Barème du cadeau d'accueil. OPTIONNEL par prudence de lecture : la page
     * doit rester juste face à une réponse d'API antérieure à son ajout.
     */
    welcomeGift?: number;
    /**
     * Barème du drop en direct. OPTIONNEL : l'API ne le rend que si une chaîne
     * Twitch est connectée ET qu'une récompense lui est désignée. Absent, on
     * n'annonce rien — promettre un gain qui n'aboutirait jamais serait pire
     * que de le taire.
     */
    twitchDrop?: number;
  } | null>(null);
  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [totals, setTotals] = useState({ distinct: 0, total: 0 });
  // Séparé de `totals` : le vivier ne vient pas de la même mesure et peut
  // manquer alors que la collection est lisible.
  const [pool, setPool] = useState<{ distinct: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Les cartes du dernier paquet ouvert. C'est LE moment du TCG : le serveur
  // les renvoie déjà, la page se contentait de les jeter et de recharger la
  // collection, où le tirage se fondait sans qu'on l'ait vu.
  // `newKeys` accompagne les cartes plutôt que de les modifier : « nouvelle »
  // décrit ma collection à cet instant, pas la carte elle-même — la même carte
  // sera un doublon au prochain paquet.
  const [revealed, setRevealed] = useState<{
    cards: DrawnCard[];
    newKeys: string[];
  } | null>(null);
  // L'historique se charge AU CLIC, pas au chargement de la page. Le solde est
  // déjà affiché ; imposer une requête de plus à chaque visite pour une
  // information qu'on consulte rarement ferait payer tout le monde pour le
  // confort de quelques-unes. C'est aussi pourquoi la route est séparée.
  const [wallet, setWallet] = useState<{
    entries: WalletEntry[];
    truncated: boolean;
  } | null>(null);
  const [walletOpen, setWalletOpen] = useState(false);

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
          recycleRefund?: number;
          earn?: { matchWin: number; scrimWin: number; twitchDrop?: number };
        }>('/api/player/tcg/packs'),
        adminFetchJson<{
          cards: CollectionCard[];
          distinct: number;
          total: number;
          // Le vivier — combien de sujets EXISTENT. `null` quand la lecture a
          // échoué : la barre disparaît alors, plutôt que d'annoncer « 12 sur 0 ».
          pool?: { distinct: number } | null;
        }>('/api/player/tcg/collection'),
      ]);
      setPacks(packsData.packs ?? []);
      setBalance(packsData.balance ?? 0);
      if (typeof packsData.boosterPrice === 'number') {
        setBoosterPrice(packsData.boosterPrice);
      }
      // Le montant vient de l'API, jamais recopié ici : le recopier ferait
      // mentir le bouton au premier réglage du barème.
      if (typeof packsData.recycleRefund === 'number') {
        setRecycleRefund(packsData.recycleRefund);
      }
      if (
        typeof packsData.earn?.matchWin === 'number' &&
        typeof packsData.earn?.scrimWin === 'number'
      ) {
        setEarn(packsData.earn);
      }
      setCards(collData.cards ?? []);
      setPool(
        collData.pool && typeof collData.pool.distinct === 'number'
          ? collData.pool
          : null
      );
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

        // LA RÉVÉLATION. Le serveur renvoie les cartes tirées, faces
        // comprises : on les garde pour les montrer, au lieu de recharger la
        // collection en silence. Une réponse illisible n'est pas une erreur
        // d'ouverture — le paquet EST ouvert et les cartes sont en base ; on
        // se rabat alors sur le rechargement, sans rien annoncer de faux.
        const body = (await res.json().catch(() => null)) as {
          cards?: DrawnCard[];
        } | null;
        if (Array.isArray(body?.cards) && body.cards.length > 0) {
          // Photo de la collection AVANT le rechargement : c'est le seul
          // moment où « nouvelle » veut encore dire quelque chose. Après
          // `load()`, tout ce qu'on vient de tirer figure dans la collection
          // et paraît possédé de longue date.
          const ownedBefore = new Set(cards.map(subjectKey));
          const drawn = [...body.cards].sort((a, b) => a.position - b.position);
          setRevealed({
            cards: drawn,
            newKeys: drawn.map(subjectKey).filter((k) => !ownedBefore.has(k)),
          });
        }

        await load();
      } catch {
        addToast(t.errGeneric, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetch, addToast, load, t, cards]
  );

  /**
   * Libellé d'un mouvement. L'API rend le FAIT (`sourceKind`), la page le
   * formule : traduire côté serveur l'obligerait à connaître la langue de la
   * lectrice. Une source inconnue — un `source_kind` ajouté plus tard — rend un
   * libellé neutre plutôt que rien : le montant et la date restent lisibles.
   */
  const walletLabel = useCallback(
    (sourceKind: string): string => {
      switch (sourceKind) {
        case 'match_win':
          return t.walletMatchWin;
        case 'scrim_win':
          return t.walletScrimWin;
        case 'booster_purchase':
          return t.walletBoosterPurchase;
        case 'admin_grant':
          return t.walletAdminGrant;
        case 'card_recycled':
          return t.walletCardRecycled;
        case 'twitch_drop':
          // Sans ce cas, un drop tombait dans le repli neutre (« Mouvement ») :
          // des pièces arrivaient sans que la joueuse puisse les rattacher à
          // une action — le seul gain inexplicable de la liste.
          return t.walletTwitchDrop;
        default:
          return t.walletUnknownSource;
      }
    },
    [t]
  );

  const toggleWallet = useCallback(async () => {
    if (walletOpen) {
      setWalletOpen(false);
      return;
    }
    setWalletOpen(true);
    // Rechargé à chaque ouverture : le registre a pu bouger depuis la dernière
    // fois, et il est bon marché. On ne montre rien en cas d'échec plutôt
    // qu'un historique vide, qui ferait croire à une absence de mouvements.
    try {
      const data = await adminFetchJson<{
        entries: WalletEntry[];
        truncated: boolean;
      }>('/api/player/tcg/wallet');
      setWallet({
        entries: data.entries ?? [],
        truncated: data.truncated === true,
      });
    } catch {
      setWallet(null);
    }
  }, [walletOpen, adminFetchJson]);

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

  /**
   * Recycler un doublon.
   *
   * LE GESTE EST DÉFINITIF — la carte est marquée, pas empruntée — d'où la
   * confirmation, qui dit aussi lequel des exemplaires part. Même patron que
   * `buyBooster` : état occupé, traduction du `code` d'erreur, et `load()`
   * dans les DEUX issues.
   *
   * Recharger même après un échec n'est pas de la prudence excessive : la route
   * marque la carte AVANT de créditer, et relâche le marquage si le crédit
   * échoue. L'écran doit donc montrer l'état réel plutôt que sa version
   * optimiste — dans un sens comme dans l'autre.
   */
  const recycleCard = useCallback(
    async (target: { packId: string; position: number }) => {
      const busyKey = `recycle:${target.packId}:${target.position}`;
      const ok = await confirm({
        title: t.recycleConfirmTitle,
        subtitle: format(t.recycleConfirmBody, { refund: recycleRefund ?? '' }),
        variant: 'warning',
        confirmLabel: t.recycleConfirmYes,
        cancelLabel: t.recycleConfirmNo,
      });
      if (!ok) return;

      setBusy(busyKey);
      try {
        const res = await adminFetch('/api/player/tcg/recycle', {
          method: 'POST',
          body: JSON.stringify(target),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as {
            code?: string;
            refund?: number;
          };
          addToast(
            body.code === 'not_a_duplicate'
              ? t.errNotADuplicate
              : body.code === 'already_recycled'
                ? t.errAlreadyRecycled
                : t.errGeneric,
            'error'
          );
          await load();
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          refund?: number;
        };
        addToast(
          format(t.recycleSuccess, {
            refund: body.refund ?? recycleRefund ?? '',
          }),
          'success'
        );
        await load();
      } catch {
        addToast(t.errGeneric, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetch, addToast, confirm, load, recycleRefund, t]
  );

  const unopened = packs.filter((p) => !p.openedAt);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      <main className="container mx-auto px-4 pb-16 pt-24">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {t.collectionTitle}
          </h1>
          {/* Discret, mais AU TITRE : « d'où viennent les paquets » et « que
              devient ma photo » se demandent en regardant sa collection, pas
              depuis le tableau de bord. */}
          <Link
            href="/player/tcg-guide"
            className="text-sm font-medium text-purple-300 underline-offset-4 transition hover:text-purple-200 hover:underline"
          >
            {t.guideLink}
          </Link>
        </div>

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
              {/* Le solde porte la pièce : c'est le montant qu'on vient
                  chercher sur cette page. Le libellé remplace le mot
                  « pièces », que l'icône dit déjà. */}
              <p className="flex items-center justify-end gap-2 text-sm text-gray-300">
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  {t.balanceLabel}
                </span>
                <TcgAmount
                  value={balance}
                  size={18}
                  className="text-base font-semibold text-white"
                />
              </p>
              {/* Comment on en gagne. À zéro, un prix sans chemin pour
                  l'atteindre n'apprend rien. */}
              {earn !== null && (
                <p className="mt-1 text-xs text-gray-500">
                  {/* Le drop n'est mentionné QUE s'il est branché : l'API ne
                      rend `twitchDrop` que si une chaîne est connectée avec une
                      récompense désignée. Deux formulations plutôt qu'une
                      phrase à trous — « et  par carte » se lirait mal. */}
                  {typeof earn.twitchDrop === 'number'
                    ? format(t.earnHintWithDrop, {
                        match: earn.matchWin,
                        scrim: earn.scrimWin,
                        drop: earn.twitchDrop,
                      })
                    : format(t.earnHint, {
                        match: earn.matchWin,
                        scrim: earn.scrimWin,
                      })}
                </p>
              )}
              {/* Prix inconnu = bouton absent. Afficher « Acheter (— pièces) »
                  proposerait une dépense dont on ignore le montant. */}
              {boosterPrice !== null && (
                <button
                  type="button"
                  onClick={() => void buyBooster()}
                  disabled={busy !== null}
                  className="mt-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-[var(--color-yellow)]/60 hover:text-[var(--color-yellow)] disabled:opacity-50"
                >
                  {busy === 'buy' ? (
                    t.buying
                  ) : (
                    // Le prix en pièce plutôt qu'en toutes lettres : c'est une
                    // dépense, et la pastille la rend comparable au solde
                    // affiché juste au-dessus.
                    <span className="inline-flex items-center gap-2">
                      {t.buyBoosterShort}
                      <TcgAmount value={boosterPrice} size={15} />
                    </span>
                  )}
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
                      {/* Un `switch` et non un ternaire binaire : avec deux
                          issues seulement, un paquet `welcome` se serait
                          affiché « Gagné en match » — le même défaut muet que
                          le porte-monnaie, où un drop passait pour un
                          « Mouvement ». */}
                      {packOriginLabel(pack.source, t)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Mon compte Twitch — JUSTE SOUS LE BARÈME, et c'est tout l'intérêt de
            ce montage. La page annonce « et N pièces par carte récupérée sur le
            stream » (cf. `earnHintWithDrop`) sans qu'aucun geste, depuis cet
            écran, ne permette d'y accéder : le rattachement ne vivait que sur
            `/player/profile`, où l'on ne va pas en pensant au TCG. La promesse
            et le moyen de l'honorer se lisent désormais l'un sous l'autre.

            La page profil portait déjà le bon raisonnement en commentaire —
            « placée AVANT les cartes TCG parce qu'elle en est la condition
            d'accès » — il n'avait simplement jamais été appliqué ici.

            MONTÉE SANS CONDITION. Elle se masque d'elle-même quand la
            fonctionnalité est dormante, et son état « lié » a sa place : voir
            la promesse et pouvoir vérifier son rattachement au même endroit est
            précisément ce qui manquait. La restreindre au seul état « non lié »
            ferait disparaître la confirmation au moment où elle rassure.

            `loginPath` n'est pas passé : son défaut (`/login`) est déjà celui
            de cette page. */}
        <div className="mt-8">
          <TwitchLinkCard />
        </div>

        {/* Le tirage qu'on vient d'ouvrir, entre les paquets et la collection :
            on le voit à l'endroit où le regard va après avoir cliqué. Il reste
            affiché jusqu'à ce qu'on le ferme — une révélation qui disparaît
            toute seule est une révélation ratée. */}
        {revealed !== null && (
          <section className="mt-8 rounded-2xl border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/[0.07] p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{t.revealTitle}</h2>
                <p className="mt-1 text-sm text-gray-400">{t.revealSubtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-white/40 hover:text-white"
              >
                {t.revealDismiss}
              </button>
            </div>
            <ul className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {revealed.cards.map((card) => (
                <li key={card.position}>
                  {/* Nouvelle ou doublon : l'information qu'on cherche en
                      ouvrant. Posée au-dessus de la carte plutôt que dans
                      `TcgCard`, qui décrit une carte et non mon rapport à
                      elle — la collection réutilise le même composant. */}
                  {revealed.newKeys.includes(subjectKey(card)) && (
                    <p className="mb-1 text-center text-[11px] font-bold uppercase tracking-wider text-[var(--color-green)]">
                      {t.revealNewCard}
                    </p>
                  )}
                  <TcgCard
                    subject={
                      card.kind === 'player'
                        ? {
                            kind: 'player',
                            userId: card.userId,
                            displayName: card.displayName,
                            imageUrl: card.imageUrl,
                          }
                        : card.kind === 'map'
                          ? {
                              kind: 'map',
                              slug: card.slug,
                              name: card.name,
                              imageUrl: card.imageUrl,
                            }
                          : {
                              kind: 'team',
                              teamId: card.teamId,
                              name: card.name,
                              slug: card.slug,
                              logoUrl: card.logoUrl,
                              cardImageUrl: card.cardImageUrl,
                            }
                    }
                    rarity={card.rarity}
                    isFoil={card.isFoil}
                    labels={labels}
                  />
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* ── Historique du porte-monnaie ──────────────────────────────────
            « D'où viennent mes pièces ? » — la question que la migration du
            registre annonçait, et à laquelle rien ne répondait : la page
            affichait un solde sans aucun moyen de savoir ce qui l'avait formé.

            Replié par défaut, chargé au clic : le solde suffit à la plupart des
            visites. */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <TcgCoin size={18} />
              {t.walletTitle}
            </h2>
            <button
              type="button"
              onClick={() => void toggleWallet()}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-white/40 hover:text-white"
            >
              {walletOpen ? t.walletHide : t.walletShow}
            </button>
          </div>

          {walletOpen && wallet !== null && (
            <>
              {wallet.entries.length === 0 ? (
                <p className="mt-4 text-sm text-gray-400">{t.walletEmpty}</p>
              ) : (
                <ul className="mt-4 divide-y divide-white/5">
                  {wallet.entries.map((e) => (
                    <li
                      key={e.id}
                      className="flex items-center justify-between gap-4 py-2 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate text-gray-300">
                        {walletLabel(e.sourceKind)}
                      </span>
                      {/* Le signe est porté par la couleur ET par le texte :
                          la couleur seule ne se lit pas en daltonisme. */}
                      <TcgAmount
                        value={e.amount}
                        signed
                        size={14}
                        className={
                          e.amount >= 0
                            ? 'shrink-0 font-semibold text-[var(--color-green)]'
                            : 'shrink-0 font-semibold text-gray-400'
                        }
                      />
                    </li>
                  ))}
                </ul>
              )}
              {wallet.truncated && (
                <p className="mt-3 text-xs text-gray-500">
                  {format(t.walletTruncated, { count: wallet.entries.length })}
                </p>
              )}
            </>
          )}
        </section>

        {/* ── Progression ──────────────────────────────────────────────────
            « 12 cartes » ne dit rien sans « sur combien » : un TCG vit de la
            complétion, et sans horizon il n'y a pas d'objectif. Le composant
            se masque tout seul quand le vivier est inconnu — un dénominateur
            faux serait pire qu'un dénominateur absent.

            Pas de répartition par rareté : elle exigerait de recalculer les
            badges de tout le vivier (cf. `collection.ts`). Le composant sait
            s'en passer. */}
        <TcgCollectionProgress
          owned={{ distinct: totals.distinct, total: totals.total }}
          pool={pool ?? undefined}
          labels={{
            title: t.progressTitle,
            // Le PLURIEL est choisi ici, pas dans le composant : lui apprendre
            // les règles de chaque langue serait le mauvais endroit.
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
                {cards.map((card) => {
                  // Extrait en variable locale plutôt que ré-interrogé dans le
                  // gestionnaire : cela évite une assertion non-nulle et rend
                  // la clé d'occupation lisible.
                  const target = card.recyclable ?? null;
                  const recycleKey = target
                    ? `recycle:${target.packId}:${target.position}`
                    : null;
                  return (
                    // `subjectKey` plutôt qu'une clé recopiée : une seule règle
                    // d'identité pour la collection et pour la révélation.
                    <li key={subjectKey(card)}>
                      <TcgCard
                        subject={
                          card.kind === 'player'
                            ? {
                                kind: 'player',
                                userId: card.userId,
                                displayName: card.displayName,
                                imageUrl: card.imageUrl,
                              }
                            : card.kind === 'map'
                              ? {
                                  kind: 'map',
                                  slug: card.slug,
                                  name: card.name,
                                  imageUrl: card.imageUrl,
                                }
                              : {
                                  kind: 'team',
                                  teamId: card.teamId,
                                  name: card.name,
                                  slug: card.slug,
                                  logoUrl: card.logoUrl,
                                  cardImageUrl: card.cardImageUrl,
                                }
                        }
                        rarity={card.rarity}
                        isFoil={card.isFoil}
                        count={card.count}
                        labels={labels}
                      />
                      {/* Le recyclage n'apparaît QUE sur un vrai doublon :
                        l'API ne rend `recyclable` qu'à partir de deux
                        exemplaires, et la route refuserait le dernier. Le
                        montant est celui rendu par l'API — le recopier ici le
                        ferait mentir au premier réglage du barème. */}
                      {target && recycleRefund !== null && (
                        <button
                          type="button"
                          onClick={() => void recycleCard(target)}
                          disabled={busy !== null}
                          className="mt-2 w-full rounded-lg border border-white/10 px-2 py-1.5 text-[11px] text-gray-400 transition hover:border-[var(--color-green)]/50 hover:text-[var(--color-green)] disabled:opacity-50"
                        >
                          {busy === recycleKey
                            ? t.recycling
                            : format(t.recycleAction, {
                                refund: recycleRefund,
                              })}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>

        <p className="mt-10 text-xs text-gray-500">
          <Link href="/player/profile" className="hover:text-gray-300">
            {t.title}
          </Link>
        </p>

        {/* Sans ce rendu, `await confirm(...)` ne se résoudrait jamais et le
            bouton de recyclage resterait bloqué. */}
        {dialog}
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
