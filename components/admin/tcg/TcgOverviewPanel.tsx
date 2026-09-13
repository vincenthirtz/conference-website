// components/admin/tcg/TcgOverviewPanel.tsx
//
// Vue d'ensemble de l'économie du TCG pour le staff.
//
// CE QUE L'ADMIN VOYAIT JUSQU'ICI, c'est la file de relecture des photos
// (`components/admin/moderation/TcgPhotosPanel.tsx`) — un geste de modération,
// pas un état des lieux. Ce panneau répond aux autres questions : combien de
// paquets dorment sans être ouverts, combien de pièces circulent, quelle part
// des cartes est déjà revendue, et qui figure le plus souvent sur les cartes
// possédées.
//
// LES LIBELLÉS ARRIVENT PAR PROP, comme pour `components/tcg/TcgCard.tsx`. Le
// composant ne connaît aucune langue : la page hôte lui passe le bloc traduit
// qu'elle a chargé via `useAdminT`. Deux bénéfices : le garde-fou
// `noHardcodedFrench` n'a rien à trouver ici, et le namespace de traduction
// reste la propriété de la page — c'est elle qui décide dans quel hub ce
// panneau vit.
//
// `null` N'EST PAS `0`, ET C'EST LE CONTRAT DE L'ENDPOINT. `pages/api/admin/tcg/
// overview.ts` dégrade en `null` la SEULE clé dont la lecture a échoué et rend
// quand même un 200 : `0` veut dire « mesuré, et vide », `null` veut dire « pas
// mesurable maintenant ». L'affichage tient la distinction jusqu'au bout — « — »
// pour `null`, « 0 » pour zéro. Un tableau de bord qui lit une panne de lecture
// comme un effondrement de l'économie produit exactement le faux signal qu'il
// est censé détecter.
//
// LES TOTAUX BORNÉS SE DISENT. PostgREST ne sachant pas faire `SUM()` sans RPC,
// l'endpoint calcule ses sommes en lisant des lignes plafonnées et lève
// `truncated` quand le plafond est atteint. L'avertissement s'affiche à côté du
// chiffre concerné : un total tronqué présenté comme exact est pire que pas de
// total.
//
// AUCUNE URL FABRIQUÉE. Une joueuse s'adresse par son identifiant, une équipe
// par son SLUG — jamais par son uuid, qui ne route nulle part. C'est pour cela
// que l'endpoint joint le slug des équipes ; une ligne dont la réponse ne porte
// pas la clé nécessaire reste non cliquable, plutôt que de mener au 404 que
// `TcgCard` a déjà payé sur chaque carte d'équipe.
//
// DEUX TOTAUX DE CARTES, ET ILS NE DISENT PAS LA MÊME CHOSE. `total` compte ce
// qui est ENCORE POSSÉDÉ, `drawn` tout ce qui a jamais été tiré, recyclé
// compris. L'écart entre les deux EST l'indicateur de dérive de la boucle
// économique (gagner → ouvrir → recycler → racheter) : les afficher côte à côte
// est le but de ce panneau, les confondre le viderait de son sens.
//
// FORME LUE de `GET /api/admin/tcg/overview` — chaque champ est revalidé ici,
// et toute absence est gérée :
//   packs:  { granted, opened, pending, bySource: { victory, purchase } }
//   coins:  { inCirculation, earned, spent, wallets, boosterPrice, truncated }
//   cards:  { total, foil, byRarity, recycled, drawn, truncated }
//   photos: { pending, approved, rejected, optedIn, revoked }
//   topSubjects: [{ kind, userId|teamId, slug?, name, imageUrl, count, foilCount }]
//   generatedAt

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import type { JSX } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { format } from '@/lib/i18n/useT';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import StatCard from '@/components/admin/dashboard/StatCard';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import { RARITY_ORDER } from '@/utils/tcg/rarity';
import type { TcgRarity } from '@/utils/tcg/rarity';

/* ---------------------------------------------------------------------------
 * Modèle normalisé
 * ------------------------------------------------------------------------- */

/** `null` = non mesurable pour l'instant (cf. l'en-tête). */
type Count = number | null;

