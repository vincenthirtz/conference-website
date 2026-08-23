import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import ProductionPartner from '@/components/Production/ProductionPartner';
import nsTimeline2026 from '@/lib/i18n/locales/fr/timeline2026';

type Timeline2026Dict = typeof nsTimeline2026.fr;

const WOMEN_TOURNAMENT_ID_2026 = 'e8fa740c-d92b-49d8-a654-05a37d0eea3b';
const TWITCH_URL = 'https://www.twitch.tv/womens_cup';

type TimelineItem = {
  id: string;
  title: string;
  period: string;
  description: string;
  badge?: string;
};

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

type DayGroup = {
  key: string;
  label: string;
  matches: SimpleMatch[];
};

type Props = {
  matches: SimpleMatch[];
  tournamentSlug: string | null;
};

const frenchMonthMap: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
  // Libellés EN : la détection du jalon « en cours » lit `period`, qui est
  // désormais traduit — on accepte donc aussi les mois anglais.
  january: 0,
  february: 1,
  march: 2,
  april: 3,
  may: 4,
  june: 5,
  july: 6,
  august: 7,
  september: 8,
  october: 9,
  november: 10,
  december: 11,
};

const getTimeline = (t: Timeline2026Dict): TimelineItem[] => [
  {
    id: 'transphobia-day',
    title: t.item1Title,
    period: t.item1Period,
    description: t.item1Desc,
    badge: t.item1Badge,
  },
  {
    id: 'summer',
    title: t.item2Title,
    period: t.item2Period,
    description: t.item2Desc,
  },
  {
    id: 'main-event',
    title: t.item3Title,
    period: t.item3Period,
    description: t.item3Desc,
    badge: t.item3Badge,
  },
];

export const getStaticProps: GetStaticProps<Props> = async () => {
  let matches: SimpleMatch[] = [];
  let tournamentSlug: string | null = null;

  if (supabaseAdmin) {
    // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
    const [matchesRes, tournamentRes] = await Promise.all([
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
    ]);

    if (!matchesRes.error && matchesRes.data) {
      matches = matchesRes.data as unknown as SimpleMatch[];
    }
    tournamentSlug = tournamentRes.data?.slug ?? null;
  }

  return {
    props: { matches, tournamentSlug },
    revalidate: 300,
  };
};

function groupMatchesByDay(
  matches: SimpleMatch[],
  t: Timeline2026Dict,
  locale: string
): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const m of matches) {
    const d = m.scheduled_at ? new Date(m.scheduled_at) : null;
    const key = d ? d.toISOString().slice(0, 10) : 'unscheduled';
    const label = d
      ? d.toLocaleDateString(locale, {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
        })
      : t.dateTbd;

    if (!groups.has(key)) {
      groups.set(key, { key, label, matches: [] });
    }
    groups.get(key)!.matches.push(m);
  }

  const arr = Array.from(groups.values());
  arr.sort((a, b) => {
    if (a.key === 'unscheduled') return 1;
    if (b.key === 'unscheduled') return -1;
    return a.key.localeCompare(b.key);
  });

  return arr;
}

