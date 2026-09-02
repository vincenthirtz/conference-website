// pages/timeline-2026.tsx
//
// Le PARCOURS de l'édition 2026, présenté comme un vrai planning.
//
// Avant : trois jalons éditoriaux (mai / été / octobre) sur un rail dégradé
// pulsant, puis une liste de matchs groupés par jour. Deux objets sans rapport,
// aucune structure de compétition — la page ne disait ni où on en est, ni ce
// qui vient après. Le jalon « en cours » était même détecté en re-parsant un
// libellé de mois traduit (`frenchMonthMap`), donc faux dès qu'on lisait en
// anglais.
//
// Maintenant : la structure de la compétition EST la page. Trois bandes
// temporelles — avant-saison, saison régulière, finales — et dans la saison,
// une carte par JOURNÉE (round_name : J1…J7), avec sa fenêtre de dates, son
// avancement et ses matchs dépliables. La journée en cours (ou la prochaine)
// est la seule chose mise en avant.
//
// Deux règles tenues ici :
//   1. L'état vient des DONNÉES, jamais de l'horloge : « prochaine journée » =
//      première journée non terminée d'après le statut des matchs. Une dérivation
//      basée sur `new Date()` divergerait entre le rendu ISR et le client
//      (mismatch d'hydratation), et cette page est en `revalidate: 300`.
//   2. Seul le compte à rebours dépend de l'heure — il est donc rendu APRÈS
//      montage, jamais côté serveur.

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

/** Une JOURNÉE de compétition (round_name), avec son avancement. */
type RoundGroup = {
  key: string;
  /** Libellé court, tel que saisi côté staff : « J1 », « Grande finale »… */
  label: string;
  /** Phase à laquelle la journée appartient (nom de `tournament_stages`). */
  phase: string | null;
  matches: SimpleMatch[];
  firstAt: string | null;
  lastAt: string | null;
  played: number;
  live: boolean;
};

/** Une PHASE : un groupe de journées partageant la même étape de tournoi. */
type Phase = {
  key: string;
  label: string;
  rounds: RoundGroup[];
  firstAt: string | null;
  lastAt: string | null;
  /** Ce qu'il faut savoir pour LIRE la phase : son format de compétition. */
  note: string | null;
};

type Props = {
  matches: SimpleMatch[];
  tournamentSlug: string | null;
  teamCount: number;
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
        .select('slug')
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
    teamCount = teamsRes.count ?? 0;
  }

  return {
    props: { matches, tournamentSlug, teamCount },
    revalidate: 300,
  };
};

const FINISHED = new Set(['finished', 'completed', 'finalized']);
const LIVE = new Set(['ongoing', 'running', 'live']);

/**
 * Journées, dans l'ordre où elles se jouent. La clé est `round_name` : c'est
 * l'unité que le staff saisit et que les équipes emploient (« la J3 »), et la
 * seule qui fasse d'un tas de matchs un calendrier.
 */
function groupMatchesByRound(
  matches: SimpleMatch[],
  t: Timeline2026Dict
): RoundGroup[] {
  const groups = new Map<string, RoundGroup>();

  for (const m of matches) {
    const label = m.round_name?.trim() || t.roundUnnamed;
    const key = `${m.stage?.name ?? ''}::${label}`;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        label,
        phase: m.stage?.name ?? null,
        matches: [],
        firstAt: null,
        lastAt: null,
        played: 0,
        live: false,
      };
      groups.set(key, g);
    }
    g.matches.push(m);
    if (m.scheduled_at) {
      if (!g.firstAt || m.scheduled_at < g.firstAt) g.firstAt = m.scheduled_at;
      if (!g.lastAt || m.scheduled_at > g.lastAt) g.lastAt = m.scheduled_at;
    }
    if (FINISHED.has(m.status)) g.played += 1;
    if (LIVE.has(m.status)) g.live = true;
  }

  return Array.from(groups.values()).sort(sortByFirstAt);
}

function sortByFirstAt(
  a: { firstAt: string | null },
  b: { firstAt: string | null }
): number {
  if (!a.firstAt) return 1;
  if (!b.firstAt) return -1;
  return a.firstAt.localeCompare(b.firstAt);
}