export type TcgOverviewPacks = {
  granted: Count;
  opened: Count;
  pending: Count;
  fromVictory: Count;
  fromPurchase: Count;
};

export type TcgOverviewCoins = {
  inCirculation: Count;
  earned: Count;
  spent: Count;
  wallets: Count;
  /** Constante de barème rappelée par l'endpoint, pas une mesure. */
  boosterPrice: Count;
  truncated: boolean;
};

export type TcgOverviewCards = {
  /** Cartes ENCORE possédées. */
  total: Count;
  foil: Count;
  byRarity: Record<TcgRarity, Count>;
  recycled: Count;
  /** Toutes les cartes jamais tirées, recyclées comprises. */
  drawn: Count;
  truncated: boolean;
};

export type TcgOverviewPhotos = {
  pending: Count;
  approved: Count;
  rejected: Count;
  optedIn: Count;
  revoked: Count;
};

export type TcgOverviewSubject = {
  kind: 'player' | 'team';
  /** Identifiant du sujet, `null` si la réponse n'en portait pas. */
  id: string | null;
  name: string | null;
  imageUrl: string | null;
  count: Count;
  foilCount: Count;
  /** Fiche publique, `null` quand on ne peut pas la construire honnêtement. */
  href: string | null;
};

export type TcgOverview = {
  packs: TcgOverviewPacks;
  coins: TcgOverviewCoins;
  cards: TcgOverviewCards;
  photos: TcgOverviewPhotos;
  topSubjects: TcgOverviewSubject[];
  generatedAt: string | null;
};

/* ---------------------------------------------------------------------------
 * Normalisation défensive (pure, exportée pour les tests)
 * ------------------------------------------------------------------------- */

type RawRecord = Record<string, unknown>;

function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as RawRecord)
    : {};
}

/**
 * Un compteur, ou `null`.
 *
 * Refuse tout ce qui n'est pas un nombre positif exploitable : absent, `null`,
 * chaîne, NaN, négatif. Un compteur négatif n'existe pas dans ce domaine — on
 * compte des paquets, des cartes, des pièces détenues. En afficher un
 * reviendrait à présenter une donnée corrompue avec l'aplomb d'une mesure.
 */
