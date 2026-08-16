// pages/scrims.tsx
// Page publique : liste des scrims (sessions de matchs amicaux) publics.

import { GetStaticProps } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { useMemo } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { loadLadder, type LadderRow } from '@/utils/scrims/ladder';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { logger } from '../utils/logger';
import nsScrimsPage from '@/lib/i18n/locales/fr/scrimsPage';

type ScrimsDict = typeof nsScrimsPage.fr;

type ScrimTeam = {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
};

type PublicScrim = {
  id: string;
  name: string;
  slug: string | null;
  status: string;
  scheduled_date: string | null;
  stream_url: string | null;
  team1: ScrimTeam | null;
  team2: ScrimTeam | null;
};

type ScrimsPageProps = {
  scrims: PublicScrim[];
  /** Classement permanent des scrims (R8) — vide tant qu'aucun n'est rapporté. */
  ladder: LadderRow[];
};

export const getStaticProps: GetStaticProps<ScrimsPageProps> = async () => {
  if (!supabaseAdmin) {
    return { props: { scrims: [], ladder: [] }, revalidate: 60 };
  }

  // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — passer en SSR/ISR).
  const { data, error } = await supabaseAdmin
    .from('scrims')
    .select(
      `
      id, name, slug, status, scheduled_date, stream_url,
      team1:teams!scrims_team1_id_fkey(id, name, slug, logo_url),
      team2:teams!scrims_team2_id_fkey(id, name, slug, logo_url)
      `
    )
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_public', true)
    .neq('status', 'draft')
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[scrims] fetch error:', error);
    return { props: { scrims: [], ladder: [] }, revalidate: 60 };
  }

  // Classement calculé à la volée depuis les scrims rapportés (R8).
  const ladder = await loadLadder(DEFAULT_TENANT_ID);

  return {
    props: { scrims: (data || []) as unknown as PublicScrim[], ladder },
    revalidate: 300,
  };
};

