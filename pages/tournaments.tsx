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
import { logger } from '../utils/logger';

type TournamentsPageProps = {
  tournaments: Tournament[];
};

export const getStaticProps: GetStaticProps<
  TournamentsPageProps
> = async () => {
  if (!supabaseAdmin) {
    return { props: { tournaments: [] }, revalidate: 60 };
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
    return { props: { tournaments: [] }, revalidate: 60 };
  }

  return {
    props: {
      tournaments: (data || []) as Tournament[],
    },
    revalidate: 600, // Rebuild every 10 minutes
  };
};

function TournamentsPage({ tournaments }: TournamentsPageProps) {
  return <TournamentsList tournaments={tournaments} />;
}

const tournamentsSeo: SeoProps = {
  title: 'Tournois Overwatch féminins — toutes les éditions',
  description:
    "Découvrez tous les tournois OW Women's Cup : passés, en cours et à venir. Brackets, résultats et équipes.",
};

TournamentsPage.seo = tournamentsSeo;

export default TournamentsPage;
