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
//
// LA COLLECTION ET LES PAQUETS SONT PAGINÉS (curseur rendu par l'API). Deux
// conséquences qui structurent cette page :
//   - « nouvelle carte ou doublon ? » ne peut plus se déduire de la collection
//     chargée — une carte possédée mais pas encore affichée passerait pour
//     nouvelle. C'est le serveur qui le dit (`isNew`) ;
//   - un rechargement après une action (ouverture, recyclage) redemande AU
//     MOINS autant de cartes qu'il y en avait à l'écran : revenir à la première
//     page ferait disparaître ce qu'on était en train de regarder.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import TcgCard, { type TcgCardSubject } from '@/components/tcg/TcgCard';
import { TcgCoin, TcgAmount } from '@/components/tcg/TcgCoin';
import TcgCollectionProgress from '@/components/tcg/TcgCollectionProgress';
import TcgSetsPanel, {
  type TcgSetCompletedNotice,
} from '@/components/tcg/TcgSetsPanel';
import PredictionsPanel from '@/components/predictions/PredictionsPanel';
import FanartSubmitPanel from '@/components/tcg/FanartSubmitPanel';
import TcgShowcaseEditor from '@/components/tcg/TcgShowcaseEditor';
import TcgPackReveal, {
  type TcgRevealCard,
} from '@/components/tcg/TcgPackReveal';
import TwitchLinkCard, {
  type TwitchLinkStatus,
} from '@/components/player/TwitchLinkCard';
import { Skeleton } from '@/components/ui/Skeleton';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { TcgRarity } from '@/utils/tcg/rarity';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import nsTcgTrade from '@/lib/i18n/locales/fr/tcgTrade';

/**
 * Paquets à ouvrir par page. Au-delà, un bouton « voir les autres » : un mur de
 * quarante boutons « Ouvrir » ne sert personne, et la plupart des comptes en ont
 * moins de dix.
 */
const PACKS_PAGE = 24;
/** Cartes par page : huit rangées sur la grille à cinq colonnes. */
const COLLECTION_PAGE = 40;
/** Plafond d'une page côté API (`MAX_PAGE_LIMIT`). */
const API_MAX_LIMIT = 200;
/** Ancre de la carte Twitch, visée par le lien du barème. */
const TWITCH_ANCHOR = 'tcg-twitch';

type Pack = {
  id: string;
  // `welcome` = cadeau d'accueil d'une édition. L'API rend `source_kind` brut ;
  // l'union doit donc suivre le CHECK de `tcg_packs`, sans quoi une origine
  // ajoutée en base retombe silencieusement sur le libellé d'à côté.
  // `drop`, `placement`, `streak` : paquets sans match (drop Twitch, palmarès
  // de tournoi, série de check-ins — `tcg_earn_sources_drop_streak_placement.sql`).
  source: 'victory' | 'purchase' | 'welcome' | 'drop' | 'placement' | 'streak';
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
    case 'drop':
      return t.packFromDrop;
    case 'placement':
      return t.packFromPlacement;
    case 'streak':
      return t.packFromStreak;
    case 'victory':
      return t.packFromVictory;
    default:
      return t.packFromVictory;
  }
}

/**
 * L'exemplaire que l'API propose au recyclage — le MOINS précieux — ou `null`
 * quand il n'y a qu'un exemplaire : la route refuse de retirer le dernier, et
 * un bouton condamné au refus ne doit pas s'afficher.
 */
type Recyclable = { packId: string; position: number } | null;

type CollectionCard =
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
      count: number;
      recyclable?: Recyclable;
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
      recyclable?: Recyclable;
    }
  | {
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
      count: number;
      recyclable?: Recyclable;
    };

/**
 * Une carte tout juste tirée. Même forme que `CollectionCard` à `count` près,
 * plus `isNew` : rendu par le serveur, OPTIONNEL parce qu'une lecture en échec
 * l'omet (et qu'une réponse d'API antérieure ne le porte pas).
 */
