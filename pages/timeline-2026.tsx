// pages/timeline-2026.tsx
//
// Le PARCOURS de l'édition 2026, présenté comme un vrai planning.
//
// Structure : trois bandes temporelles — avant-saison, saison régulière,
// finales — et dans chaque bande de compétition, les SOIRÉES de match (un jour
// calendaire dans le fuseau du tournoi), regroupées par semaine. Chaque ligne
// de match porte en pastille l'étiquette de sa journée (J1…J7, « Grande
// finale »). La soirée en cours (ou la prochaine) est la seule chose mise en
// avant, et la seule carte ouverte par défaut.
//
// Pourquoi par soirée et pas par journée : `round_name` (J1…J7) est une RONDE
// D'APPARIEMENTS — c'est elle qui indexe le pool de cartes (round_number) — et
// elle ne suit pas le calendrier. Une même soirée mêle J3, J2 et J1, et une
// journée s'étale sur plusieurs semaines : l'ancienne carte « J2 : 23 sept →
// 16 oct » ne répondait pas à la question du public, « on joue quand ? ». La
// journée reste lisible (pastille + note de phase) ; la soirée structure la
// page, comme la vue agenda de /tournament/[id]/matches.
//
// Trois règles tenues ici :
//   1. L'état vient des DONNÉES, jamais de l'horloge : « prochaine soirée » =
//      première soirée (chronologique) ayant un match non terminé, « en cours »
//      = une soirée avec un match live. Une dérivation basée sur `new Date()`
//      divergerait entre le rendu ISR et le client (mismatch d'hydratation), et
//      cette page est en `revalidate: 300`.
//   2. Seul le compte à rebours dépend de l'heure — il est donc rendu APRÈS
//      montage, jamais côté serveur.
//   3. Tout jour et tout horaire se lisent dans le fuseau DU TOURNOI
//      (`tournaments.timezone`, repli Europe/Paris), via utils/scheduleByDay —
//      même clé de jour que le diagnostic de planning admin. Sans fuseau
//      explicite, le HTML ISR porte l'heure du serveur (UTC) puis l'hydratation
//      celle du navigateur, et un match de 00:30 tombe la veille.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import ProductionPartner from '@/components/Production/ProductionPartner';
import nsTimeline2026 from '@/lib/i18n/locales/fr/timeline2026';
import RegisterTeamCta from '@/components/RegisterTeamCta';
import { getWallClockParts } from '@/utils/timezone';
import {
  SCHEDULE_TZ,
  buildPhasedSchedule,
  dayKeyInTz,
  daysBetweenYmd,
  formatTimeInTz,
  formatYmd,
  isFinishedStatus,
  resolveTournamentTz,
  type DayState,
  type ScheduleDay,
} from '@/utils/scheduleByDay';

type Timeline2026Dict = typeof nsTimeline2026.fr;

const WOMEN_TOURNAMENT_ID_2026 = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';
const TWITCH_URL = 'https://www.twitch.tv/womens_cup';

type SimpleTeam = {
  id: string;
  name: string;
  short_name?: string | null;
};

type SimpleMatch = {
  id: string;
  scheduled_at: string | null;
  status: string;
  is_bye: boolean | null;
  round_name: string | null;
  match_format: string | null;
  team1_score: number | null;
  team2_score: number | null;
  team1: SimpleTeam | null;
  team2: SimpleTeam | null;
  stage: { name: string | null } | null;
};

/** Une SOIRÉE de match : un jour calendaire dans le fuseau du tournoi. */
type Evening = ScheduleDay<SimpleMatch>;

type Props = {
  matches: SimpleMatch[];
  tournamentSlug: string | null;
  teamCount: number;
  /** Fuseau IANA du tournoi, déjà validé (repli Europe/Paris). */
  timezone: string;
};

/** « ven. 18 sept. » — libellé d'une soirée. */
const EVENING_LABEL: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
};
/** « 18 sept. » — bornes de semaine, de phase, de saison. */
const SHORT_DAY: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'short',
};