/** Phases (étapes de tournoi), dans l'ordre chronologique. */
function groupRoundsByPhase(
  rounds: RoundGroup[],
  t: Timeline2026Dict
): Phase[] {
  const phases = new Map<string, Phase>();

  for (const r of rounds) {
    const label = r.phase?.trim() || t.phaseFinals;
    let p = phases.get(label);
    if (!p) {
      // Note de format : déduite des matchs eux-mêmes (nombre d'équipes par
      // journée, format des rencontres) plutôt qu'écrite en dur — la phrase
      // suit le tournoi, elle ne le décrit pas de mémoire.
      p = {
        key: label,
        label,
        rounds: [],
        firstAt: null,
        lastAt: null,
        note: null,
      };
      phases.set(label, p);
    }
    p.rounds.push(r);
    if (r.firstAt && (!p.firstAt || r.firstAt < p.firstAt))
      p.firstAt = r.firstAt;
    if (r.lastAt && (!p.lastAt || r.lastAt > p.lastAt)) p.lastAt = r.lastAt;
  }

  const list = Array.from(phases.values()).sort(sortByFirstAt);
  for (const p of list) {
    const formats = Array.from(
      new Set(
        p.rounds.flatMap((r) =>
          r.matches.map((m) => m.match_format?.toUpperCase()).filter(Boolean)
        )
      )
    ) as string[];
    const perRound = p.rounds[0]?.matches.length ?? 0;
    const uniform = p.rounds.every((r) => r.matches.length === perRound);
    if (p.rounds.length > 1 && uniform && formats.length === 1) {
      p.note = format(t.phaseNoteRounds, {
        rounds: p.rounds.length,
        perRound,
        format: formats[0],
      });
    } else if (formats.length === 1) {
      p.note = format(t.phaseNoteSingle, { format: formats[0] });
    }
  }
  return list;
}

function formatDay(iso: string | null, locale: string, t: Timeline2026Dict) {
  if (!iso) return t.dateTbd;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return t.dateTbd;
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
}

function formatRange(
  from: string | null,
  to: string | null,
  locale: string,
  t: Timeline2026Dict
) {
  if (!from) return t.dateTbd;
  const a = formatDay(from, locale, t);
  const b = formatDay(to, locale, t);
  return a === b ? a : `${a} → ${b}`;
}

/**
 * Jour d'un match DANS sa journée : « ven. 18 ». Le mois est déjà porté par
 * l'en-tête de la journée — le répéter sur chaque ligne poussait l'horaire sur
 * une seconde ligne et cassait l'alignement de la colonne.
 */
function formatWeekday(
  iso: string | null,
  locale: string,
  t: Timeline2026Dict
) {
  if (!iso) return t.dateTbd;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return t.dateTbd;
  return d.toLocaleDateString(locale, { weekday: 'short', day: '2-digit' });
}

/**
 * Jours restants avant `iso`, ou `null` si la date est passée / absente.
 * Hors composant : lire l'horloge est impur, et ça n'a rien à faire dans un
 * rendu — l'appelant s'en sert dans un effet, après montage.
 */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  if (isNaN(target)) return null;
  const days = Math.ceil((target - Date.now()) / 86_400_000);
  return days > 0 ? days : null;
}

