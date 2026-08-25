// components/tournament/landing/BracketPreview.tsx
//
// Aperçu du déroulé du tournoi, DÉRIVÉ DES MATCHS RÉELS (round_number /
// round_name / bracket_side) et non d'un schéma d'élimination codé en dur :
// une saison régulière (round robin, swiss, poules) s'affichait jusqu'ici
// comme un winner bracket à trois manches, ce qui était faux.
//
// Trois familles de manches, chacune rendue à sa façon :
//   - saison régulière (`bracket_side = 'none'`) → une pastille par journée ;
//   - finales : les manches finales à un seul match (petite / grande finale),
//     détectées en fin de calendrier ;
//   - winners / losers (`wb`, `lb`, `final`) → colonnes d'arbre, comme avant,
//     mais avec le nombre de matchs réel.
//
// Sans aucun match généré, on retombe sur le schéma d'architecture — utile
// seulement quand une phase de type `bracket` est déjà déclarée.

import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import { Section, SectionHeader, Reveal } from './primitives';
import type { LandingRound, LandingStage } from './types';
import nsTournamentLanding from '@/lib/i18n/locales/fr/tournamentLanding';

function BracketSlot() {
  const t = useT(nsTournamentLanding);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
      <span
        className="h-5 w-5 shrink-0 rounded bg-white/8"
        aria-hidden="true"
      />
      <span className="truncate text-[11px] text-gray-500">{t.bracketTbd}</span>
    </div>
  );
}

function BracketMatch() {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent p-2">
      <BracketSlot />
      <BracketSlot />
    </div>
  );
}

function BracketColumn({
  label,
  count,
  stagger,
}: {
  label: string;
  count: number;
  stagger: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <Reveal
      stagger={stagger}
      className="flex min-w-[150px] flex-1 flex-col gap-3"
    >
      <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500">
        {label}
      </p>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {Array.from({ length: count }).map((_, i) => (
          <BracketMatch key={i} />
        ))}
      </div>
    </Reveal>
  );
}

/** Pastille « journée » : nom de la manche + nombre de matchs. */
function RoundChip({
  label,
  countLabel,
  stagger,
}: {
  label: string;
  countLabel: string;
  stagger: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <Reveal stagger={stagger}>
      <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-transparent px-3 py-4 text-center transition-colors hover:border-[var(--color-green)]/40">
        <p className="truncate text-sm font-bold text-white">{label}</p>
        <p className="mt-1 text-[11px] text-gray-500">{countLabel}</p>
      </div>
    </Reveal>
  );
}

/** Affiche de finale : les équipes ne sont connues qu'à l'issue de la saison. */
function FinalCard({
  label,
  highlight,
  stagger,
}: {
  label: string;
  highlight: boolean;
  stagger: 1 | 2 | 3 | 4 | 5;
}) {
  return (
    <Reveal stagger={stagger} className="flex-1">
      <p
        className={`mb-2 text-center text-[10px] font-semibold uppercase tracking-widest ${
          highlight ? 'text-[var(--color-yellow)]' : 'text-gray-500'
        }`}
      >
        {label}
      </p>
      {highlight ? (
        <div className="tl-gradient-border rounded-xl">
          <div className="flex flex-col gap-1.5 rounded-xl bg-[#0d0520] p-2">
            <BracketSlot />
            <BracketSlot />
          </div>
        </div>
      ) : (
        <BracketMatch />
      )}
    </Reveal>
  );
}

const staggerOf = (i: number) => ((i % 5) + 1) as 1 | 2 | 3 | 4 | 5;

/**
 * Isole les manches finales d'une saison régulière : les dernières manches du
 * calendrier ne comportant qu'un seul match (petite finale, grande finale).
 * Garde-fou : il faut au moins une manche « pleine » avant, sinon un tournoi
 * à deux équipes verrait tout son calendrier requalifié en finales.
 */
export function splitSeasonAndFinals(rounds: LandingRound[]): {
  season: LandingRound[];
  finals: LandingRound[];
} {
  const finals: LandingRound[] = [];
  let cut = rounds.length;
  while (cut > 0 && rounds[cut - 1].matchCount === 1) cut -= 1;
  if (cut > 0 && rounds.slice(0, cut).some((r) => r.matchCount > 1)) {
    finals.push(...rounds.slice(cut));
    return { season: rounds.slice(0, cut), finals };
  }
  return { season: rounds, finals: [] };
}