function formatMatchTime(
  iso: string | null,
  t: Timeline2026Dict,
  locale: string
): string {
  if (!iso) return t.timeTbd;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return t.timeTbd;
  return d.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMatchStatusInfo(
  status: string,
  t: Timeline2026Dict
): { label: string; cls: string } {
  switch (status) {
    case 'pending':
    case 'upcoming':
      return {
        label: t.statusUpcoming,
        cls: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40',
      };
    case 'ongoing':
    case 'running':
      return {
        label: t.statusOngoing,
        cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/40',
      };
    case 'completed':
    case 'finished':
      return {
        label: t.statusFinished,
        cls: 'bg-gray-500/15 text-gray-200 border-gray-500/40',
      };
    default:
      return {
        label: status,
        cls: 'bg-white/10 text-white border-white/30',
      };
  }
}

function MatchRow({ match }: { match: SimpleMatch }) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const t1 = match.team1?.short_name || match.team1?.name || t.teamFallback1;
  const t2 =
    match.team2?.short_name ||
    match.team2?.name ||
    (match.is_bye ? t.bye : t.teamFallback2);

  const isFinished = match.status === 'finished';
  const hasScores =
    match.team1_score !== null &&
    match.team1_score !== undefined &&
    match.team2_score !== null &&
    match.team2_score !== undefined;
  const scoreLabel =
    isFinished || hasScores
      ? `${match.team1_score ?? 0} – ${match.team2_score ?? 0}`
      : '';

  const status = getMatchStatusInfo(match.status, t);

  return (
    <Link
      href={`/match/${match.id}`}
      className="group grid grid-cols-[64px_minmax(0,1fr)_auto] gap-3 items-center px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/10 transition hover:border-[var(--color-yellow)]/50 hover:bg-[var(--color-yellow)]/5"
    >
      <span className="text-sm font-mono text-[var(--color-yellow)]">
        {formatMatchTime(match.scheduled_at, t, locale)}
      </span>

      <div className="min-w-0">
        <p className="text-sm text-white truncate">
          <span className="font-medium">{t1}</span>
          {!match.is_bye && (
            <>
              <span className="text-gray-500 mx-1">{t.vs}</span>
              <span className="font-medium">{t2}</span>
            </>
          )}
          {match.is_bye && <span className="text-gray-500"> {t.bye}</span>}
        </p>
        <div className="flex flex-wrap gap-1.5 text-[10px] text-gray-400 mt-0.5">
          {match.stage?.name && <span>{match.stage.name}</span>}
          {match.round_name && (
            <>
              <span className="text-gray-600">·</span>
              <span>{match.round_name}</span>
            </>
          )}
          {match.match_format && (
            <>
              <span className="text-gray-600">·</span>
              <span>{match.match_format.toUpperCase()}</span>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span
          className={`text-[10px] px-2 py-[1px] rounded-full border ${status.cls}`}
        >
          {status.label}
        </span>
        {scoreLabel && (
          <span className="text-xs font-semibold text-emerald-300 tabular-nums">
            {scoreLabel}
          </span>
        )}
      </div>
    </Link>
  );
}

function Timeline2026Page({ matches, tournamentSlug }: Props) {
  const t = useT(nsTimeline2026);
  const locale = useLocale();
  const timeline = getTimeline(t);
  const tournamentIdentifier = tournamentSlug || WOMEN_TOURNAMENT_ID_2026;
  const now = new Date();
  const currentIdx = timeline.findIndex((item) => {
    const [monthLabel, yearLabel] = item.period.split(' ');
    const normalized = monthLabel
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
    const monthNumber = frenchMonthMap[normalized];
    const yearNumber = parseInt(yearLabel, 10);
    return monthNumber === now.getMonth() && yearNumber === now.getFullYear();
  });

  const highlightPercent =
    currentIdx >= 0 && timeline.length > 1
      ? (currentIdx / (timeline.length - 1)) * 100
      : null;

  const grouped = groupMatchesByDay(matches, t, locale);
  const totalMatches = matches.length;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 w-[420px] h-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 w-[360px] h-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-32 pb-16 relative">
          <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
            {t.heroEyebrow}
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mt-3 leading-tight text-brand-gradient">
            {t.heroTitle}
          </h1>
          <span className="brand-rule mt-4" aria-hidden />
          <p className="text-neutral-300 text-lg mt-4 max-w-2xl">
            {t.heroSubtitle}
          </p>
        </div>
      </div>

      {/* Production — qui diffuse les matchs de l'édition */}
      <div className="relative max-w-7xl mx-auto px-6 pb-10">
        {/* `lg:pl-14` : le rail de réseaux sociaux flottant (fixed, left-5, à
            partir de lg) recouvre le bord gauche de ce conteneur entre 1024 et
            ~1400 px. Les blocs de la timeline se décalent déjà de la même
            façon. */}
        <div className="max-w-6xl lg:pl-14">
          <ProductionPartner variant="compact" />
        </div>
      </div>

      {/* Timeline */}
      <div className="relative max-w-7xl mx-auto px-6 pb-12">
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-4 w-2 rounded-full bg-gradient-to-b from-purple-400 via-purple-300/40 to-pink-500 shadow-[0_0_25px_rgba(178,75,224,0.4)]"
          />
          {highlightPercent !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-4 w-3 h-20 -translate-y-1/2 rounded-full bg-gradient-to-b from-amber-300 via-pink-400 to-amber-200 blur-md opacity-70"
              style={{ top: `${highlightPercent}%` }}
            />
          )}

          <div className="grid max-w-6xl grid-cols-1 gap-10">
            {timeline.map((item, idx) => {
              const isCurrent = idx === currentIdx;
              return (
                <div key={item.id} className="relative pl-14">
                  <div
                    className={`absolute top-6 h-4 w-4 rounded-full bg-gradient-to-br from-purple-300 to-pink-500 border-2 border-white/60 shadow-[0_0_15px_rgba(219,39,119,0.65)] ${'left-3'} ${isCurrent ? 'scale-110 ring-4 ring-pink-400/40 animate-pulse' : ''}`}
                  />

                  <div
                    className={`bg-neutral-900 border rounded-2xl p-6 shadow-xl shadow-black/20 backdrop-blur ${
                      isCurrent
                        ? 'border-pink-400/40 shadow-[0_0_30px_rgba(236,72,153,0.3)]'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span
                        className={`text-xs uppercase tracking-[0.18em] ${
                          isCurrent ? 'text-pink-100' : 'text-neutral-400'
                        }`}
                      >
                        {item.period}
                      </span>
                      {item.badge && (
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full border ${
                            isCurrent
                              ? 'bg-pink-500/20 text-pink-50 border-pink-300/60'
                              : 'bg-purple-500/20 text-purple-100 border-purple-400/40'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <h3
                      className={`text-xl font-semibold mt-2 ${
                        isCurrent ? 'text-white' : ''
                      }`}
                    >
                      {item.title}
                    </h3>
                    <p className="text-neutral-300 text-sm mt-3 leading-relaxed">
                      {item.description}
                    </p>
                    {item.id === 'transphobia-day' && (
                      <div className="mt-4">
                        <a
                          href={TWITCH_URL}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--color-violet)] text-white transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
                        >
                          {t.followTwitch}
                        </a>
                      </div>
                    )}
                    {item.id === 'main-event' && (
                      <div className="mt-4">
                        <Link
                          href={`/team/create?tournament=${WOMEN_TOURNAMENT_ID_2026}`}
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-[var(--color-green)] text-black transition hover:bg-[var(--color-green-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green-light)]"
                        >
                          {t.registerTeam}
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Match calendar */}
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <div className="max-w-6xl">
          <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
                {t.calEyebrow}
              </p>
              <h2 className="text-3xl md:text-4xl font-bold mt-2 leading-tight text-brand-gradient">
                {t.calTitle}
              </h2>
              <span className="brand-rule mt-3" aria-hidden />
              <p className="text-neutral-300 text-base mt-2 max-w-2xl">
                {t.calSubtitle}
              </p>
            </div>
            <Link
              href={`/tournament/${tournamentIdentifier}/matches`}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-white/20 text-white transition hover:border-[var(--color-yellow)]/60 hover:bg-[var(--color-yellow)]/10 hover:text-[var(--color-yellow)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {t.viewAllTournament}
            </Link>
          </div>

          {totalMatches === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center">
              <p className="text-neutral-300">{t.emptyTitle}</p>
              <p className="text-neutral-500 text-sm mt-2">{t.emptySub}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {grouped.map((day) => (
                <div
                  key={day.key}
                  className="card-brand rounded-2xl bg-white/[0.03] p-4 sm:p-5"
                >
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-white capitalize">
                      {day.label}
                    </p>
                    <p className="text-xs text-gray-400">
                      {format(
                        day.matches.length > 1 ? t.match_other : t.match_one,
                        { count: day.matches.length }
                      )}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {day.matches.map((m) => (
                      <MatchRow key={m.id} match={m} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