type DrawnCard = { position: number; isNew?: boolean } & (
  | {
      kind: 'player';
      userId: string;
      displayName: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
  | {
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
      kind: 'map';
      slug: string;
      name: string | null;
      imageUrl: string | null;
      rarity: TcgRarity;
      isFoil: boolean;
    }
);

type Earn = {
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
   * n'annonce rien — promettre un gain qui n'aboutirait jamais serait pire que
   * de le taire.
   */
  twitchDrop?: number;
};

type PacksResponse = {
  packs: Pack[];
  unopened?: number;
  balance: number;
  boosterPrice: number;
  recycleRefund?: number;
  earn?: Earn;
  nextCursor?: string | null;
};

type CollectionResponse = {
  cards: CollectionCard[];
  distinct: number;
  total: number;
  // Le vivier — combien de sujets EXISTENT. `null` quand la lecture a échoué :
  // la barre disparaît alors, plutôt que d'annoncer « 12 sur 0 ».
  pool?: { distinct: number } | null;
  nextCursor?: string | null;
};

/**
 * Clé d'un sujet, commune aux deux formes de carte.
 *
 * Pendant CLIENT de `utils/tcg/subjectKey.ts`, qui travaille sur des lignes de
 * base ; ici les cartes arrivent déjà mises en forme par l'API. Les préfixes
 * doivent rester distincts entre types, sinon une map et une équipe de même
 * identifiant se confondraient. Sert à dédoublonner deux pages de collection.
 */
function subjectKey(card: DrawnCard | CollectionCard): string {
  if (card.kind === 'player') return `p-${card.userId}`;
  if (card.kind === 'map') return `m-${card.slug}`;
  return `t-${card.teamId}`;
}

/** La face à passer à `TcgCard`, pour les deux formes de carte. */
function cardSubject(card: DrawnCard | CollectionCard): TcgCardSubject {
  if (card.kind === 'player') {
    return {
      kind: 'player',
      userId: card.userId,
      displayName: card.displayName,
      imageUrl: card.imageUrl,
    };
  }
  if (card.kind === 'map') {
    return {
      kind: 'map',
      slug: card.slug,
      name: card.name,
      imageUrl: card.imageUrl,
    };
  }
  return {
    kind: 'team',
    teamId: card.teamId,
    name: card.name,
    slug: card.slug,
    logoUrl: card.logoUrl,
    cardImageUrl: card.cardImageUrl,
  };
}

/** Le nom lisible d'une carte, ou `null` si la face n'en porte pas. */
function cardName(card: DrawnCard | CollectionCard): string | null {
  return card.kind === 'player' ? card.displayName : card.name;
}

/** Un mouvement du registre. `amount` est signé : gain positif, dépense négative. */
type WalletEntry = {
  id: string;
  amount: number;
  sourceKind: string;
  sourceRef: string;
  /** Motif d'une correction de l'équipe ; `null` pour tout le reste. */
  note?: string | null;
  createdAt: string;
};

type LoadState = 'loading' | 'ready' | 'error';

function PlayerTcg() {
  const t = useT(nsPlayerTcg);
  const tTrade = useT(nsTcgTrade);
  const { addToast } = useToast();
  usePlayerSession({ redirectTo: '/login?next=/player/tcg' });
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  // Recycler MARQUE une carte définitivement : le geste passe par une
  // confirmation, comme les autres actions irréversibles de l'espace joueuse.
  const { confirm, dialog } = useConfirmDialog();

  /**
   * `loading` → `ready` | `error`. UNE LECTURE RATÉE N'EST PAS UNE COLLECTION
   * VIDE : la page affichait « Aucune carte pour l'instant » quand l'API ne
   * répondait pas, c'est-à-dire qu'elle annonçait une perte qui n'avait pas eu
   * lieu. L'erreur a désormais son écran, avec de quoi réessayer.
   */
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const loadedOnceRef = useRef(false);

  const [packs, setPacks] = useState<Pack[]>([]);
  const [unopenedCount, setUnopenedCount] = useState(0);
  const [packsCursor, setPacksCursor] = useState<string | null>(null);
  const [balance, setBalance] = useState(0);
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
  const [earn, setEarn] = useState<Earn | null>(null);

  const [cards, setCards] = useState<CollectionCard[]>([]);
  const [collectionCursor, setCollectionCursor] = useState<string | null>(null);
  const [totals, setTotals] = useState({ distinct: 0, total: 0 });
  // Séparé de `totals` : le vivier ne vient pas de la même mesure et peut
  // manquer alors que la collection est lisible.
  const [pool, setPool] = useState<{ distinct: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Les cartes du dernier paquet ouvert. `id` sert de clé de montage : ouvrir
  // un second paquet sans fermer le premier doit REJOUER l'apparition et le
  // déplacement du focus, pas mettre à jour une révélation déjà montée.
  const [revealed, setRevealed] = useState<{
    id: string;
    cards: DrawnCard[];
  } | null>(null);
  // Les séries que la dernière ouverture vient de compléter : la récompense a
  // été écrite À CE MOMENT-LÀ, c'est donc cette réponse qui le dit.
  const [setsCompleted, setSetsCompleted] = useState<
    TcgSetCompletedNotice[] | null
  >(null);
  /**
   * Ce que lit la région `aria-live`. Elle est montée en permanence, vide : une
   * région insérée AVEC son contenu n'est pas annoncée par tous les lecteurs
   * d'écran.
   */
  const [announcement, setAnnouncement] = useState('');

  // L'historique se charge AU CLIC, pas au chargement de la page. Le solde est
  // déjà affiché ; imposer une requête de plus à chaque visite pour une
  // information qu'on consulte rarement ferait payer tout le monde pour le
  // confort de quelques-unes. C'est aussi pourquoi la route est séparée.
  const [wallet, setWallet] = useState<{
    entries: WalletEntry[];
    truncated: boolean;
  } | null>(null);
  const [walletState, setWalletState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [walletOpen, setWalletOpen] = useState(false);

  // État du rattachement Twitch, remonté par la carte : sert à proposer le
  // lien depuis le barème, et seulement à qui n'est pas encore liée.
  const [twitchStatus, setTwitchStatus] = useState<TwitchLinkStatus | null>(
    null
  );

  const packsHeadingRef = useRef<HTMLHeadingElement>(null);
  const collectionListRef = useRef<HTMLUListElement>(null);

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

  /**
   * Annonce polie. Vider d'abord : deux ouvertures au résultat identique
   * produiraient sinon le même texte, et une région dont le contenu ne change
   * pas ne dit rien.
   */
  const announce = useCallback((text: string) => {
    setAnnouncement('');
    requestAnimationFrame(() => setAnnouncement(text));
  }, []);

  /**
   * Au moins `atLeast` cartes, en suivant les curseurs. Borné par la taille de
   * la collection : on s'arrête dès que l'API n'a plus de page.
   */
  const fetchCollection = useCallback(
    async (atLeast: number) => {
      const acc: CollectionCard[] = [];
      let cursor: string | null = null;
      let last: CollectionResponse | null = null;
      do {
        const size = Math.min(
          API_MAX_LIMIT,
          Math.max(COLLECTION_PAGE, atLeast - acc.length)
        );
        const qs: string = cursor
          ? `limit=${size}&cursor=${encodeURIComponent(cursor)}`
          : `limit=${size}`;
        const page: CollectionResponse =
          await adminFetchJson<CollectionResponse>(
            `/api/player/tcg/collection?${qs}`
          );
        acc.push(...(page.cards ?? []));
        last = page;
        cursor = page.nextCursor ?? null;
      } while (cursor && acc.length < atLeast);
      return { cards: acc, last, cursor };
    },
    [adminFetchJson]
  );

  const applyPacks = useCallback((data: PacksResponse, append: boolean) => {
    setPacks((prev) => {
      const incoming = data.packs ?? [];
      if (!append) return incoming;
      const seen = new Set(prev.map((p) => p.id));
      return [...prev, ...incoming.filter((p) => !seen.has(p.id))];
    });
    setPacksCursor(data.nextCursor ?? null);
    setBalance(data.balance ?? 0);
    setUnopenedCount(
      typeof data.unopened === 'number'
        ? data.unopened
        : (data.packs ?? []).filter((p) => !p.openedAt).length
    );
    if (typeof data.boosterPrice === 'number') {
      setBoosterPrice(data.boosterPrice);
    }
    // Le montant vient de l'API, jamais recopié ici : le recopier ferait
    // mentir le bouton au premier réglage du barème.
    if (typeof data.recycleRefund === 'number') {
      setRecycleRefund(data.recycleRefund);
    }
    if (
      typeof data.earn?.matchWin === 'number' &&
      typeof data.earn?.scrimWin === 'number'
    ) {
      setEarn(data.earn);
    }
  }, []);

  const applyCollectionMeta = useCallback((page: CollectionResponse) => {
    setPool(
      page.pool && typeof page.pool.distinct === 'number' ? page.pool : null
    );
    setTotals({ distinct: page.distinct ?? 0, total: page.total ?? 0 });
  }, []);

  /**
   * Recharge paquets et collection.
   *
   * `keepCards` : combien de cartes étaient affichées. On en redemande au
   * moins autant, pour qu'une action faite en bas d'une longue collection ne
   * ramène pas à la première page.
   */
  const load = useCallback(
    async (keepCards = 0) => {
      try {
        const [packsData, coll] = await Promise.all([
          // Seulement les paquets FERMÉS : c'est tout ce que la page affiche,
          // et sans ce filtre un paquet fermé plus ancien que la première page
          // ne pourrait jamais s'ouvrir.
          adminFetchJson<PacksResponse>(
            `/api/player/tcg/packs?status=unopened&limit=${PACKS_PAGE}`
          ),
          fetchCollection(keepCards),
        ]);
        applyPacks(packsData, false);
        setCards(coll.cards);
        setCollectionCursor(coll.cursor);
        if (coll.last) applyCollectionMeta(coll.last);
        loadedOnceRef.current = true;
        setLoadState('ready');
      } catch {
        // Déjà affichée : on garde l'écran (il reste juste à la seconde près)
        // et on prévient. Jamais affichée : l'écran d'erreur, pas un vide.
        if (loadedOnceRef.current) {
          addToast(t.loadMoreError, 'error');
        } else {
          setLoadState('error');
        }
      }
    },
    [
      adminFetchJson,
      fetchCollection,
      applyPacks,
      applyCollectionMeta,
      addToast,
      t,
    ]
  );

  useEffect(() => {
    void load();
  }, [load]);

  const retryLoad = useCallback(() => {
    setLoadState('loading');
    void load();
  }, [load]);

  const loadMorePacks = useCallback(async () => {
    if (!packsCursor) return;
    setBusy('more-packs');
    try {
      const data = await adminFetchJson<PacksResponse>(
        `/api/player/tcg/packs?status=unopened&limit=${PACKS_PAGE}&cursor=${encodeURIComponent(packsCursor)}`
      );
      applyPacks(data, true);
    } catch {
      addToast(t.loadMoreError, 'error');
    } finally {
      setBusy(null);
    }
  }, [adminFetchJson, addToast, applyPacks, packsCursor, t]);

  const loadMoreCards = useCallback(async () => {
    if (!collectionCursor) return;
    setBusy('more-cards');
    const before = cards.length;
    try {
      const page = await adminFetchJson<CollectionResponse>(
        `/api/player/tcg/collection?limit=${COLLECTION_PAGE}&cursor=${encodeURIComponent(collectionCursor)}`
      );
      setCards((prev) => {
        const seen = new Set(prev.map(subjectKey));
        return [
          ...prev,
          ...(page.cards ?? []).filter((c) => !seen.has(subjectKey(c))),
        ];
      });
      setCollectionCursor(page.nextCursor ?? null);
      applyCollectionMeta(page);
      // LE FOCUS SUIT LA SUITE. Le bouton « Afficher plus » disparaît à la
      // dernière page : laissé là, le focus retomberait en haut du document et
      // la personne au clavier perdrait sa place. On le pose sur la première
      // carte ajoutée — c'est aussi ce qu'on veut lire ensuite.
      requestAnimationFrame(() => {
        const item = collectionListRef.current?.children.item(before);
        item?.querySelector<HTMLElement>('a, button')?.focus();
      });
    } catch {
      addToast(t.loadMoreError, 'error');
    } finally {
      setBusy(null);
    }
  }, [
    adminFetchJson,
    addToast,
    applyCollectionMeta,
    cards.length,
    collectionCursor,
    t,
  ]);

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
          await load(cards.length);
          return;
        }

        // LA RÉVÉLATION. Le serveur renvoie les cartes tirées, faces
        // comprises : on les garde pour les montrer, au lieu de recharger la
        // collection en silence. Une réponse illisible n'est pas une erreur
        // d'ouverture — le paquet EST ouvert et les cartes sont en base ; on
        // se rabat alors sur le rechargement, sans rien annoncer de faux.
        const body = (await res.json().catch(() => null)) as {
          cards?: DrawnCard[];
          setsCompleted?: TcgSetCompletedNotice[];
        } | null;
        if (
          Array.isArray(body?.setsCompleted) &&
          body.setsCompleted.length > 0
        ) {
          setSetsCompleted(body.setsCompleted);
        }
        if (Array.isArray(body?.cards) && body.cards.length > 0) {
          const drawn = [...body.cards].sort((a, b) => a.position - b.position);
          setRevealed({ id: packId, cards: drawn });
          announce(
            format(t.revealAnnounce, {
              cards: drawn
                .map((c) => {
                  const parts = [
                    format(t.revealAnnounceCard, {
                      name: cardName(c) ?? t.revealUnnamed,
                      rarity: labels.rarity[c.rarity],
                    }),
                  ];
                  if (c.isFoil) parts.push(t.revealAnnounceFoil);
                  if (c.isNew === true) parts.push(t.revealAnnounceNew);
                  if (c.isNew === false) parts.push(t.revealAnnounceDuplicate);
                  return parts.join(', ');
                })
                .join(' ; '),
            })
          );
        }

        await load(cards.length);
      } catch {
        addToast(t.errGeneric, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetch, addToast, announce, load, t, cards.length, labels.rarity]
  );

  const dismissReveal = useCallback(() => {
    setRevealed(null);
    // Le bouton « Fermer » disparaît avec la révélation : on ramène le focus
    // aux paquets, d'où l'on venait et où l'on ouvrira le suivant.
    requestAnimationFrame(() => packsHeadingRef.current?.focus());
  }, []);

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
        case 'welcome_gift':
          // Même défaut, même correction : les deux cadeaux d'accueil
          // s'affichaient « Mouvement » alors que c'est souvent la PREMIÈRE
          // ligne de l'historique, celle qu'on cherche à comprendre.
          return t.walletWelcomeGift;
        case 'supporter_welcome':
          return t.walletSupporterWelcome;
        case 'checkin_streak':
          return t.walletCheckinStreak;
        case 'tournament_placement':
          return t.walletTournamentPlacement;
        case 'battlenet_verified':
          return t.walletBattlenetVerified;
        case 'collection_set':
          return t.walletCollectionSet;
        case 'match_prediction':
          return t.walletMatchPrediction;
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
    setWalletState('loading');
    // Rechargé à chaque ouverture : le registre a pu bouger depuis la dernière
    // fois, et il est bon marché. Un échec a son message plutôt qu'un
    // historique vide, qui ferait croire à une absence de mouvements.
    try {
      const data = await adminFetchJson<{
        entries: WalletEntry[];
        truncated: boolean;
      }>('/api/player/tcg/wallet');
      setWallet({
        entries: data.entries ?? [],
        truncated: data.truncated === true,
      });
      setWalletState('ready');
    } catch {
      setWallet(null);
      setWalletState('error');
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
        await load(cards.length);
        return;
      }
      addToast(t.buySuccess, 'success');
      await load(cards.length);
    } catch {
      addToast(t.errGeneric, 'error');
    } finally {
      setBusy(null);
    }
  }, [adminFetch, addToast, load, t, cards.length]);

  /**
   * Recycler un doublon.
   *
   * CE QU'ON GAGNE EST CHIFFRÉ AVANT DE CONFIRMER : le montant, le solde avant
   * et après, et combien d'exemplaires il restera. « Recycler (+30) » disait le
   * gain mais ni ce qu'il coûte (une carte) ni ce qu'il laisse — la
   * confirmation est l'endroit où ces trois faits doivent se lire ensemble.
   *
   * Recharger même après un échec n'est pas de la prudence excessive : la route
   * marque la carte AVANT de créditer, et relâche le marquage si le crédit
   * échoue. L'écran doit donc montrer l'état réel plutôt que sa version
   * optimiste — dans un sens comme dans l'autre.
   */
  const recycleCard = useCallback(
    async (card: CollectionCard) => {
      const target = card.recyclable;
      if (!target || recycleRefund === null) return;
      const busyKey = `recycle:${target.packId}:${target.position}`;
      const name = cardName(card) ?? t.revealUnnamed;
      const left = card.count - 1;

      const ok = await confirm({
        title: format(t.recycleConfirmTitleNamed, { name }),
        variant: 'warning',
        confirmLabel: t.recycleConfirmYes,
        cancelLabel: t.recycleConfirmNo,
        body: (
          <div className="space-y-3 text-sm text-neutral-200">
            <dl className="space-y-1.5 rounded-xl border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-neutral-400">{t.recycleConfirmGain}</dt>
                <dd>
                  <TcgAmount
                    value={recycleRefund}
                    signed
                    size={15}
                    className="font-semibold text-[var(--color-green)]"
                  />
                </dd>
              </div>
              <div className="flex items-center justify-between gap-4">
                <dt className="text-neutral-400">{t.recycleConfirmBalance}</dt>
                <dd className="flex items-center gap-2">
                  <TcgAmount value={balance} size={15} />
                  <span aria-hidden className="text-neutral-500">
                    →
                  </span>
                  <TcgAmount
                    value={balance + recycleRefund}
                    size={15}
                    className="font-semibold text-white"
                  />
                </dd>
              </div>
            </dl>
            <p>
              {left > 1
                ? format(t.recycleConfirmKeep_other, { count: left })
                : t.recycleConfirmKeep_one}
            </p>
            <p className="text-neutral-400">{t.recycleConfirmWhich}</p>
          </div>
        ),
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
          };
          addToast(
            body.code === 'not_a_duplicate'
              ? t.errNotADuplicate
              : body.code === 'already_recycled'
                ? t.errAlreadyRecycled
                : t.errGeneric,
            'error'
          );
          await load(cards.length);
          return;
        }
        const body = (await res.json().catch(() => ({}))) as {
          refund?: number;
        };
        addToast(
          format(t.recycleSuccess, {
            refund: body.refund ?? recycleRefund,
          }),
          'success'
        );
        await load(cards.length);
      } catch {
        addToast(t.errGeneric, 'error');
      } finally {
        setBusy(null);
      }
    },
    [
      adminFetch,
      addToast,
      balance,
      cards.length,
      confirm,
      load,
      recycleRefund,
      t,
    ]
  );

  const goToPacks = useCallback(() => {
    packsHeadingRef.current?.focus();
  }, []);

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

  const revealCards: TcgRevealCard[] =
    revealed?.cards.map((c) => ({
      key: String(c.position),
      subject: cardSubject(c),
      rarity: c.rarity,
      isFoil: c.isFoil,
      isNew: typeof c.isNew === 'boolean' ? c.isNew : null,
    })) ?? [];
  const knownNew = revealCards.filter((c) => c.isNew !== null);
  const freshCount = knownNew.filter((c) => c.isNew === true).length;
  const revealSummary =
    knownNew.length === 0
      ? null
      : freshCount === 0
        ? t.revealSummary_none
        : freshCount === 1
          ? format(t.revealSummary_one, { count: revealCards.length })
          : format(t.revealSummary_other, {
              fresh: freshCount,
              count: revealCards.length,
            });

  const isLoading = loadState === 'loading';

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      <main
        className="container mx-auto px-4 pb-16 pt-24"
        aria-busy={isLoading}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            {t.collectionTitle}
          </h1>
          {/* Discret, mais AU TITRE : « d'où viennent les paquets » et « que
              devient ma photo » se demandent en regardant sa collection, pas
              depuis le tableau de bord. */}
          <div className="flex flex-wrap items-baseline gap-4">
            <Link
              href="/player/tcg-guide"
              className="text-sm font-medium text-purple-300 underline-offset-4 transition hover:text-purple-200 hover:underline"
            >
              {t.guideLink}
            </Link>
            {/* Point d'entrée discret des échanges : on y vient avec ses
                doublons sous les yeux. */}
            <Link
              href="/player/tcg/echanges"
              className="text-sm font-medium text-purple-300 underline-offset-4 transition hover:text-purple-200 hover:underline"
            >
              {tTrade.entryLink}
            </Link>
          </div>
        </div>

        {/* Région d'annonce, montée VIDE en permanence (cf. `announce`). */}
        <p role="status" aria-live="polite" className="sr-only">
          {isLoading ? t.loadingCollection : announcement}
        </p>

        {loadState === 'error' ? (
          <section
            role="alert"
            className="mt-8 rounded-2xl border border-red-400/30 bg-red-500/[0.07] p-6"
          >
            <h2 className="text-lg font-semibold">{t.loadErrorTitle}</h2>
            <p className="mt-1 max-w-prose text-sm text-gray-300">
              {t.loadErrorBody}
            </p>
            <button
              type="button"
              onClick={retryLoad}
              className="mt-4 min-h-11 rounded-xl bg-white/10 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {t.retry}
            </button>
          </section>
        ) : (
          /* Paquets et solde */
          <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div>
                <h2
                  ref={packsHeadingRef}
                  tabIndex={-1}
                  className="scroll-mt-24 rounded text-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
                >
                  {t.packsTitle}
                </h2>
                {isLoading ? (
                  <Skeleton className="mt-2 h-4 w-40" />
                ) : (
                  <p className="mt-1 text-sm text-gray-400">
                    {unopenedCount === 0
                      ? t.packsNone
                      : format(
                          unopenedCount > 1
                            ? t.packsUnopened_other
                            : t.packsUnopened_one,
                          { count: unopenedCount }
                        )}
                  </p>
                )}
              </div>
              {/* Aligné à gauche sur mobile : à 400 px, un bloc calé à droite
                  sous un titre calé à gauche se lit en zigzag. */}
              <div className="sm:text-right">
                {/* Le solde porte la pièce : c'est le montant qu'on vient
                    chercher sur cette page. Le libellé remplace le mot
                    « pièces », que l'icône dit déjà. */}
                <p className="flex items-center gap-2 text-sm text-gray-300 sm:justify-end">
                  <span className="text-xs uppercase tracking-wide text-gray-500">
                    {t.balanceLabel}
                  </span>
                  {isLoading ? (
                    <Skeleton className="h-5 w-14" />
                  ) : (
                    <TcgAmount
                      value={balance}
                      size={18}
                      className="text-base font-semibold text-white"
                    />
                  )}
                </p>
                {/* Comment on en gagne. À zéro, un prix sans chemin pour
                    l'atteindre n'apprend rien. */}
                {earn !== null && (
                  <p className="mt-1 max-w-md text-xs text-gray-400 sm:ml-auto">
                    {/* Le drop n'est mentionné QUE s'il est branché : l'API ne
                        rend `twitchDrop` que si une chaîne est connectée avec
                        une récompense désignée. Deux formulations plutôt qu'une
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
                    {/* La promesse et le moyen de l'honorer, côte à côte : le
                        barème annonce des pièces « sur le stream », le lien
                        mène au geste qui les rend possibles. */}
                    {showTwitchEarnLink && (
                      <>
                        {' '}
                        <a
                          href={`#${TWITCH_ANCHOR}`}
                          className="font-semibold text-purple-300 underline underline-offset-2 hover:text-purple-200"
                        >
                          {t.twitchEarnLink}
                        </a>
                      </>
                    )}
                  </p>
                )}
                {/* Prix inconnu = bouton absent. Afficher « Acheter (— pièces) »
                    proposerait une dépense dont on ignore le montant. */}
                {boosterPrice !== null && (
                  <button
                    type="button"
                    onClick={() => void buyBooster()}
                    disabled={busy !== null}
                    aria-busy={busy === 'buy'}
                    className="mt-3 min-h-11 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-[var(--color-yellow)]/60 hover:text-[var(--color-yellow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-50"
                  >
                    {busy === 'buy' ? (
                      t.buying
                    ) : (
                      // Le prix en pièce plutôt qu'en toutes lettres : c'est
                      // une dépense, et la pastille la rend comparable au solde
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

            {packs.length > 0 && (
              <ul className="mt-5 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap">
                {packs.map((pack) => (
                  <li key={pack.id}>
                    <button
                      type="button"
                      onClick={() => void openPack(pack.id)}
                      disabled={busy !== null}
                      aria-busy={busy === pack.id}
                      className="flex min-h-11 w-full flex-col items-start rounded-xl border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/10 px-4 py-2.5 text-left text-sm font-semibold text-white transition hover:bg-[var(--color-violet)]/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-50 sm:w-auto sm:flex-row sm:items-center sm:gap-2"
                    >
                      {busy === pack.id ? t.packOpening : t.packOpen}
                      <span className="text-xs font-normal text-gray-300">
                        {/* Un `switch` et non un ternaire binaire : avec deux
                            issues seulement, un paquet `welcome` se serait
                            affiché « Gagné en match ». */}
                        {packOriginLabel(pack.source, t)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {packsCursor && (
              <button
                type="button"
                onClick={() => void loadMorePacks()}
                disabled={busy !== null}
                className="mt-3 min-h-11 rounded-full px-4 py-2 text-sm font-medium text-purple-300 underline-offset-4 transition hover:text-purple-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-50"
              >
                {busy === 'more-packs'
                  ? t.collectionLoadingMore
                  : t.packsLoadMore}
              </button>
            )}
          </section>
        )}

        {/* Le tirage qu'on vient d'ouvrir, entre les paquets et la collection :
            on le voit à l'endroit où le regard va après avoir cliqué. Il reste
            affiché jusqu'à ce qu'on le ferme — une révélation qui disparaît
            toute seule est une révélation ratée. */}
        {revealed !== null && (
          <TcgPackReveal
            key={revealed.id}
            cards={revealCards}
            onDismiss={dismissReveal}
            labels={{
              title: t.revealTitle,
              subtitle: t.revealSubtitle,
              summary: revealSummary,
              duplicateHint:
                recycleRefund !== null
                  ? format(t.revealDuplicateHint, { refund: recycleRefund })
                  : null,
              dismiss: t.revealDismiss,
              newCard: t.revealNewCard,
              duplicate: t.revealDuplicate,
              card: labels,
            }}
          />
        )}

        {/* Mon compte Twitch — JUSTE SOUS LE BARÈME. La page annonce « et N
            pièces par carte récupérée sur le stream » : la promesse et le moyen
            de l'honorer se lisent l'un sous l'autre.

            CONVERSION. Au 2026-09-14, 0 joueuse sur 58 avait rattaché son
            compte : la carte expliquait POURQUOI le lien est demandé, jamais ce
            qu'il rapporte. Quand le drop est branché, elle prend donc un titre
            et une phrase chiffrés (`pitch`) et un bouton en évidence ; une fois
            le compte lié, elle redevient la confirmation habituelle.

            MONTÉE SANS CONDITION. Elle se masque d'elle-même quand la
            fonctionnalité est dormante. */}
        <div className="mt-8">
          <TwitchLinkCard
            id={TWITCH_ANCHOR}
            pitch={twitchPitch}
            onStatus={setTwitchStatus}
          />
        </div>

        {/* ── Historique du porte-monnaie ──────────────────────────────────
            « D'où viennent mes pièces ? ». Replié par défaut, chargé au clic :
            le solde suffit à la plupart des visites. */}
        <section className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <TcgCoin size={18} />
              {t.walletTitle}
            </h2>
            <button
              type="button"
              onClick={() => void toggleWallet()}
              aria-expanded={walletOpen}
              aria-controls="tcg-wallet-history"
              className="min-h-11 rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-gray-300 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {walletOpen ? t.walletHide : t.walletShow}
            </button>
          </div>

          <div id="tcg-wallet-history" hidden={!walletOpen}>
            {walletState === 'loading' && (
              <p role="status" className="mt-4 text-sm text-gray-400">
                {t.walletLoading}
              </p>
            )}
            {walletState === 'error' && (
              <p role="alert" className="mt-4 text-sm text-gray-300">
                {t.walletError}
              </p>
            )}
            {walletState === 'ready' && wallet !== null && (
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
                        <span className="min-w-0 flex-1 text-gray-300">
                          <span className="block truncate">
                            {walletLabel(e.sourceKind)}
                          </span>
                          {/* Le motif d'une correction : sans lui, « Ajustement
                              par l'équipe » ne dit pas CE qui a été corrigé. */}
                          {e.note ? (
                            <span className="mt-0.5 block break-words text-xs text-gray-500">
                              {e.note}
                            </span>
                          ) : null}
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
                    {format(t.walletTruncated, {
                      count: wallet.entries.length,
                    })}
                  </p>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── Progression ──────────────────────────────────────────────────
            « 12 cartes » ne dit rien sans « sur combien ». Les compteurs sont
            ceux de la collection ENTIÈRE (l'API les rend sur chaque page), pas
            ceux des cartes affichées. */}
        {loadState === 'ready' && (
          <TcgCollectionProgress
            className="mt-8"
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
                totals.total > 1
                  ? t.progressCopies_other
                  : t.progressCopies_one,
              progressAria: t.progressAria,
              byRarityTitle: t.progressByRarity,
              rarityCount: t.progressRarityCount,
              complete: t.progressComplete,
              rarity: labels.rarity,
            }}
          />
        )}

        {/* Séries : composant autonome. `reloadToken` = le nombre d'exemplaires,
            qui bouge à chaque ouverture et chaque recyclage. */}
        {loadState === 'ready' && (
          <TcgSetsPanel
            className="mt-8"
            reloadToken={totals.total}
            celebrate={setsCompleted}
          />
        )}

        {/* Pronostics : composant autonome, gratuit, crédité au résultat. */}
        {loadState === 'ready' && <PredictionsPanel className="mt-8" />}

        {/* Fan art : proposer une carte, et suivre ses propositions. */}
        {loadState === 'ready' && <FanartSubmitPanel className="mt-8" />}

        {/* Collection */}
        <section className="mt-8" aria-labelledby="tcg-collection-title">
          <h2 id="tcg-collection-title" className="sr-only">
            {t.collectionTitle}
          </h2>
          {isLoading ? (
            <ul
              aria-hidden
              className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
            >
              {Array.from({ length: 10 }, (_, i) => (
                <li key={i}>
                  <Skeleton
                    className="aspect-[3/4] w-full"
                    rounded="rounded-xl"
                  />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                </li>
              ))}
            </ul>
          ) : loadState === 'error' ? null : cards.length === 0 ? (
            // VIDE, MAIS PAS SANS SUITE. Un paquet fermé attend peut-être : le
            // dire, et y mener, vaut mieux que « gagne un match » à quelqu'un
            // qui a déjà de quoi commencer.
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-gray-300">
              <p>
                {unopenedCount === 0
                  ? t.collectionEmpty
                  : unopenedCount === 1
                    ? t.collectionEmptyWithPacks_one
                    : format(t.collectionEmptyWithPacks_other, {
                        count: unopenedCount,
                      })}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                {unopenedCount > 0 && (
                  <button
                    type="button"
                    onClick={goToPacks}
                    className="min-h-11 rounded-xl bg-[var(--color-violet)]/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--color-violet)]/45 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
                  >
                    {t.collectionEmptyGoToPacks}
                  </button>
                )}
                <Link
                  href="/player/tcg-guide"
                  className="inline-flex min-h-11 items-center rounded-xl border border-white/15 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-white/10"
                >
                  {t.collectionEmptyGuide}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-gray-400">
                {cards.length < totals.distinct
                  ? format(t.collectionShown, {
                      shown: cards.length,
                      distinct: totals.distinct,
                    })
                  : format(t.collectionCount, {
                      distinct: totals.distinct,
                      total: totals.total,
                    })}
              </p>
              <ul
                ref={collectionListRef}
                className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5"
              >
                {cards.map((card) => {
                  const target = card.recyclable ?? null;
                  const recycleKey = target
                    ? `recycle:${target.packId}:${target.position}`
                    : null;
                  return (
                    // `subjectKey` plutôt qu'une clé recopiée : une seule règle
                    // d'identité pour la collection et ses pages successives.
                    <li key={subjectKey(card)}>
                      <TcgCard
                        subject={cardSubject(card)}
                        rarity={card.rarity}
                        isFoil={card.isFoil}
                        count={card.count}
                        labels={labels}
                      />
                      {/* Le recyclage n'apparaît QUE sur un vrai doublon :
                          l'API ne rend `recyclable` qu'à partir de deux
                          exemplaires, et la route refuserait le dernier. Le
                          montant est celui rendu par l'API. Le nom accessible
                          dit DE QUELLE carte il s'agit : dans une grille de
                          quarante, « Recycler (+30) » ne désigne rien. */}
                      {target && recycleRefund !== null && (
                        <button
                          type="button"
                          onClick={() => void recycleCard(card)}
                          disabled={busy !== null}
                          aria-busy={busy === recycleKey}
                          aria-label={format(t.recycleAria, {
                            name: cardName(card) ?? t.revealUnnamed,
                            refund: recycleRefund,
                          })}
                          className="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-white/10 px-2 py-2 text-xs text-gray-300 transition hover:border-[var(--color-green)]/50 hover:text-[var(--color-green)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-50"
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
              {collectionCursor && (
                <div className="mt-6 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadMoreCards()}
                    disabled={busy !== null}
                    aria-busy={busy === 'more-cards'}
                    className="min-h-11 rounded-full border border-white/15 bg-white/5 px-6 py-2 text-sm font-semibold text-white transition hover:border-white/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)] disabled:opacity-50"
                  >
                    {busy === 'more-cards'
                      ? t.collectionLoadingMore
                      : t.collectionLoadMore}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Vitrine (opt-in) : composant autonome, sous la collection d'où l'on
            choisit ses cartes. */}
        {loadState === 'ready' && (
          <TcgShowcaseEditor className="mt-8" reloadToken={totals.total} />
        )}

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
