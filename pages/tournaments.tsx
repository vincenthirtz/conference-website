// pages/tournaments.tsx
// Page publique listant tous les tournois (passés, en cours, à venir).
//
// Version legacy mono-tenant : sert le tenant `DEFAULT_TENANT_ID`. Le
// composant `TournamentsList` est partagé avec
// `pages/[tenantSlug]/tournois.tsx` (POC multi-tenant path-prefix, S7a).

import type { GetStaticProps } from 'next';
import TournamentsList, {
  type Tournament,
} from '@/components/Tournaments/TournamentsList';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';
import { logger } from '../utils/logger';

type TournamentsPageProps = {
  tournaments: Tournament[];
  // Distingue une panne de chargement (Supabase indisponible / erreur requête)
  // d'une liste légitimement vide. Sans ce flag, une panne afficherait
  // « Aucun tournoi », message trompeur.
  loadError: boolean;
};

export const getStaticProps: GetStaticProps<
  TournamentsPageProps
> = async () => {
  if (!supabaseAdmin) {
    return { props: { tournaments: [], loadError: true }, revalidate: 60 };
  }

  // S5d: getStaticProps n'a pas accès au req → DEFAULT_TENANT_ID.
  // TODO(S7) — basculer en SSR ou ISR par-tenant.
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select(
      `
      id,
      name,
      slug,
      short_name,
      game,
      status,
      format,
      start_date,
      end_date,
      max_teams
    `
    )
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('status', ['published', 'running', 'completed'])
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[tournaments] fetch error:', error);
    return { props: { tournaments: [], loadError: true }, revalidate: 60 };
  }

  return {
    props: {
      tournaments: (data || []) as Tournament[],
      loadError: false,
    },
    revalidate: 600, // Rebuild every 10 minutes
  };
};

function TournamentsPage({ tournaments, loadError }: TournamentsPageProps) {
  const t = useT('tournamentsList');
  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="container mx-auto px-4 pt-24 pb-16 max-w-6xl">
          <section className="text-center py-16" role="alert">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                />
              </svg>
            </div>
            <h1 className="text-xl font-semibold mb-2">{t.loadErrorTitle}</h1>
            <p className="text-gray-400 mb-6">{t.loadErrorBody}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-purple-500 hover:bg-purple-400 text-sm font-semibold transition-colors"
            >
              {t.retry}
            </button>
          </section>
        </main>
      </div>
    );
  }

  return <TournamentsList tournaments={tournaments} />;
}

const tournamentsSeo: SeoProps = {
  title: {
    fr: 'Tournois Overwatch féminins — toutes les éditions',
    en: "Women's Overwatch tournaments — every edition",
  },
  description: {
    fr: "Découvrez tous les tournois OW Women's Cup : passés, en cours et à venir. Brackets, résultats et équipes.",
    en: "Browse every OW Women's Cup tournament: past, ongoing and upcoming. Brackets, results and teams.",
  },
};

TournamentsPage.seo = tournamentsSeo;

export default TournamentsPage;