export default function BracketPreview({
  stages,
  rounds,
  tournamentPath,
}: {
  stages: LandingStage[];
  rounds: LandingRound[];
  tournamentPath: string;
}) {
  const t = useT(nsTournamentLanding);

  const hasDoubleElim =
    rounds.some((r) => r.side === 'lb') ||
    stages.some((s) => /double/i.test(s.bracket_format || ''));

  const mainBracket = rounds.filter(
    (r) => r.side === 'wb' || r.side === 'final'
  );
  const loserBracket = rounds.filter((r) => r.side === 'lb');
  const { season, finals } = splitSeasonAndFinals(
    rounds.filter((r) => r.side === 'none')
  );

  const hasEliminationBracket = mainBracket.length > 0;
  const hasSchedule = rounds.length > 0;
  // Sans arbre d'élimination, « ouvrir le bracket » mène à une page vide :
  // on renvoie vers le calendrier, qui contient bien toutes les affiches.
  const ctaHref = hasEliminationBracket
    ? `${tournamentPath}/bracket`
    : `${tournamentPath}/matches`;

  const roundLabel = (r: LandingRound, index: number) =>
    r.name || format(t.bracketRound, { n: String(r.number || index + 1) });
  const countLabel = (n: number) =>
    format(n > 1 ? t.bracketMatchCount_other : t.bracketMatchCount_one, {
      count: String(n),
    });

  return (
    <Section id="bracket">
      <SectionHeader
        eyebrow={
          hasEliminationBracket ? t.bracketEyebrow : t.bracketPathEyebrow
        }
        title={hasEliminationBracket ? t.bracketHeading : t.bracketPathHeading}
        subtitle={
          hasEliminationBracket ? t.bracketSubtitle : t.bracketPathSubtitle
        }
        align="left"
        action={
          <Link href={ctaHref}>
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--color-violet)] px-5 py-2.5 text-xs font-bold text-white transition-transform hover:scale-[1.03]">
              {hasEliminationBracket ? t.bracketCta : t.bracketCtaSchedule}
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M13 7l5 5m0 0l-5 5m5-5H6"
                />
              </svg>
            </span>
          </Link>
        }
      />

      <div className="overflow-x-auto">
        <div
          className={`rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-7 ${
            hasEliminationBracket || !hasSchedule ? 'min-w-[640px]' : ''
          }`}
        >
          {/* Saison régulière — une pastille par journée */}
          {season.length > 0 && (
            <>
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-green-light)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]" />
                {t.bracketRegularSeason}
              </p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {season.map((r, i) => (
                  <RoundChip
                    key={`s-${r.number}-${i}`}
                    label={roundLabel(r, i)}
                    countLabel={countLabel(r.matchCount)}
                    stagger={staggerOf(i)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Phase finale — petite puis grande finale */}
          {finals.length > 0 && (
            <>
              {season.length > 0 && <div className="my-6 h-px bg-white/8" />}
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-yellow)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-yellow)]" />
                {t.bracketFinals}
              </p>
              <div className="flex flex-col gap-4 sm:flex-row">
                {finals.map((r, i) => (
                  <FinalCard
                    key={`f-${r.number}-${i}`}
                    label={roundLabel(r, season.length + i)}
                    highlight={i === finals.length - 1}
                    stagger={staggerOf(i)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Winners bracket — manches réelles */}
          {hasEliminationBracket && (
            <>
              {(season.length > 0 || finals.length > 0) && (
                <div className="my-6 h-px bg-white/8" />
              )}
              {hasDoubleElim && (
                <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-green-light)]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]" />
                  {t.bracketWinners}
                </p>
              )}
              <div className="flex items-stretch gap-4">
                {mainBracket.map((r, i) => (
                  <BracketColumn
                    key={`w-${r.number}-${i}`}
                    label={roundLabel(r, i)}
                    count={r.matchCount}
                    stagger={staggerOf(i)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Losers bracket */}
          {loserBracket.length > 0 && (
            <>
              <div className="my-6 h-px bg-white/8" />
              <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-violet-light)]">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-violet)]" />
                {t.bracketLosers}
              </p>
              <div className="flex items-stretch gap-4">
                {loserBracket.map((r, i) => (
                  <BracketColumn
                    key={`l-${r.number}-${i}`}
                    label={roundLabel(r, i)}
                    count={r.matchCount}
                    stagger={staggerOf(i)}
                  />
                ))}
              </div>
            </>
          )}

          {/* Calendrier pas encore généré */}
          {!hasSchedule && <EmptySchematic stages={stages} />}
        </div>
      </div>
    </Section>
  );
}

/**
 * Aucun match généré : on ne connaît le format que par les phases déclarées.
 * Phase `bracket` → schéma d'architecture ; sinon simple message d'attente.
 */
function EmptySchematic({ stages }: { stages: LandingStage[] }) {
  const t = useT(nsTournamentLanding);
  const hasBracketStage = stages.some((s) => s.stage_type === 'bracket');

  if (!hasBracketStage) {
    return (
      <p className="py-6 text-center text-sm text-gray-400">
        {t.bracketScheduleSoon}
      </p>
    );
  }

  return (
    <>
      <p className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[var(--color-green-light)]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-green)]" />
        {t.bracketWinners}
      </p>
      <div className="flex items-stretch gap-4">
        <BracketColumn
          label={format(t.bracketRound, { n: '1' })}
          count={4}
          stagger={1}
        />
        <BracketColumn
          label={format(t.bracketRound, { n: '2' })}
          count={2}
          stagger={2}
        />
        <BracketColumn
          label={format(t.bracketRound, { n: '3' })}
          count={1}
          stagger={3}
        />
        <Reveal
          stagger={4}
          className="flex min-w-[150px] flex-1 flex-col justify-center gap-3"
        >
          <p className="text-center text-[10px] font-semibold uppercase tracking-widest text-[var(--color-yellow)]">
            {t.bracketFinal}
          </p>
          <div className="tl-gradient-border rounded-xl">
            <div className="flex flex-col gap-1.5 rounded-xl bg-[#0d0520] p-2">
              <BracketSlot />
              <BracketSlot />
            </div>
          </div>
        </Reveal>
      </div>
    </>
  );
}
