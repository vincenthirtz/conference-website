// pages/scrim.tsx
// Public landing page that explains the scrim system and lists our active
// teams. Each team links to /team/[slug] where the public scrim form lives.

import Link from 'next/link';
import Image from 'next/image';
import type { GetStaticProps } from 'next';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT, format } from '@/lib/i18n/useT';
import nsScrimLanding from '@/lib/i18n/locales/fr/scrimLanding';

type ScrimDict = typeof nsScrimLanding.fr;

type ScrimTeam = {
  id: string;
  slug: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  open_for_scrim: boolean | null;
};

type Props = {
  teams: ScrimTeam[];
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  let teams: ScrimTeam[] = [];

  if (supabaseAdmin) {
    // S5d: getStaticProps → DEFAULT_TENANT_ID (TODO(S7) — SSR/ISR per tenant).
    const { data } = await supabaseAdmin
      .from('teams')
      .select('id, slug, name, short_name, logo_url, country, open_for_scrim')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('is_active', true)
      .order('name', { ascending: true });
    teams = (data || []) as ScrimTeam[];
  }

  return {
    props: { teams },
    revalidate: 600,
  };
};

const getSteps = (t: ScrimDict) => [
  { title: t.step1Title, body: t.step1Body },
  { title: t.step2Title, body: t.step2Body },
  { title: t.step3Title, body: t.step3Body },
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function ScrimPage({ teams }: Props) {
  const t = useT(nsScrimLanding);
  const steps = getSteps(t);
  const openTeams = teams.filter((team) => team.open_for_scrim === true);
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="container mx-auto max-w-5xl px-4 pt-24 pb-16">
        <section className="mb-10 text-center">
          <span className="inline-block px-3 py-1 rounded-full border border-[var(--color-green)]/40 bg-[var(--color-green)]/10 text-[var(--color-green-light)] text-xs uppercase tracking-wide mb-4">
            {t.badge}
          </span>
          <Heading typeStyle="heading-lg" className="text-brand-gradient mb-3">
            {t.heading}
          </Heading>
          <span className="brand-rule mx-auto mb-3" aria-hidden />
          <Paragraph
            typeStyle="body-md"
            textColor="text-gray-300"
            className="max-w-2xl mx-auto"
          >
            {t.subtitle}
          </Paragraph>
        </section>

        <section className="mb-12 grid grid-cols-1 md:grid-cols-3 gap-4">
          {steps.map((step, i) => (
            <div
              key={step.title}
              className="card-brand rounded-2xl border border-white/10 bg-white/[0.03] p-5"
            >
              <div className="flex items-center gap-3 mb-2">
                <span className="w-8 h-8 rounded-full bg-[var(--color-green)]/20 border border-[var(--color-green)]/40 text-[var(--color-green-light)] text-sm font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <p className="text-sm font-semibold text-white">{step.title}</p>
              </div>
              <p className="text-sm text-gray-400">{step.body}</p>
            </div>
          ))}
        </section>

        <section className="mb-12">
          <div className="rounded-2xl border border-[var(--color-green)]/40 bg-[var(--color-green)]/[0.06] p-5 sm:p-6">
            <div className="flex items-center gap-2 mb-4">
              <span className="w-2 h-2 rounded-full bg-[var(--color-green-light)] animate-pulse" />
              <Heading typeStyle="heading-sm" className="text-white">
                {t.openTeamsHeading}
              </Heading>
            </div>

            {openTeams.length === 0 ? (
              <Paragraph typeStyle="body-sm" textColor="text-gray-400">
                {t.openTeamsEmpty}
              </Paragraph>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {openTeams.map((team) => (
                  <Link
                    key={team.id}
                    href={`/team/${encodeURIComponent(team.slug || team.id)}`}
                  >
                    <div className="group flex items-center gap-3 rounded-2xl border border-[var(--color-green)]/40 bg-black/40 p-4 hover:border-[var(--color-green)]/70 hover:bg-[var(--color-green)]/10 transition-colors h-full">
                      {team.logo_url ? (
                        <Image
                          src={team.logo_url}
                          alt=""
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 border border-white/10 flex items-center justify-center text-sm font-semibold text-neutral-400 flex-shrink-0">
                          {initials(team.short_name || team.name)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white truncate group-hover:text-[var(--color-green-light)]">
                          {team.name}
                        </p>
                        <span className="text-xs text-[var(--color-green-light)]">
                          {t.openTeamsCta} →
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
            <Heading typeStyle="heading-sm" className="text-white">
              {format(t.teamsHeading, { count: teams.length })}
            </Heading>
            <Link
              href="/tournaments"
              className="text-xs text-gray-400 hover:text-white"
            >
              {t.viewTournaments}
            </Link>
          </div>

          {teams.length === 0 ? (
            <Paragraph typeStyle="body-sm" textColor="text-gray-400">
              {t.noTeams}
            </Paragraph>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {teams.map((team) => (
                <Link
                  key={team.id}
                  href={`/team/${encodeURIComponent(team.slug || team.id)}`}
                >
                  <div className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 p-4 hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/5 transition-colors">
                    {team.logo_url ? (
                      <Image
                        src={team.logo_url}
                        alt=""
                        width={48}
                        height={48}
                        className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neutral-800 to-neutral-900 border border-white/10 flex items-center justify-center text-sm font-semibold text-neutral-400 flex-shrink-0">
                        {initials(team.short_name || team.name)}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate group-hover:text-[var(--color-green-light)]">
                        {team.name}
                      </p>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {team.short_name && <span>{team.short_name}</span>}
                        {team.country && (
                          <>
                            {team.short_name && (
                              <span className="text-gray-700">•</span>
                            )}
                            <span>{team.country}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <span className="text-xs text-[var(--color-green-light)] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                      {t.propose}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

const scrimSeo: SeoProps = {
  title: {
    fr: 'Proposer un scrim',
    en: 'Propose a scrim',
  },
  description: {
    fr: 'Propose un scrim à une équipe de l’OW Women’s Cup. Formulaire ouvert, pas besoin de compte — le capitaine te recontactera directement.',
    en: 'Propose a scrim to an OW Women’s Cup team. Open form, no account needed — the captain will get back to you directly.',
  },
};

ScrimPage.seo = scrimSeo;

export default ScrimPage;