function formatTime(iso: string | null, locale: string, t: Timeline2026Dict) {
  if (!iso) return t.timeTbd;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return t.timeTbd;
  return d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
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

function MatchRow({ match }: { match: SimpleMatch }) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const t1 = match.team1?.short_name || match.team1?.name || t.teamFallback1;
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? t.bye : t.teamFallback2);

  const done = FINISHED.has(match.status);
  const hasScores =
    match.team1_score !== null &&
    match.team1_score !== undefined &&
    match.team2_score !== null &&
    match.team2_score !== undefined;

  return (
    <Link
      href={`/match/${match.id}`}
      className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 transition hover:border-[color-mix(in_srgb,var(--color-violet)_45%,transparent)] hover:bg-white/[0.04] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
    >
      <span className="flex w-[92px] shrink-0 flex-col font-mono text-[11px] tabular-nums leading-tight sm:w-[124px] sm:flex-row sm:items-baseline sm:gap-1.5">
        <span className="uppercase tracking-[0.04em] text-neutral-500">
          {formatWeekday(match.scheduled_at, locale, t)}
        </span>
        <span className="text-white">
          {formatTime(match.scheduled_at, locale, t)}
        </span>
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

/** Une journée : en-tête cliquable + ses matchs. */
function RoundCard({
  round,
  state,
  defaultOpen,
}: {
  round: RoundGroup;
  state: 'done' | 'live' | 'next' | 'upcoming';
  defaultOpen: boolean;
}) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const total = round.matches.length;

  const statusChip =
    state === 'live' ? (
      <Chip tone="live">{t.roundLive}</Chip>
    ) : state === 'next' ? (
      <Chip tone="accent">{t.roundNext}</Chip>
    ) : state === 'done' ? (
      <Chip tone="done">{t.roundDone}</Chip>
    ) : (
      <Chip>{t.roundUpcoming}</Chip>
    );

  return (
    <details
      open={defaultOpen}
      className={`group rounded-xl border bg-[var(--color-surface)] transition ${
        state === 'next' || state === 'live'
          ? 'border-[color-mix(in_srgb,var(--color-violet)_45%,transparent)]'
          : 'border-white/10'
      } ${state === 'done' ? 'opacity-70' : ''}`}
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]">
        <span
          className={`rounded px-2 py-[3px] font-mono text-xs font-semibold ${
            state === 'next' || state === 'live'
              ? 'bg-[color-mix(in_srgb,var(--color-violet)_22%,transparent)] text-[var(--color-violet-200)]'
              : 'bg-white/[0.06] text-neutral-300'
          }`}
        >
          {round.label}
        </span>

        <span className="font-mono text-xs tabular-nums text-neutral-400">
          {formatRange(round.firstAt, round.lastAt, locale, t)}
        </span>

        <span className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[11px] tabular-nums text-neutral-500">
            {format(t.roundProgress, { played: round.played, total })}
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
        {round.matches.map((m) => (
          <MatchRow key={m.id} match={m} />
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

function Timeline2026Page({ matches, tournamentSlug, teamCount }: Props) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const tournamentIdentifier = tournamentSlug || WOMEN_TOURNAMENT_ID_2026;

  const rounds = groupMatchesByRound(matches, t);
  const phases = groupRoundsByPhase(rounds, t);
  const preseason = getPreseason(t);

  // « Où en est-on ? » se lit dans les STATUTS, pas dans l'horloge — sinon le
  // HTML rendu par l'ISR et celui du client divergent (cf. en-tête de fichier).
  const liveKey = rounds.find((r) => r.live)?.key ?? null;
  const nextKey =
    liveKey ?? rounds.find((r) => r.played < r.matches.length)?.key ?? null;

  const roundState = (r: RoundGroup): 'done' | 'live' | 'next' | 'upcoming' => {
    if (r.live) return 'live';
    if (r.played >= r.matches.length && r.matches.length > 0) return 'done';
    return r.key === nextKey ? 'next' : 'upcoming';
  };

  const firstMatchAt = rounds.find((r) => r.firstAt)?.firstAt ?? null;
  const lastMatchAt =
    [...rounds].reverse().find((r) => r.lastAt)?.lastAt ?? null;
  const playedTotal = rounds.reduce((n, r) => n + r.played, 0);

  const nextRound = rounds.find((r) => r.key === nextKey) ?? null;

  // Compte à rebours : la seule valeur dépendante de l'heure, donc calculée
  // après montage. Rendu serveur = rien, plutôt qu'une valeur déjà périmée.
  const [countdown, setCountdown] = useState<number | null>(null);
  useEffect(() => {
    setCountdown(daysUntil(nextRound?.firstAt ?? null));
  }, [nextRound?.firstAt]);

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
          {countdown !== null && nextRound && (
            <span className="inline-flex items-baseline gap-2 rounded-full border border-[color-mix(in_srgb,var(--color-violet)_45%,transparent)] bg-[color-mix(in_srgb,var(--color-violet)_12%,transparent)] py-1.5 pl-3 pr-4">
              <span className="font-mono text-base font-semibold tabular-nums text-[var(--color-violet-200)]">
                {format(t.countdownValue, { n: countdown })}
              </span>
              <span className="text-sm text-neutral-300">
                {format(t.countdownLabel, { round: nextRound.label })}
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
            { v: String(rounds.length), k: t.statRounds },
            {
              v: format(t.statMatchesValue, {
                played: playedTotal,
                total: matches.length,
              }),
              k: t.statMatches,
            },
            {
              v: formatRange(firstMatchAt, lastMatchAt, locale, t),
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

        {/* ── Compétition : une bande par phase, une carte par journée ───── */}
        {matches.length === 0 ? (
          <section className="mt-12 rounded-xl border border-white/10 bg-white/[0.03] p-8 text-center">
            <p className="text-neutral-300">{t.emptyTitle}</p>
            <p className="mt-2 text-sm text-neutral-500">{t.emptySub}</p>
          </section>
        ) : (
          phases.map((phase) => {
            const hasCurrent = phase.rounds.some((r) => r.key === nextKey);
            return (
              <section key={phase.key} className="mt-12">
                <BandHead
                  title={phase.label}
                  when={formatRange(phase.firstAt, phase.lastAt, locale, t)}
                  accent={hasCurrent}
                />
                {phase.note && (
                  <p className="mt-3 max-w-2xl text-sm text-neutral-400">
                    {phase.note}
                  </p>
                )}
                <div className="mt-4 flex flex-col gap-2">
                  {phase.rounds.map((round) => {
                    const state = roundState(round);
                    return (
                      <RoundCard
                        key={round.key}
                        round={round}
                        state={state}
                        defaultOpen={state === 'next' || state === 'live'}
                      />
                    );
                  })}
                </div>
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
    fr: "Feuille de route OW Women's Cup 2026 : journée contre la transphobie, préparation estivale, calendrier des matchs et grandes finales.",
    en: "OW Women's Cup 2026 roadmap: day against transphobia, summer prep, match schedule and grand finals.",
  },
};

Timeline2026Page.seo = timelineSeo;

export default Timeline2026Page;
