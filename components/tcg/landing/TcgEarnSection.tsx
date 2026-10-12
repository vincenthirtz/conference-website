// components/tcg/landing/TcgEarnSection.tsx
//
// « Comment gagner des pièces » : le barème RÉEL, lu des constantes du jeu via
// `PublicTcgBareme` (construit par `getStaticProps`). AUCUN montant n'est écrit
// dans les textes : ils ne portent que des marqueurs, remplis ici. Régler
// `utils/tcg/economy.ts` met donc cette section à jour au prochain build.
//
// Couleurs par jetons, texte hérité de la page : cf. `TcgHero.tsx`.

import Link from 'next/link';
import type { JSX } from 'react';

import { TcgCoin } from '@/components/tcg/TcgCoin';
import { format, useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsTcgCatalog from '@/lib/i18n/locales/fr/tcgCatalog';
import type { PublicTcgBareme } from '@/utils/tcg/publicBareme';

type Labels = (typeof nsTcgCatalog)['fr'];

export type EarnRow = {
  key: string;
  label: string;
  note?: string;
  coins: number;
  packs: number;
};

export type EarnGroup = { key: string; title: string; rows: EarnRow[] };

const PLACEMENT_LABEL = {
  champion: 'earnPlacementChampion',
  finalist: 'earnPlacementFinalist',
  podium: 'earnPlacementPodium',
  top_cut: 'earnPlacementTopCut',
} as const;

/**
 * Les groupes de lignes du barème. Pure, exportée pour être testée : chaque
 * montant affiché DOIT venir de `bareme`, et une ligne qui ne rapporterait
 * rien (source éteinte, palier vidé) est retirée plutôt qu'affichée à « +0 ».
 */
export function buildEarnGroups(
  bareme: PublicTcgBareme,
  t: Labels
): EarnGroup[] {
  const groups: EarnGroup[] = [
    {
      key: 'play',
      title: t.earnGroupPlay,
      rows: [
        { key: 'match_win', label: t.earnMatchWin, ...bareme.matchWin },
        { key: 'match_loss', label: t.earnMatchLoss, ...bareme.matchLoss },
        { key: 'scrim_win', label: t.earnScrimWin, ...bareme.scrimWin },
        {
          key: 'checkin_streak',
          label: format(t.earnCheckinStreak, {
            n: bareme.checkinStreak.length,
          }),
          coins: bareme.checkinStreak.coins,
          packs: bareme.checkinStreak.packs,
        },
      ],
    },
    {
      key: 'tournament',
      title: t.earnGroupTournament,
      rows: [
        ...bareme.placements.map((tier) => ({
          key: `placement_${tier.badgeKey}`,
          label: format(t[PLACEMENT_LABEL[tier.badgeKey]], {
            rank: tier.maxRank,
          }),
          note: t.earnPlacementNote,
          coins: tier.coins,
          packs: tier.packs,
        })),
        {
          key: 'participation',
          label: t.earnParticipation,
          note: t.earnParticipationNote,
          ...bareme.participation,
        },
      ],
    },
    {
      key: 'around',
      title: t.earnGroupAround,
      rows: [
        {
          key: 'welcome',
          label: t.earnWelcome,
          note: t.earnWelcomeNote,
          ...bareme.welcomeGift,
        },
        {
          key: 'twitch_drop',
          label: t.earnTwitchDrop,
          note: t.earnTwitchDropNote,
          ...bareme.twitchDrop,
        },
        {
          key: 'prediction',
          label: t.earnPrediction,
          note: t.earnPredictionNote,
          ...bareme.prediction,
        },
        { key: 'public_mvp', label: t.earnPublicMvp, ...bareme.publicMvp },
        {
          key: 'battlenet',
          label: t.earnBattlenet,
          note: t.earnBattlenetNote,
          ...bareme.battlenet,
        },
        {
          key: 'collection_set',
          label: t.earnCollectionSet,
          note: t.earnCollectionSetNote,
          ...bareme.collectionSet,
        },
      ],
    },
  ];

  return groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) => r.coins > 0 || r.packs > 0),
    }))
    .filter((g) => g.rows.length > 0);
}

function Reward({
  row,
  t,
  nf,
}: {
  row: EarnRow;
  t: Labels;
  nf: Intl.NumberFormat;
}): JSX.Element {
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm font-semibold tabular-nums">
      {row.coins > 0 && (
        <span className="inline-flex items-center gap-1.5 text-[var(--color-yellow-light)]">
          <TcgCoin size={16} />
          {format(t.rewardCoins, { n: nf.format(row.coins) })}
        </span>
      )}
      {row.packs > 0 && (
        <span className="text-[var(--color-green-light)]">
          {format(row.packs === 1 ? t.rewardPacks_one : t.rewardPacks_other, {
            n: row.packs,
          })}
        </span>
      )}
    </span>
  );
}

export default function TcgEarnSection({
  bareme,
}: {
  bareme: PublicTcgBareme;
}): JSX.Element {
  const t = useT(nsTcgCatalog);
  const locale = useLocale();
  const nf = new Intl.NumberFormat(locale);
  const groups = buildEarnGroups(bareme, t);

  return (
    <section
      aria-labelledby="tcg-earn-title"
      className="mt-16 scroll-mt-header"
    >
      <h2 id="tcg-earn-title" className="text-2xl font-bold sm:text-3xl">
        {t.earnTitle}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed opacity-80">
        {t.earnLede}
      </p>

      {/* Le prix du booster en tête : c'est le repère qui donne leur sens à
          tous les montants en dessous. */}
      <div className="card-brand mt-6 flex flex-col gap-2 rounded-2xl bg-[var(--bg-elevated)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="font-semibold">{t.earnBoosterTitle}</h3>
        <p className="flex items-center gap-2 text-sm opacity-90">
          <TcgCoin size={18} />
          {format(t.earnBoosterBody, {
            price: nf.format(bareme.boosterPrice),
            packSize: bareme.packSize,
            losses: bareme.lossesPerBooster,
          })}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {groups.map((group) => (
          <div
            key={group.key}
            className="rounded-2xl border border-[var(--color-violet-deep)] bg-[var(--bg-elevated)] p-5"
          >
            <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--color-violet-light)]">
              {group.title}
            </h3>
            <dl className="mt-4 flex flex-col divide-y divide-[var(--color-violet-deep)]">
              {group.rows.map((row) => (
                <div
                  key={row.key}
                  className="flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0"
                >
                  <dt className="text-sm">
                    {row.label}
                    {row.note && (
                      <span className="mt-0.5 block text-xs opacity-70">
                        {row.note}
                      </span>
                    )}
                  </dt>
                  <dd className="shrink-0">
                    <Reward row={row} t={t} nf={nf} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="mt-6 flex flex-col gap-2 text-sm opacity-90 sm:flex-row sm:items-center sm:gap-4">
        <span>{t.earnGuideNote}</span>
        <Link
          href="/player/tcg-guide"
          className="inline-flex min-h-11 items-center font-semibold text-[var(--color-green-light)] underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
        >
          {t.earnGuideLink}
        </Link>
      </p>
    </section>
  );
}