function formatDate(d: string | null, locale: string, tbd: string) {
  if (!d) return tbd;
  try {
    return new Date(d).toLocaleString(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function statusLabel(status: string, t: ScrimsDict) {
  switch (status) {
    case 'scheduled':
      return t.statusScheduled;
    case 'running':
      return t.statusRunning;
    case 'completed':
      return t.statusCompleted;
    case 'cancelled':
      return t.statusCancelled;
    default:
      return status;
  }
}

function statusColor(status: string) {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'running':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'completed':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'cancelled':
      return 'bg-red-500/20 text-red-300 border-red-500/30';
    default:
      return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  }
}

function ScrimsPage({ scrims, ladder }: ScrimsPageProps) {
  const t = useT(nsScrimsPage);
  const { upcoming, running, past } = useMemo(() => {
    const upcoming: PublicScrim[] = [];
    const running: PublicScrim[] = [];
    const past: PublicScrim[] = [];
    for (const s of scrims) {
      if (s.status === 'running') running.push(s);
      else if (s.status === 'completed' || s.status === 'cancelled')
        past.push(s);
      else upcoming.push(s);
    }
    return { upcoming, running, past };
  }, [scrims]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
        <Heading
          level="h1"
          className="text-brand-gradient !text-4xl md:!text-5xl"
        >
          {t.title}
        </Heading>
        <span className="brand-rule mt-3" aria-hidden />
        <Paragraph className="text-neutral-400 mt-3 max-w-2xl">
          {t.subtitle}
        </Paragraph>

        {/* Classement permanent (R8). Masqué tant qu'aucun scrim n'a été
            rapporté : un tableau vide n'apprend rien et donne l'impression
            d'une fonctionnalité cassée. */}
        {ladder.length > 0 && (
          <section className="mt-10" aria-labelledby="scrim-ladder-heading">
            <h2
              id="scrim-ladder-heading"
              className="text-lg font-semibold text-white"
            >
              {t.ladderTitle}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">{t.ladderSubtitle}</p>
            <div className="mt-4 overflow-x-auto rounded-2xl border border-neutral-700/50">
              <table className="w-full text-sm">
                <thead className="bg-neutral-900/60 text-neutral-400">
                  <tr>
                    <th scope="col" className="px-4 py-2.5 text-left w-12">
                      #
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-left">
                      {t.ladderTeam}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      {t.ladderPlayed}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      {t.ladderRecord}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      {t.ladderDiff}
                    </th>
                    <th scope="col" className="px-4 py-2.5 text-right">
                      {t.ladderPoints}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-700/50">
                  {ladder.map((row) => (
                    <tr key={row.teamId} className="hover:bg-neutral-800/40">
                      <td className="px-4 py-2.5 font-semibold">{row.rank}</td>
                      <td className="px-4 py-2.5">
                        {row.slug ? (
                          <Link
                            href={`/team/${row.slug}`}
                            className="hover:underline"
                          >
                            {row.teamName}
                          </Link>
                        ) : (
                          row.teamName
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right text-neutral-400">
                        {row.played}
                      </td>
                      <td className="px-4 py-2.5 text-right text-neutral-400">
                        {row.won}-{row.drawn}-{row.lost}
                      </td>
                      <td className="px-4 py-2.5 text-right text-neutral-400">
                        {row.scoreDiff > 0
                          ? `+${row.scoreDiff}`
                          : row.scoreDiff}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        {row.points}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {scrims.length === 0 && (
          <div className="mt-10 rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-8 text-center text-neutral-400">
            {t.emptyBefore}{' '}
            <Link
              href="/scrim"
              className="text-[var(--color-green-light)] hover:underline"
            >
              {t.emptyLink}
            </Link>
            {t.emptyAfter}
          </div>
        )}

        {running.length > 0 && (
          <ScrimSection title={t.sectionRunning} scrims={running} />
        )}
        {upcoming.length > 0 && (
          <ScrimSection title={t.sectionUpcoming} scrims={upcoming} />
        )}
        {past.length > 0 && (
          <ScrimSection title={t.sectionPast} scrims={past} />
        )}
      </div>
    </div>
  );
}

function ScrimSection({
  title,
  scrims,
}: {
  title: string;
  scrims: PublicScrim[];
}) {
  const t = useT(nsScrimsPage);
  const locale = useLocale();
  return (
    <section className="mt-10">
      <h2 className="text-xl font-semibold mb-4 text-neutral-200 flex items-center gap-2">
        <span className="brand-dot h-2 w-2 rounded-full" aria-hidden />
        {title}
      </h2>
      <div className="grid gap-3">
        {scrims.map((s) => (
          <Link
            key={s.id}
            href={`/scrim/${s.slug || s.id}`}
            className="block bg-neutral-800/50 hover:bg-neutral-800 border border-neutral-700/50 rounded-xl px-5 py-4 transition-colors"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-semibold border ${statusColor(
                    s.status
                  )}`}
                >
                  {statusLabel(s.status, t)}
                </span>
                <span className="font-medium truncate">{s.name}</span>
              </div>
              <div className="text-xs text-neutral-400">
                {formatDate(s.scheduled_date, locale, t.dateTbd)}
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3 text-sm">
              <TeamPill team={s.team1} />
              <span className="text-neutral-500">{t.vs}</span>
              <TeamPill team={s.team2} />
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function TeamPill({ team }: { team: ScrimTeam | null }) {
  const t = useT(nsScrimsPage);
  if (!team)
    return <span className="text-neutral-500 italic">{t.teamTbd}</span>;
  return (
    <span className="inline-flex items-center gap-2">
      {team.logo_url ? (
        <Image
          src={team.logo_url}
          alt=""
          width={20}
          height={20}
          className="rounded-sm"
        />
      ) : null}
      <span>{team.name}</span>
    </span>
  );
}

const scrimsSeo: SeoProps = {
  title: {
    fr: 'Scrims publics — matchs amicaux Overwatch',
    en: 'Public scrims — Overwatch practice matches',
  },
  description: {
    fr: "Consulte les scrims publics de l'OW Women's Cup : matchs amicaux Overwatch entre équipes féminines, calendrier, statut en direct et streams des rencontres.",
    en: "Browse the OW Women's Cup public scrims: friendly Overwatch practice matches between women's teams, schedule, live status and rencontre streams.",
  },
};

ScrimsPage.seo = scrimsSeo;

export default ScrimsPage;
