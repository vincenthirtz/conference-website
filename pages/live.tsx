import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import LiveTwitchSection, {
  type TwitchChannel,
} from '@/components/Live/LiveTwitchSection';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

type Props = {
  channels: TwitchChannel[];
};

export const getStaticProps: GetStaticProps<Props> = async () => {
  if (!supabaseAdmin) {
    return { props: { channels: [] }, revalidate: 60 };
  }

  const { data, error } = await supabaseAdmin
    .from('twitch_channels')
    .select('channel, label, badge, description, background_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[live] fetch channels error', error);
    return { props: { channels: [] }, revalidate: 60 };
  }

  const channels: TwitchChannel[] = (data || []).map((row) => ({
    channel: row.channel,
    label: row.label,
    badge: row.badge,
    description: row.description,
    background: row.background_url,
  }));

  return { props: { channels }, revalidate: 300 };
};

function LivePage({ channels }: Props) {
  return (
    <div className="min-h-screen">
      <div className="container mx-auto px-4 pt-24 pb-20">
        <LiveTwitchSection initialChannels={channels} />
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