/**
 * Jalons éditoriaux d'avant-saison. Ils portent une DATE, pas seulement un
 * libellé de mois : c'est elle qui décide de leur état, sans re-parser du texte
 * traduit comme le faisait `frenchMonthMap`.
 */
const getPreseason = (t: Timeline2026Dict) => [
  {
    id: 'transphobia-day',
    date: '2026-05-17',
    title: t.item1Title,
    period: t.item1Period,
    description: t.item1Desc,
    badge: t.item1Badge,
  },
  {
    id: 'summer',
    date: '2026-06-01',
    title: t.item2Title,
    period: t.item2Period,
    description: t.item2Desc,
    badge: undefined as string | undefined,
  },
];

export const getStaticProps: GetStaticProps<Props> = async () => {
  let matches: SimpleMatch[] = [];
  let tournamentSlug: string | null = null;
  let teamCount = 0;
  let timezone = SCHEDULE_TZ;

  if (supabaseAdmin) {
    // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
    const [matchesRes, tournamentRes, teamsRes] = await Promise.all([
      supabaseAdmin
        .from('matches')
        .select(
          `
        id,
        scheduled_at,
        status,
        is_bye,
        round_name,
        match_format,
        team1_score,
        team2_score,
        team1:team1_id ( id, name, short_name ),
        team2:team2_id ( id, name, short_name ),
        stage:tournament_stages ( name )
      `
        )
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tournament_id', WOMEN_TOURNAMENT_ID_2026)
        .neq('status', 'cancelled')
        .order('scheduled_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),
      supabaseAdmin
        .from('tournaments')
        .select('slug, timezone')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', WOMEN_TOURNAMENT_ID_2026)
        .maybeSingle(),
      supabaseAdmin
        .from('tournament_teams')
        .select('id', { count: 'exact', head: true })
        .eq('tournament_id', WOMEN_TOURNAMENT_ID_2026),
    ]);

    if (!matchesRes.error && matchesRes.data) {
      matches = matchesRes.data as unknown as SimpleMatch[];
    }
    tournamentSlug = tournamentRes.data?.slug ?? null;
    timezone = resolveTournamentTz(tournamentRes.data?.timezone);
    teamCount = teamsRes.count ?? 0;
  }

  return {
    props: { matches, tournamentSlug, teamCount, timezone },
    revalidate: 300,
  };
};

/* ─────────────────────────────  Formatage  ──────────────────────────────── */

function formatYmdRange(
  from: string | null,
  to: string | null,
  locale: string,
  t: Timeline2026Dict
): string {
  if (!from) return t.dateTbd;
  const a = formatYmd(from, locale, SHORT_DAY);
  const b = to ? formatYmd(to, locale, SHORT_DAY) : a;
  return a === b ? a : `${a} → ${b}`;
}

function formatIsoRange(
  from: string | null,
  to: string | null,
  tz: string,
  locale: string,
  t: Timeline2026Dict
): string {
  return formatYmdRange(dayKeyInTz(from, tz), dayKeyInTz(to, tz), locale, t);
}

/** Étiquette de journée saisie côté staff (« J3 », « Grande finale »). */
function roundLabel(m: SimpleMatch): string | null {
  return m.round_name?.trim() || null;
}

/**
 * Note de format d'une phase, déduite des matchs eux-mêmes (nombre de
 * journées, matchs par journée, format) plutôt qu'écrite en dur — la phrase
 * suit le tournoi, elle ne le décrit pas de mémoire.
 */
function phaseNote(matches: SimpleMatch[], t: Timeline2026Dict): string | null {
  const perRound = new Map<string, number>();
  for (const m of matches) {
    const label = roundLabel(m);
    if (label) perRound.set(label, (perRound.get(label) ?? 0) + 1);
  }
  const formats = Array.from(
    new Set(
      matches
        .map((m) => m.match_format?.toUpperCase())
        .filter((f): f is string => !!f)
    )
  );
  const counts = Array.from(perRound.values());
  const uniform = counts.length > 0 && counts.every((n) => n === counts[0]);
  // Une poule, c'est plusieurs journées de PLUSIEURS matchs. « Petite finale »
  // + « Grande finale » (1 match chacune) sont deux étiquettes, pas une poule :
  // sans le `>= 2`, les finales se voyaient décrites comme un round-robin.
  if (counts.length > 1 && uniform && counts[0] >= 2 && formats.length === 1) {
    return format(t.phaseNoteRounds, {
      rounds: counts.length,
      perRound: counts[0],
      format: formats[0],
    });
  }
  if (formats.length === 1) {
    return format(t.phaseNoteSingle, { format: formats[0] });
  }
  return null;
}

/* ─────────────────────────  Primitives visuelles  ───────────────────────── */

function Chip({
  children,
  tone = 'muted',
}: {
  children: React.ReactNode;
  tone?: 'muted' | 'accent' | 'live' | 'done';
}) {
  const tones: Record<string, string> = {
    muted: 'border-white/15 text-neutral-400',
    accent:
      'border-[color-mix(in_srgb,var(--color-violet)_55%,transparent)] text-[var(--color-violet-200)]',
    live: 'border-[color-mix(in_srgb,var(--color-green)_55%,transparent)] text-[var(--color-green)]',
    done: 'border-white/10 text-neutral-500',
  };
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-[2px] font-mono text-[10px] font-medium uppercase tracking-[0.08em] border ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * Pastille de journée. Tronquable : « Petite finale » doit tenir dans la
 * colonne horaire sur 360 px sans pousser les noms d'équipes.
 */
function RoundTag({ label }: { label: string }) {
  return (
    <span
      title={label}
      className="inline-block max-w-full truncate rounded border border-white/15 bg-white/[0.04] px-1.5 py-px font-mono text-[10px] font-medium uppercase tracking-[0.06em] text-neutral-300"
    >
      {label}
    </span>
  );
}

function MatchRow({ match, tz }: { match: SimpleMatch; tz: string }) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const t1 = match.team1?.short_name || match.team1?.name || t.teamFallback1;
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? t.bye : t.teamFallback2);

  const done = isFinishedStatus(match.status);
  const hasScores =
    match.team1_score !== null &&
    match.team1_score !== undefined &&
    match.team2_score !== null &&
    match.team2_score !== undefined;
  const time = formatTimeInTz(match.scheduled_at, locale, tz);
  const round = roundLabel(match);

  return (
    <Link
      href={`/match/${match.id}`}
      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 transition hover:border-[color-mix(in_srgb,var(--color-violet)_45%,transparent)] hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
    >
      {/* Horaire + journée. Largeur FIXE : chaque ligne est sa propre grille,
          c'est elle qui aligne les noms d'équipes d'une ligne à l'autre. Sous
          `sm`, la pastille passe sous l'heure pour laisser la place aux noms. */}
      <span className="flex w-[92px] shrink-0 flex-col items-start gap-1 sm:w-[168px] sm:flex-row sm:items-center sm:gap-2">
        <span className="font-mono text-[11px] tabular-nums text-white">
          {time ?? (
            <>
              <span aria-hidden>—</span>
              <span className="sr-only">{t.timeTbd}</span>
            </>
          )}
        </span>
        {round && <RoundTag label={round} />}
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm text-white">
          <span className="font-medium">{t1}</span>
          {match.is_bye ? (
            <span className="text-neutral-500"> {t.bye}</span>
          ) : (
            <>
              <span className="mx-1.5 text-neutral-600">{t.vs}</span>
              <span className="font-medium">{t2}</span>
            </>
          )}
        </span>
      </span>

      {/* Le format et le chevron sautent sous `sm` : sur 390 px, ils volaient
          la place aux noms d'équipes, qui se retrouvaient tronqués (« Team… »).
          Le format est déjà annoncé une fois par la note de phase. */}
      <span className="flex shrink-0 items-center gap-2">
        {match.match_format && (
          <span className="hidden sm:inline-flex">
            <Chip>{match.match_format}</Chip>
          </span>
        )}
        {hasScores || done ? (
          <span className="font-mono text-xs font-semibold tabular-nums text-[var(--color-green)]">
            {match.team1_score ?? 0}–{match.team2_score ?? 0}
          </span>
        ) : (
          <span className="hidden text-neutral-600 transition group-hover:text-[var(--color-violet-200)] sm:inline">
            →
          </span>
        )}
      </span>
    </Link>
  );
}