function asCount(value: unknown): Count {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSubject(raw: unknown): TcgOverviewSubject | null {
  const rec = asRecord(raw);
  const kind =
    rec.kind === 'player' ? 'player' : rec.kind === 'team' ? 'team' : null;
  // Sans nature, on ne sait ni comment étiqueter la ligne ni où elle pointe :
  // on l'écarte plutôt que d'inventer l'une ou l'autre.
  if (!kind) return null;

  // L'endpoint nomme la clé selon la nature du sujet ; `id` est accepté en
  // repli pour qu'un sujet reste identifiable même si la forme évolue.
  const userId =
    asText(rec.userId) ?? (kind === 'player' ? asText(rec.id) : null);
  const teamId =
    asText(rec.teamId) ?? (kind === 'team' ? asText(rec.id) : null);
  const slug = asText(rec.slug);

  return {
    kind,
    id: kind === 'player' ? userId : teamId,
    name: asText(rec.name),
    imageUrl: asText(rec.imageUrl),
    count: asCount(rec.count),
    foilCount: asCount(rec.foilCount),
    href:
      kind === 'player'
        ? userId
          ? `/player/${userId}`
          : null
        : // Une équipe s'adresse par son slug ; son uuid ne mène nulle part.
          slug
          ? `/team/${slug}`
          : null,
  };
}

/**
 * Traduit la réponse brute en modèle affichable.
 *
 * Écrite pour ne JAMAIS lever : une réponse vide, tronquée ou d'une forme
 * inattendue donne un panneau vide, pas un écran blanc. C'est une vue de
 * lecture — elle ne doit pas pouvoir casser la page qui l'héberge.
 */
export function normalizeTcgOverview(raw: unknown): TcgOverview {
  const root = asRecord(raw);
  const packsRaw = asRecord(root.packs);
  const bySource = asRecord(packsRaw.bySource);
  const coinsRaw = asRecord(root.coins);
  const cardsRaw = asRecord(root.cards);
  const byRarityRaw = asRecord(cardsRaw.byRarity);
  const photosRaw = asRecord(root.photos);

  const byRarity = RARITY_ORDER.reduce(
    (acc, rarity) => {
      acc[rarity] = asCount(byRarityRaw[rarity]);
      return acc;
    },
    {} as Record<TcgRarity, Count>
  );

  const topSubjects = (Array.isArray(root.topSubjects) ? root.topSubjects : [])
    .map(normalizeSubject)
    .filter((s): s is TcgOverviewSubject => s !== null)
    // L'endpoint trie déjà ; on le refait pour que l'affichage tienne la
    // promesse de son titre quoi qu'il renvoie. Les comptes absents ferment la
    // marche plutôt que de passer pour les plus faibles.
    .sort((a, b) => (b.count ?? -1) - (a.count ?? -1));

  return {
    packs: {
      granted: asCount(packsRaw.granted),
      opened: asCount(packsRaw.opened),
      pending: asCount(packsRaw.pending),
      fromVictory: asCount(bySource.victory),
      fromPurchase: asCount(bySource.purchase),
    },
    coins: {
      inCirculation: asCount(coinsRaw.inCirculation),
      earned: asCount(coinsRaw.earned),
      spent: asCount(coinsRaw.spent),
      wallets: asCount(coinsRaw.wallets),
      boosterPrice: asCount(coinsRaw.boosterPrice),
      truncated: coinsRaw.truncated === true,
    },
    cards: {
      total: asCount(cardsRaw.total),
      foil: asCount(cardsRaw.foil),
      byRarity,
      recycled: asCount(cardsRaw.recycled),
      drawn: asCount(cardsRaw.drawn),
      truncated: cardsRaw.truncated === true,
    },
    photos: {
      pending: asCount(photosRaw.pending),
      approved: asCount(photosRaw.approved),
      rejected: asCount(photosRaw.rejected),
      optedIn: asCount(photosRaw.optedIn),
      revoked: asCount(photosRaw.revoked),
    },
    topSubjects,
    generatedAt: asText(root.generatedAt),
  };
}

/**
 * Le tableau de bord n'a-t-il rien à montrer ?
 *
 * « Rien » = aucun compteur renseigné à une valeur non nulle ET aucun sujet.
 * `boosterPrice` est EXCLU du test : c'est une constante de barème, présente
 * même sur une économie qui n'a jamais tourné — la compter empêcherait à jamais
 * l'état vide de s'afficher. On distingue enfin ce cas d'une erreur : une
 * économie qui n'a pas démarré est un état normal, qui mérite un `EmptyState`
 * et non une alerte.
 */
export function isTcgOverviewEmpty(data: TcgOverview): boolean {
  const counters: Count[] = [
    data.packs.granted,
    data.packs.opened,
    data.packs.pending,
    data.packs.fromVictory,
    data.packs.fromPurchase,
    data.coins.inCirculation,
    data.coins.earned,
    data.coins.spent,
    data.coins.wallets,
    data.cards.total,
    data.cards.foil,
    data.cards.recycled,
    data.cards.drawn,
    ...RARITY_ORDER.map((r) => data.cards.byRarity[r]),
    data.photos.pending,
    data.photos.approved,
    data.photos.rejected,
    data.photos.optedIn,
    data.photos.revoked,
  ];
  return (
    data.topSubjects.length === 0 &&
    counters.every((c) => c === null || c === 0)
  );
}

/* ---------------------------------------------------------------------------
 * Libellés
 * ------------------------------------------------------------------------- */

export type TcgOverviewLabels = {
  heading: string;
  subtitle: string;
  /** Interpole `{time}`. Fraîcheur du relevé (la réponse est cachée 30 s). */
  generatedAt: string;
  loadError: string;
  retry: string;
  emptyTitle: string;
  emptyDescription: string;
  /** Affiché sous un total calculé sur une lecture plafonnée. */
  truncatedNotice: string;

  packsTitle: string;
  packsGranted: string;
  packsOpened: string;
  /** Interpole `{percent}`. */
  packsOpenedHint: string;
  packsPending: string;
  packsFromVictory: string;
  packsFromPurchase: string;

  coinsTitle: string;
  coinsInCirculation: string;
  coinsInCirculationHint: string;
  coinsWallets: string;
  coinsEarned: string;
  coinsSpent: string;
  /** Suivi du montant : « Prix d'un booster : 300 ». */
  coinsBoosterPrice: string;

  cardsTitle: string;
  cardsTotal: string;
  cardsFoil: string;
  /** Interpole `{percent}`. */
  cardsFoilHint: string;
  cardsRecycled: string;
  /** Interpole `{percent}`. */
  cardsRecycledHint: string;
  cardsDrawn: string;
  rarity: Record<TcgRarity, string>;

  photosTitle: string;
  photosPending: string;
  photosApproved: string;
  photosRejected: string;
  photosOptedIn: string;
  photosRevoked: string;
  photosReviewCta: string;

  topSubjectsTitle: string;
  topSubjectsEmpty: string;
  /** Interpole `{count}`. */
  topSubjectsCopies: string;
  /** Interpole `{count}`. */
  topSubjectsFoil: string;
  kindPlayer: string;
  kindTeam: string;
  unknownSubject: string;
};

/* ---------------------------------------------------------------------------
 * Rendu
 * ------------------------------------------------------------------------- */

/**
 * Couleurs de rareté, alignées sur `components/tcg/TcgCard.tsx`
 * (common↔bronze, rare↔silver, epic↔gold, legendary↔platinum).
 *
 * Recopiées et non importées parce que la table de `TcgCard` est privée à ce
 * module et exprime des bordures de carte, pas des barres. Le MAPPING, lui, ne
 * doit pas diverger : sinon la même légendaire serait cyan sur la carte et
 * dorée ici.
 */
const RARITY_COLOR: Record<TcgRarity, string> = {
  common: 'bg-amber-700',
  rare: 'bg-zinc-400',
  epic: 'bg-yellow-500',
  legendary: 'bg-cyan-400',
};

/** File de relecture des photos : l'onglet réel du hub de modération. */
const PHOTOS_QUEUE_HREF = '/admin/moderation?tab=tcg-photos';

/**
 * Un compteur, prêt à afficher.
 *
 * `toLocaleString()` sans locale explicite suit celle du navigateur : sans
 * risque d'écart d'hydratation ici, puisque les chiffres n'existent qu'après le
 * chargement client (le premier rendu montre le spinner).
 */
function num(value: Count): string {
  return value === null ? '—' : value.toLocaleString();
}

/** Pourcentage entier, ou `null` si l'un des deux termes manque. */
function percent(part: Count, total: Count): number | null {
  if (part === null || total === null || total <= 0) return null;
  return Math.round((part / total) * 100);
}

/** Heure du relevé, ou `null` si l'horodatage est absent ou illisible. */
function clockTime(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

type Props = {
  labels: TcgOverviewLabels;
};

export default function TcgOverviewPanel({ labels }: Props): JSX.Element {
  const { adminFetchJson } = useAdminFetch();

  const [data, setData] = useState<TcgOverview | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const raw = await adminFetchJson<unknown>('/api/admin/tcg/overview');
      setData(normalizeTcgOverview(raw));
    } catch {
      // On garde le relevé précédent si on en avait un : un rafraîchissement
      // raté ne doit pas vider un tableau de bord déjà lisible.
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const rarityTotal = RARITY_ORDER.reduce(
    (sum, rarity) => sum + (data?.cards.byRarity[rarity] ?? 0),
    0
  );
  const openedPercent = percent(
    data?.packs.opened ?? null,
    data?.packs.granted ?? null
  );
  // Les brillantes se comptent parmi les cartes ENCORE possédées, comme
  // `cards.total` : le seul dénominateur qui ne mélange pas les revendues.
  const foilPercent = percent(
    data?.cards.foil ?? null,
    data?.cards.total ?? null
  );
  // Le recyclage se rapporte en revanche à TOUT ce qui a été tiré : c'est la
  // part de la production repartie en pièces.
  const recycledPercent = percent(
    data?.cards.recycled ?? null,
    data?.cards.drawn ?? null
  );
  const measuredAt = clockTime(data?.generatedAt ?? null);

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{labels.heading}</h2>
      <p className="mt-1 text-sm text-gray-400">{labels.subtitle}</p>
      {measuredAt && (
        <p className="mt-1 text-xs text-gray-500">
          {format(labels.generatedAt, { time: measuredAt })}
        </p>
      )}

      {error && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AlertBanner message={labels.loadError} variant="error" />
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-full border border-white/15 px-4 py-1.5 text-sm text-gray-200 transition hover:bg-white/5"
          >
            {labels.retry}
          </button>
        </div>
      )}

      {loading && data === null ? (
        <LoadingSpinner className="mt-10" />
      ) : data === null ? null : isTcgOverviewEmpty(data) ? (
        <EmptyState
          className="mt-6"
          title={labels.emptyTitle}
          description={labels.emptyDescription}
        />
      ) : (
        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          {/* Paquets : distribués, ouverts, encore scellés. */}
          <WidgetCard title={labels.packsTitle}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                label={labels.packsGranted}
                value={num(data.packs.granted)}
                accent="purple"
              />
              <StatCard
                label={labels.packsOpened}
                value={num(data.packs.opened)}
                accent="emerald"
                hint={
                  openedPercent === null
                    ? undefined
                    : format(labels.packsOpenedHint, { percent: openedPercent })
                }
              />
              <StatCard
                label={labels.packsPending}
                value={num(data.packs.pending)}
                accent="amber"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatCard
                label={labels.packsFromVictory}
                value={num(data.packs.fromVictory)}
                accent="gray"
              />
              <StatCard
                label={labels.packsFromPurchase}
                value={num(data.packs.fromPurchase)}
                accent="gray"
              />
            </div>
          </WidgetCard>

          {/* Monnaie. Le rappel « gagnée, jamais achetée » n'est pas décoratif :
              c'est la contrainte réglementaire qui tient tout le barème. */}
          <WidgetCard title={labels.coinsTitle}>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={labels.coinsInCirculation}
                value={num(data.coins.inCirculation)}
                accent="amber"
                hint={labels.coinsInCirculationHint}
              />
              <StatCard
                label={labels.coinsWallets}
                value={num(data.coins.wallets)}
                accent="gray"
              />
              <StatCard
                label={labels.coinsEarned}
                value={num(data.coins.earned)}
                accent="emerald"
              />
              <StatCard
                label={labels.coinsSpent}
                value={num(data.coins.spent)}
                accent="pink"
              />
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
              {labels.coinsBoosterPrice} {num(data.coins.boosterPrice)}
            </p>
            {data.coins.truncated && (
              <p className="mt-1 text-[11px] text-amber-300">
                {labels.truncatedNotice}
              </p>
            )}
          </WidgetCard>

          {/* Cartes possédées, revendues, et répartition par rareté. */}
          <WidgetCard title={labels.cardsTitle}>
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label={labels.cardsTotal}
                value={num(data.cards.total)}
                accent="blue"
              />
              <StatCard
                label={labels.cardsFoil}
                value={num(data.cards.foil)}
                accent="purple"
                hint={
                  foilPercent === null
                    ? undefined
                    : format(labels.cardsFoilHint, { percent: foilPercent })
                }
              />
              <StatCard
                label={labels.cardsRecycled}
                value={num(data.cards.recycled)}
                accent="pink"
                hint={
                  recycledPercent === null
                    ? undefined
                    : format(labels.cardsRecycledHint, {
                        percent: recycledPercent,
                      })
                }
              />
              <StatCard
                label={labels.cardsDrawn}
                value={num(data.cards.drawn)}
                accent="gray"
              />
            </div>

            {rarityTotal > 0 && (
              <>
                <div
                  className="mt-4 flex h-2 overflow-hidden rounded-full bg-white/5"
                  aria-hidden="true"
                >
                  {RARITY_ORDER.map((rarity) => {
                    const count = data.cards.byRarity[rarity] ?? 0;
                    if (count === 0) return null;
                    return (
                      <span
                        key={rarity}
                        className={RARITY_COLOR[rarity]}
                        style={{ width: `${(count / rarityTotal) * 100}%` }}
                      />
                    );
                  })}
                </div>

                <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {RARITY_ORDER.map((rarity) => (
                    <li
                      key={rarity}
                      className="flex items-center justify-between gap-2 text-xs"
                    >
                      <span className="flex items-center gap-2 text-gray-400">
                        <span
                          aria-hidden="true"
                          className={`h-2 w-2 shrink-0 rounded-full ${RARITY_COLOR[rarity]}`}
                        />
                        {labels.rarity[rarity]}
                      </span>
                      <span className="font-medium text-gray-200">
                        {num(data.cards.byRarity[rarity])}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {data.cards.truncated && (
              <p className="mt-3 text-[11px] text-amber-300">
                {labels.truncatedNotice}
              </p>
            )}
          </WidgetCard>

          {/* Photos et consentement : le seul bloc ACTIONNABLE, d'où le lien
              direct vers la file de relecture plutôt qu'un simple chiffre. */}
          <WidgetCard
            title={labels.photosTitle}
            ctaHref={PHOTOS_QUEUE_HREF}
            ctaLabel={labels.photosReviewCta}
            badge={data.photos.pending ? num(data.photos.pending) : undefined}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                label={labels.photosPending}
                value={num(data.photos.pending)}
                accent={data.photos.pending ? 'amber' : 'gray'}
              />
              <StatCard
                label={labels.photosApproved}
                value={num(data.photos.approved)}
                accent="emerald"
              />
              <StatCard
                label={labels.photosRejected}
                value={num(data.photos.rejected)}
                accent="red"
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatCard
                label={labels.photosOptedIn}
                value={num(data.photos.optedIn)}
                accent="blue"
              />
              {/* Un accord RETIRÉ n'est pas un refus de relecture : la joueuse
                  a repris son consentement, ses cartes perdent leur photo. */}
              <StatCard
                label={labels.photosRevoked}
                value={num(data.photos.revoked)}
                accent="gray"
              />
            </div>
          </WidgetCard>

          {/* Sujets les plus distribués (exemplaires encore possédés). */}
          <WidgetCard title={labels.topSubjectsTitle} className="lg:col-span-2">
            {data.topSubjects.length === 0 ? (
              <p className="text-sm text-gray-400">{labels.topSubjectsEmpty}</p>
            ) : (
              <ol className="space-y-1.5">
                {data.topSubjects.map((subject, index) => {
                  const name = subject.name ?? labels.unknownSubject;
                  return (
                    <li
                      key={`${subject.kind}:${subject.id ?? index}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm odd:bg-white/[0.02]"
                    >
                      <span className="w-5 shrink-0 text-right text-xs text-gray-500">
                        {index + 1}
                      </span>

                      {subject.imageUrl ? (
                        <Image
                          src={subject.imageUrl}
                          alt=""
                          width={28}
                          height={28}
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                          unoptimized
                        />
                      ) : (
                        // Ni photo consentie ni logo : un rond neutre, jamais un
                        // portrait inventé (le projet n'utilise pas d'image IA).
                        <span
                          aria-hidden="true"
                          className="h-7 w-7 shrink-0 rounded-full bg-white/5"
                        />
                      )}

                      <span className="min-w-0 flex-1 truncate text-gray-200">
                        {subject.href ? (
                          <Link
                            href={subject.href}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="hover:underline"
                          >
                            {name}
                          </Link>
                        ) : (
                          name
                        )}
                      </span>

                      <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gray-400">
                        {subject.kind === 'team'
                          ? labels.kindTeam
                          : labels.kindPlayer}
                      </span>

                      {/* Un brillant est un exemplaire, pas une carte de plus :
                          la mention reste secondaire, à côté du total. */}
                      {subject.foilCount !== null && subject.foilCount > 0 && (
                        <span className="hidden shrink-0 text-[11px] text-cyan-200 sm:inline">
                          {format(labels.topSubjectsFoil, {
                            count: subject.foilCount,
                          })}
                        </span>
                      )}

                      <span className="w-28 shrink-0 text-right text-xs text-gray-400">
                        {subject.count === null
                          ? '—'
                          : format(labels.topSubjectsCopies, {
                              count: subject.count,
                            })}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </WidgetCard>
        </div>
      )}
    </div>
  );
}
