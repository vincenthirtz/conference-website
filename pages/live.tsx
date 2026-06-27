import type { GetStaticProps } from 'next';
import dynamic from 'next/dynamic';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import LiveTwitchSection, {
  type TwitchChannel,
} from '@/components/Live/LiveTwitchSection';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { logger } from '@/utils/logger';

// LiveEventBanner depend de fetch + realtime supabaseClient — pas SSR-friendly,
// on le charge cote client uniquement.
const LiveEventBanner = dynamic(
  () => import('@/components/Live/LiveEventBanner'),
  { ssr: false }
);

type Props = {
  channels: TwitchChannel[];
  // Différencie une panne de chargement d'une absence légitime de chaînes.
  loadError: boolean;
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  if (!supabaseAdmin) {
    return { props: { channels: [], loadError: true }, revalidate: 60 };
  }

  // Static export -> no `req`, so we hard-code the conference tenant. Quand
  // on switchera vers du multi-tenant via subdomain/path-prefix (S7), il
  // faudra basculer cette page en `getServerSideProps`.
  // TODO(multi-tenant) — passer en `getServerSideProps` puis utiliser
  // `getTenantIdBySlug(slug)` (cf. POC `pages/[tenantSlug]/tournois.tsx`)
  // pour servir une variante `pages/[tenantSlug]/live.tsx`.
  const { data, error } = await supabaseAdmin
    .from('twitch_channels')
    .select('channel, label, badge, description, background_url')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[live] fetch channels error', error);
    return { props: { channels: [], loadError: true }, revalidate: 60 };
  }

  const channels: TwitchChannel[] = (data || []).map((row) => ({
    channel: row.channel,
    label: row.label,
    badge: row.badge,
    description: row.description,
    background: row.background_url,
  }));

  return { props: { channels, loadError: false }, revalidate: 300 };
};

function LivePage({ channels, loadError }: Props) {
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 pt-24 pb-20">
        <LiveEventBanner />
        {loadError ? (
          <div
            className="mt-12 mx-auto max-w-md text-center space-y-4"
            role="alert"
          >
            <h2 className="text-xl font-semibold text-white">
              Impossible de charger les chaînes
            </h2>
            <p className="text-sm text-gray-300">
              Une erreur est survenue de notre côté. Réessayez dans quelques
              instants.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-md bg-purple-500 hover:bg-purple-400 text-sm font-semibold text-white transition-colors"
            >
              Réessayer
            </button>
          </div>
        ) : (
          <LiveTwitchSection initialChannels={channels} />
        )}
      </div>
    </div>
  );
}

const liveSeo: SeoProps = {
  title: 'Live — Twitch & casts officiels',
  description:
    "Retrouvez nos chaînes partenaires, casts et analyses en direct pour l'OW Women's Cup 2026.",
};

LivePage.seo = liveSeo;

export default LivePage;