/** Une soirée : en-tête cliquable (jour, créneaux, journées) + ses matchs. */
function EveningCard({
  evening,
  state,
  tz,
}: {
  evening: Evening;
  state: DayState;
  tz: string;
}) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const total = evening.items.length;
  const played = evening.items.filter((m) => isFinishedStatus(m.status)).length;
  const highlighted = state === 'next' || state === 'live';

  const from = formatTimeInTz(evening.firstAt, locale, tz);
  const to = formatTimeInTz(evening.lastAt, locale, tz);
  const slots = from && to && from !== to ? `${from} → ${to}` : from;

  // Les journées jouées ce soir-là, dans l'ordre des créneaux : c'est ce qui
  // explique, carte fermée, qu'une soirée mêle J3, J2 et J1.
  const rounds = Array.from(
    new Set(evening.items.map(roundLabel).filter((r): r is string => !!r))
  );

  const statusChip =
    state === 'live' ? (
      <Chip tone="live">{t.eveningLive}</Chip>
    ) : state === 'next' ? (
      <Chip tone="accent">{t.eveningNext}</Chip>
    ) : state === 'done' ? (
      <Chip tone="done">{t.eveningDone}</Chip>
    ) : (
      <Chip>{t.eveningUpcoming}</Chip>
    );

  return (
    <details
      open={highlighted}
      className={`group rounded-xl border bg-[var(--color-surface)] transition ${
        highlighted
          ? 'border-[color-mix(in_srgb,var(--color-violet)_45%,transparent)]'
          : 'border-white/10'
      } ${state === 'done' ? 'opacity-70' : ''}`}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]">
        <span
          className={`rounded px-2 py-[3px] font-mono text-xs font-semibold ${
            highlighted
              ? 'bg-[color-mix(in_srgb,var(--color-violet)_22%,transparent)] text-[var(--color-violet-200)]'
              : 'bg-white/[0.06] text-neutral-300'
          }`}
        >
          {evening.ymd
            ? formatYmd(evening.ymd, locale, EVENING_LABEL)
            : t.dateTbd}
        </span>

        {slots && (
          <span className="font-mono text-xs tabular-nums text-neutral-400">
            {slots}
          </span>
        )}

        {rounds.length > 0 && (
          <span className="hidden items-center gap-1 md:inline-flex">
            {rounds.map((r) => (
              <RoundTag key={r} label={r} />
            ))}
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-neutral-500">
            {format(t.eveningProgress, { played, total })}
          </span>
          {statusChip}
          <span
            aria-hidden
            className="font-mono text-xs text-neutral-500 transition group-open:rotate-90"
          >
            ›
          </span>
        </span>
      </summary>

      <div className="flex flex-col gap-1.5 border-t border-white/[0.07] px-4 py-3">
        {evening.items.map((m) => (
          <MatchRow key={m.id} match={m} tz={tz} />
        ))}
      </div>
    </details>
  );
}

