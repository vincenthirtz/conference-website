/* biome-ignore-all lint/performance/noImgElement: logos d'équipe hors next/image, comme la landing */
// components/tournament/FinalsPhaseView.tsx
//
// Page Bracket d'un tournoi SANS phase à élimination : les affiches des finales
// (projetées depuis le classement tant qu'elles ne sont pas fixées) et la
// course à la qualification. Données : utils/tournament/finalsPhase.ts.

import Link from 'next/link';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import type {
  FinalsCard,
  FinalsPhase,
  FinalsSlot,
  RaceRow,
} from '@/utils/tournament/finalsPhase';
import nsTournamentBracket from '@/lib/i18n/locales/fr/tournamentBracket';

type Dict = typeof nsTournamentBracket.fr;

const TZ = 'Europe/Paris';

function formatWhen(iso: string | null, locale: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function seedLabel(rank: number, t: Dict): string {
  return rank === 1 ? t.finalsSeedFirst : format(t.finalsSeed, { rank });
}

function Slot({
  slot,
  score,
  won,
  t,
}: {
  slot: FinalsSlot;
  score: number | null;
  won: boolean;
  t: Dict;
}) {
  const team = slot.team;
  return (
    <div className="flex items-center gap-3">
      {team?.logo_url ? (
        <img
          src={team.logo_url}
          alt=""
          className="h-11 w-11 shrink-0 rounded-xl border border-white/10 bg-black/40 object-contain"
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          aria-hidden="true"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 text-xs font-bold text-gray-400"
        >
          {team ? initials(team.name) : `#${slot.seed}`}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={`truncate text-base font-semibold ${
            team ? (won ? 'text-white' : 'text-gray-100') : 'text-gray-400'
          }`}
        >
          {team ? team.name : t.finalsTbd}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-gray-500">
          {seedLabel(slot.seed, t)}
        </p>
      </div>
      {score !== null && (
        <span
          className={`font-mono text-2xl font-black tabular-nums ${
            won ? 'text-[var(--color-green-light)]' : 'text-gray-400'
          }`}
        >
          {score}
        </span>
      )}
    </div>
  );
}

function FinalCard({
  card,
  primary,
  seasonStarted,
  t,
  locale,
}: {
  card: FinalsCard;
  primary: boolean;
  seasonStarted: boolean;
  t: Dict;
  locale: string;
}) {
  const { match, slots } = card;
  const played = match.status === 'finished' || match.status === 'completed';
  const anyProjected = slots.some((s) => s.projected && s.team);
  const when = formatWhen(match.scheduled_at, locale);
  const w = match.winner_team_id;

  return (
    <article
      className={`relative overflow-hidden rounded-3xl border p-5 sm:p-6 ${
        primary
          ? 'border-[var(--color-yellow)]/40 bg-gradient-to-br from-[var(--color-violet)]/20 via-black/60 to-black/60'
          : 'border-white/10 bg-black/60'
      }`}
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2
          className={`text-lg font-extrabold uppercase tracking-wider ${
            primary ? 'text-[var(--color-yellow)]' : 'text-gray-100'
          }`}
        >
          {match.round_name}
        </h2>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {[match.match_format?.toUpperCase(), when]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </div>

      <div className="space-y-3">
        <Slot
          slot={slots[0]}
          score={played ? (match.team1_score ?? 0) : null}
          won={played && !!w && w === slots[0].team?.id}
          t={t}
        />
        <div className="flex items-center gap-3 pl-14">
          <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-gray-500">
            {t.finalsVs}
          </span>
          <span className="h-px flex-1 bg-white/10" />
        </div>
        <Slot
          slot={slots[1]}
          score={played ? (match.team2_score ?? 0) : null}
          won={played && !!w && w === slots[1].team?.id}
          t={t}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3">
        <span
          className={`text-xs font-medium ${
            anyProjected ? 'text-[var(--color-violet-light)]' : 'text-gray-400'
          }`}
        >
          {!seasonStarted
            ? t.finalsNotStarted
            : anyProjected
              ? t.finalsProjected
              : t.finalsConfirmed}
        </span>
        <Link
          href={`/match/${match.id}`}
          className="text-xs font-semibold text-[var(--color-violet-light)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] rounded"
        >
          {t.finalsWatchMatch} →
        </Link>
      </div>
    </article>
  );
}

function StatusBadge({ status, t }: { status: RaceRow['status']; t: Dict }) {
  if (status === 'qualified') {
    return (
      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
        {t.raceQualified}
      </span>
    );
  }
  if (status === 'eliminated') {
    return (
      <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] font-medium text-gray-500">
        {t.raceEliminated}
      </span>
    );
  }
  return <span className="text-[11px] text-gray-400">{t.raceContention}</span>;
}

function RaceTable({
  phase,
  finalNames,
  t,
  standingsHref,
}: {
  phase: FinalsPhase;
  finalNames: (string | null)[];
  t: Dict;
  standingsHref: string;
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-black/60 p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-white">{t.raceTitle}</h2>
          <p className="mt-1 max-w-2xl text-xs text-gray-400">
            {phase.seasonOver ? t.raceSubtitleOver : t.raceSubtitle}
          </p>
        </div>
        <Link
          href={standingsHref}
          className="text-xs font-semibold text-[var(--color-violet-light)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)] rounded"
        >
          {t.raceSeeStandings} →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500">
              <th scope="col" className="w-8 pb-2 text-left font-medium">
                #
              </th>
              <th scope="col" className="pb-2 text-left font-medium">
                {t.raceColTeam}
              </th>
              <th scope="col" className="pb-2 text-center font-medium">
                {t.raceColPoints}
              </th>
              <th scope="col" className="pb-2 text-center font-medium">
                {t.raceColRemaining}
              </th>
              <th
                scope="col"
                className="hidden pb-2 text-center font-medium sm:table-cell"
                title={t.raceMaxTitle}
              >
                {t.raceColMax}
              </th>
              <th scope="col" className="pb-2 text-right font-medium">
                {t.raceColStatus}
              </th>
            </tr>
          </thead>
          <tbody>
            {phase.race.map((r, idx) => {
              const isCut = idx === phase.qualifiers && phase.qualifiers > 0;
              return (
                <tr
                  key={r.teamId}
                  className={`border-t ${
                    isCut
                      ? 'border-t-2 border-dashed border-[var(--color-yellow)]/50'
                      : 'border-white/5'
                  } ${r.status === 'eliminated' ? 'opacity-60' : ''}`}
                  title={isCut ? t.raceCutLine : undefined}
                >
                  <td className="py-2 font-mono text-xs text-gray-400">
                    {r.rank}
                  </td>
                  <td className="py-2">
                    <span className="flex min-w-0 flex-col">
                      {r.slug ? (
                        <Link
                          href={`/team/${r.slug}`}
                          className="truncate font-medium text-gray-100 hover:text-white hover:underline"
                        >
                          {r.teamName}
                        </Link>
                      ) : (
                        <span className="truncate font-medium text-gray-100">
                          {r.teamName}
                        </span>
                      )}
                      {r.zone !== null && finalNames[r.zone] && (
                        <span className="text-[10px] uppercase tracking-wider text-[var(--color-violet-light)]">
                          {finalNames[r.zone]}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2 text-center font-mono font-bold tabular-nums text-white">
                    {r.points}
                  </td>
                  <td
                    className="py-2 text-center font-mono text-xs text-gray-300"
                    title={format(t.raceRemainingTitle, { count: r.remaining })}
                  >
                    {r.remaining}
                  </td>
                  <td className="hidden py-2 text-center font-mono text-xs text-gray-400 sm:table-cell">
                    {r.maxPoints}
                  </td>
                  <td className="py-2 text-right">
                    <StatusBadge status={r.status} t={t} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {phase.qualifiers > 0 && phase.race.length > phase.qualifiers && (
        <p className="mt-2 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="inline-block w-6 border-t-2 border-dashed border-[var(--color-yellow)]/50" />
          {t.raceCutLine}
        </p>
      )}
    </section>
  );
}

export default function FinalsPhaseView({
  phase,
  tournamentPath,
}: {
  phase: FinalsPhase;
  tournamentPath: string;
}) {
  const t = useT(nsTournamentBracket);
  const locale = useLocale();

  if (phase.cards.length === 0) {
    return (
      <div className="bg-black/60 border border-white/5 rounded-2xl p-8 text-center">
        <p className="text-lg font-semibold text-gray-100 mb-1">
          {t.finalsEmptyTitle}
        </p>
        <p className="text-sm text-gray-400 mb-4">{t.finalsEmptyBody}</p>
        <Link
          href={`${tournamentPath}/standings`}
          className="inline-flex items-center gap-2 rounded-full bg-[var(--color-violet-cta)] hover:bg-[var(--color-violet-deep)] px-4 py-2 text-sm font-medium text-white transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
        >
          {t.raceSeeStandings}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {phase.cards.map((card, i) => (
          <FinalCard
            key={card.match.id}
            card={card}
            primary={i === 0}
            seasonStarted={phase.seasonStarted}
            t={t}
            locale={locale}
          />
        ))}
      </div>
      <RaceTable
        phase={phase}
        finalNames={phase.cards.map((c) => c.match.round_name)}
        t={t}
        standingsHref={`${tournamentPath}/standings`}
      />
    </div>
  );
}
