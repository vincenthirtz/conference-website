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
// LE MODÈLE ET SA NORMALISATION VIVENT AILLEURS : `utils/tcg/overviewModel.ts`.
// Ce sont des types et des fonctions pures, sans une ligne de JSX ; ils étaient
// déjà séparés par leur propre bandeau et déjà exportés « pour les tests », deux
// aveux qu'ils n'étaient pas à leur place. Le garde de taille des écrans admin
// (`tests/unit/adminFileSizeGuard.test.ts`) l'a rendu concret en refusant ce
// fichier à 809 lignes ; sa règle dit d'extraire un panneau plutôt que de geler,
// et c'est ce qui a été fait. Ne reste ici que l'AFFICHAGE.
//
// FORME LUE de `GET /api/admin/tcg/overview` — chaque champ est revalidé dans
// ce module, et toute absence est gérée :
//   packs:  { granted, opened, pending, bySource: { victory, purchase, welcome, drop, placement, streak } }
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
import {
  normalizeTcgOverview,
  isTcgOverviewEmpty,
} from '@/utils/tcg/overviewModel';
import type { Count, TcgOverview } from '@/utils/tcg/overviewModel';

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
  packsFromWelcome: string;
  packsFromDrop: string;
  packsFromPlacement: string;
  packsFromStreak: string;

  coinsTitle: string;
  coinsInCirculation: string;
  coinsInCirculationHint: string;
  coinsWallets: string;
  coinsEarned: string;
  coinsSpent: string;
  /** Suivi du montant : « Prix d'un booster : 300 ». */
  coinsBoosterPrice: string;

  /** Ventilation des CRÉDITS par origine. Cf. `coinSourceLabel`. */
  coinsBySourceTitle: string;
  coinsBySourceEmpty: string;
  coinsSourceMatchWin: string;
  coinsSourceScrimWin: string;
  coinsSourceTwitchDrop: string;
  coinsSourceWelcomeGift: string;
  coinsSourceCardRecycled: string;
  coinsSourceAdminGrant: string;
  coinsSourceSupporterWelcome: string;
  coinsSourceCheckinStreak: string;
  coinsSourceTournamentPlacement: string;
  coinsSourceBattlenetVerified: string;
  coinsSourceCollectionSet: string;
  coinsSourceMatchPrediction: string;
  /** Repli d'une origine inconnue de ce panneau. Interpole `{kind}`. */
  coinsSourceUnknown: string;

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
  kindMap: string;
  kindFanart: string;
  kindMascot: string;
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
/**
 * Le nom lisible d'une origine de gain.
 *
 * L'API rend le `source_kind` BRUT — elle rend le fait, l'interface le formule.
 * Les clés ne sont donc pas closes : le registre des sources peut en gagner une
 * (`checkin_streak`, `tournament_placement`) sans que ce panneau le sache.
 *
 * D'OÙ UN REPLI QUI MONTRE LA CLÉ, ET SURTOUT PAS UNE LIGNE MASQUÉE. Escamoter
 * une origine inconnue ferait que la somme des lignes affichées cesserait
 * d'égaler le cumul juste au-dessus, et cet écart se lirait comme une perte
 * inexpliquée — exactement le faux signal que cet endpoint s'interdit de
 * produire.
 */
function coinSourceLabel(kind: string, labels: TcgOverviewLabels): string {
  switch (kind) {
    case 'match_win':
      return labels.coinsSourceMatchWin;
    case 'scrim_win':
      return labels.coinsSourceScrimWin;
    case 'twitch_drop':
      return labels.coinsSourceTwitchDrop;
    case 'welcome_gift':
      return labels.coinsSourceWelcomeGift;
    case 'card_recycled':
      return labels.coinsSourceCardRecycled;
    case 'admin_grant':
      return labels.coinsSourceAdminGrant;
    case 'supporter_welcome':
      return labels.coinsSourceSupporterWelcome;
    case 'checkin_streak':
      return labels.coinsSourceCheckinStreak;
    case 'tournament_placement':
      return labels.coinsSourceTournamentPlacement;
    case 'battlenet_verified':
      return labels.coinsSourceBattlenetVerified;
    case 'collection_set':
      return labels.coinsSourceCollectionSet;
    case 'match_prediction':
      return labels.coinsSourceMatchPrediction;
    default:
      return format(labels.coinsSourceUnknown, { kind });
  }
}

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
            <div className="mt-3 grid grid-cols-3 gap-3">
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
              <StatCard
                label={labels.packsFromWelcome}
                value={num(data.packs.fromWelcome)}
                accent="gray"
              />
              <StatCard
                label={labels.packsFromDrop}
                value={num(data.packs.fromDrop)}
                accent="gray"
              />
              <StatCard
                label={labels.packsFromPlacement}
                value={num(data.packs.fromPlacement)}
                accent="gray"
              />
              <StatCard
                label={labels.packsFromStreak}
                value={num(data.packs.fromStreak)}
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
            {/* D'où viennent les pièces. Le cumul seul ne dit pas si elles
                arrivent des matchs, des drops en direct ou d'un cadeau ; la
                ventilation des paquets ne le dit qu'à moitié, puisqu'un gain
                en pièces seules (recyclage, ajustement) n'a pas de paquet. */}
            <div className="mt-4 border-t border-white/10 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {labels.coinsBySourceTitle}
              </p>
              {data.coins.earnedBySource === null ? null : Object.keys(
                  data.coins.earnedBySource
                ).length === 0 ? (
                <p className="mt-1 text-[11px] text-gray-500">
                  {labels.coinsBySourceEmpty}
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {Object.entries(data.coins.earnedBySource)
                    // La plus grosse origine d'abord : c'est celle qui explique
                    // l'économie, et celle par laquelle une dérive commence.
                    .sort((a, b) => b[1] - a[1])
                    .map(([kind, amount]) => (
                      <li
                        key={kind}
                        className="flex items-baseline justify-between gap-3 text-xs"
                      >
                        <span className="min-w-0 truncate text-gray-400">
                          {coinSourceLabel(kind, labels)}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-200">
                          {amount}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
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
                          : subject.kind === 'map'
                            ? labels.kindMap
                            : subject.kind === 'fanart'
                              ? labels.kindFanart
                              : subject.kind === 'mascot'
                                ? labels.kindMascot
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