/** En-tête de bande temporelle : titre + fenêtre, filet sous les deux. */
function BandHead({
  title,
  when,
  accent,
}: {
  title: string;
  when: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 pb-2 ${
        accent
          ? 'border-[color-mix(in_srgb,var(--color-violet)_60%,transparent)]'
          : 'border-white/15'
      }`}
    >
      <h2 className="text-xl font-bold tracking-tight text-white">{title}</h2>
      <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-neutral-500 tabular-nums">
        {when}
      </span>
    </div>
  );
}

/* ─────────────────────────────  La page  ────────────────────────────────── */

function Timeline2026Page({
  matches,
  tournamentSlug,
  teamCount,
  timezone,
}: Props) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const tz = timezone || SCHEDULE_TZ;
  const tournamentIdentifier = tournamentSlug || WOMEN_TOURNAMENT_ID_2026;

  // Phases → semaines → soirées. « Où en est-on ? » se lit dans les STATUTS,
  // pas dans l'horloge — cf. règle n° 1 en tête de fichier.
  const schedule = buildPhasedSchedule(matches, {
    phaseOf: (m) => m.stage?.name,
    fallbackPhase: t.phaseFinals,
    tz,
  });
  const preseason = getPreseason(t);
  const next = schedule.next;
  const nextIsLive = next ? schedule.states.get(next) === 'live' : false;
  const playedTotal = matches.filter((m) => isFinishedStatus(m.status)).length;

  // Compte à rebours : la seule valeur dépendante de l'heure, donc calculée
  // après montage. Rendu serveur = rien, plutôt qu'une valeur déjà périmée.
  // Il vise le premier match de la prochaine soirée, en jours CALENDAIRES du
  // fuseau du tournoi (« J-2 » un mercredi pour le vendredi, quelle que soit
  // l'heure). Rien si la soirée est déjà live, ou si elle est dans le passé
  // (statuts pas encore à jour).
  const nextYmd = next?.ymd ?? null;
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    if (!nextYmd || nextIsLive) {
      setCountdown(null);
      return;
    }
    const today = getWallClockParts(new Date(), tz).date;
    const n = daysBetweenYmd(today, nextYmd);
    setCountdown(n >= 0 ? n : null);
  }, [nextYmd, nextIsLive, tz]);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <header className="mx-auto max-w-5xl px-6 pb-10 pt-32">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-500">
          {t.heroEyebrow}
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-brand-gradient md:text-5xl text-balance">
          {t.heroTitle}
        </h1>
        <span className="brand-rule mt-4 block" aria-hidden />
        <p className="mt-4 max-w-2xl text-lg text-neutral-300">
          {t.heroSubtitle}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {countdown !== null && next?.ymd && (
            <span className="inline-flex items-baseline gap-2 rounded-full border border-[color-mix(in_srgb,var(--color-violet)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-violet)_12%,transparent)] py-1.5 pl-3 pr-4">
              <span className="font-mono text-base font-semibold tabular-nums text-[var(--color-violet-200)]">
                {countdown === 0
                  ? t.countdownTonight
                  : format(t.countdownValue, { n: countdown })}
              </span>
              <span className="text-sm text-neutral-300">
                {countdown === 0
                  ? format(t.countdownTonightLabel, {
                      time: formatTimeInTz(next.firstAt, locale, tz) ?? '',
                    })
                  : format(t.countdownLabel, {
                      date: formatYmd(next.ymd, locale, EVENING_LABEL),
                    })}
              </span>
            </span>
          )}
          <RegisterTeamCta
            label={t.registerTeam}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-green)] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[var(--color-green-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-light)]"
          />
        </div>

        {/* Chiffres de l'édition — la carte d'identité du planning. */}
        <dl className="mt-8 grid gap-px overflow-hidden rounded-xl border border-white/10 bg-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { v: String(teamCount), k: t.statTeams },
            { v: String(schedule.dayCount), k: t.statEvenings },
            {
              v: format(t.statMatchesValue, {
                played: playedTotal,
                total: matches.length,
              }),
              k: t.statMatches,
            },
            {
              v: formatIsoRange(
                schedule.firstAt,
                schedule.lastAt,
                tz,
                locale,
                t
              ),
              k: t.statWindow,
            },
          ].map((s) => (
            <div key={s.k} className="bg-[var(--color-surface)] px-4 py-3">
              <dd className="whitespace-nowrap font-mono text-lg font-semibold tabular-nums text-white sm:text-xl">
                {s.v}
              </dd>
              <dt className="mt-0.5 text-xs text-neutral-400">{s.k}</dt>
            </div>
          ))}
        </dl>
        {matches.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            {tz === SCHEDULE_TZ ? t.tzNote : format(t.tzNoteOther, { tz })}
          </p>
        )}
      </header>

      <div className="mx-auto max-w-5xl px-6 pb-8">
        <ProductionPartner variant="compact" />
      </div>

      <main className="mx-auto max-w-5xl px-6 pb-24">
        {/* ── Avant-saison ──────────────────────────────────────────────── */}
        <section className="mt-10">
          <BandHead title={t.phasePreseason} when={t.phasePreseasonWhen} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {preseason.map((item) => (
              <article
                key={item.id}
                className="rounded-xl border border-white/10 bg-[var(--color-surface)] p-5 opacity-80"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-neutral-500">
                    {item.period}
                  </span>
                  {item.badge && <Chip>{item.badge}</Chip>}
                </div>
                <h3 className="mt-2 text-base font-semibold text-white text-balance">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-400">
                  {item.description}
                </p>
                {item.id === 'transphobia-day' && (
                  <a
                    href={TWITCH_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-violet-200)] transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
                  >
                    {t.followTwitch}
                  </a>
                )}
              </article>
            ))}
          </div>
        </section>

        {/* ── Compétition : bande par phase → semaines → soirées ────────── */}
        {matches.length === 0 ? (
          <section className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-neutral-300">{t.emptyTitle}</p>
            <p className="mt-2 text-sm text-neutral-500">{t.emptySub}</p>
          </section>
        ) : (
          schedule.phases.map((phase) => {
            const note = phaseNote(phase.items, t);
            return (
              <section key={phase.key} className="mt-12">
                <BandHead
                  title={phase.key}
                  when={formatIsoRange(
                    phase.firstAt,
                    phase.lastAt,
                    tz,
                    locale,
                    t
                  )}
                  accent={!!next && phase.days.includes(next)}
                />
                {note && (
                  <p className="mt-3 max-w-2xl text-sm text-neutral-400">
                    {note}
                  </p>
                )}
                {phase.weeks.map((week) => (
                  <div key={week.key} className="mt-6">
                    {week.index !== null && (
                      <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 font-mono text-[11px] uppercase tracking-[0.14em] tabular-nums text-neutral-500">
                        <span className="text-neutral-300">
                          {format(t.weekLabel, { n: week.index })}
                        </span>
                        <span aria-hidden>·</span>
                        <span>
                          {formatYmdRange(
                            week.firstYmd,
                            week.lastYmd,
                            locale,
                            t
                          )}
                        </span>
                      </h3>
                    )}
                    <div className="flex flex-col gap-2">
                      {week.days.map((evening) => (
                        <EveningCard
                          key={`${phase.key}::${evening.key}`}
                          evening={evening}
                          state={schedule.states.get(evening) ?? 'upcoming'}
                          tz={tz}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })
        )}

        <div className="mt-10 flex flex-wrap gap-4 text-sm">
          <Link
            href={`/tournament/${tournamentIdentifier}/matches`}
            className="text-[var(--color-violet-200)] transition hover:text-white"
          >
            {t.viewAllTournament}
          </Link>
          <Link
            href={`/tournament/${tournamentIdentifier}`}
            className="text-neutral-400 transition hover:text-white"
          >
            {t.viewStandings}
          </Link>
        </div>
      </main>
    </div>
  );
}

const timelineSeo: SeoProps = {
  title: {
    fr: 'Timeline 2026 — calendrier du tournoi',
    en: 'Timeline 2026 — tournament schedule',
  },
  description: {
    fr: "Feuille de route OW Women's Cup 2026 : journée contre la transphobie, préparation estivale, calendrier des soirées de match et grandes finales.",
    en: "OW Women's Cup 2026 roadmap: day against transphobia, summer prep, match-night schedule and grand finals.",
  },
};

Timeline2026Page.seo = timelineSeo;

export default Timeline2026Page;
