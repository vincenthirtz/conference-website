// pages/[tenantSlug]/tournois.tsx
//
// POC multi-tenant path-prefix (S7a) — voir le commentaire d'en-tête de
// `utils/tenant.ts` pour la stratégie globale.
//
// URL : `/conference/tournois`, `/esport-club/tournois`, etc.
//
// - SSR (`getServerSideProps`) car le contenu dépend du tenant — pas de
//   cache statique mutualisé entre tenants. L'ISR par-tenant peut être
//   ajoutée plus tard si les pages deviennent trop lourdes.
// - `getTenantIdBySlug(slug)` résout le slug → tenant_id (cache 60s).
//   Slug inconnu → 404 Next.js.
// - Le rendu est délégué à `<TournamentsList />` (composant partagé avec
//   la page legacy `pages/tournaments.tsx`).

import type { GetServerSideProps } from 'next';
import TournamentsList, {
  type Tournament,
} from '@/components/Tournaments/TournamentsList';
import { supabaseAdmin } from '@/utils/supabase';
import { getTenantIdBySlug } from '@/utils/tenant';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { logger } from '@/utils/logger';

type Props = {
  tournaments: Tournament[];
  tenantSlug: string;
};

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const rawSlug = ctx.params?.tenantSlug;
  const tenantSlug = typeof rawSlug === 'string' ? rawSlug : null;

  if (!tenantSlug) {
    return { notFound: true };
  }

  const tenantId = await getTenantIdBySlug(tenantSlug);
  if (!tenantId) {
    // Slug inconnu, désactivé, ou supabaseAdmin indisponible → 404.
    return { notFound: true };
  }

  if (!supabaseAdmin) {
    return { props: { tournaments: [], tenantSlug } };
  }

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
    .eq('tenant_id', tenantId)
    .in('status', ['published', 'running', 'completed'])
    .order('start_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[tenant/tournois] fetch error', { tenantSlug, error });
    return { props: { tournaments: [], tenantSlug } };
  }

  return {
    props: {
      tournaments: (data || []) as Tournament[],
      tenantSlug,
    },
  };
};

function TenantTournamentsPage({ tournaments }: Props) {
  return <TournamentsList tournaments={tournaments} />;
}

const tenantTournamentsSeo: SeoProps = {
  title: 'Tournois Overwatch féminins — toutes les éditions',
  description:
    "Découvrez tous les tournois OW Women's Cup : passés, en cours et à venir. Brackets, résultats et équipes.",
};

TenantTournamentsPage.seo = tenantTournamentsSeo;

export default TenantTournamentsPage;
