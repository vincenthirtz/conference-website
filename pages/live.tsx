import type { GetStaticProps } from 'next';
import dynamic from 'next/dynamic';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import LiveTwitchSection, {
  type TwitchChannel,
} from '@/components/Live/LiveTwitchSection';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { supabaseAdmin } from '@/utils/supabase';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT } from '@/lib/i18n/useT';
import { logger } from '@/utils/logger';

type LiveDict = ReturnType<typeof useT<'livePage'>>;

// LiveEventBanner depend de fetch + realtime supabaseClient — pas SSR-friendly,
// on le charge cote client uniquement.
const LiveEventBanner = dynamic(
  () => import('@/components/Live/LiveEventBanner'),
  { ssr: false }
);

const DISCORD_INVITE_URL = 'https://discord.gg/gERSsjC3Vd';
const ASSO_TWITCH_URL = 'https://twitch.tv/owwomenscup';

type Engagement = {
  title: string;
  description: string;
  badge?: string;
  extra?: React.ReactNode;
};

const getEngagements = (t: LiveDict): Engagement[] => [
  { title: t.eng1Title, description: t.eng1Desc },
  { title: t.eng2Title, description: t.eng2Desc },
  { title: t.eng3Title, description: t.eng3Desc },
  { title: t.eng4Title, description: t.eng4Desc },
  {
    title: t.eng5Title,
    badge: t.eng5Badge,
    description: t.eng5Desc,
    extra: (
      <a
        href={ASSO_TWITCH_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-violet-light)] underline decoration-[var(--color-violet)]/40 underline-offset-2 transition hover:text-white hover:decoration-[var(--color-violet-light)]"
      >
        twitch.tv/owwomenscup
        <svg
          className="h-3.5 w-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
          />
        </svg>
      </a>
    ),
  },
];

const getBonuses = (t: LiveDict): Engagement[] => [
  { title: t.bonus1Title, description: t.bonus1Desc },
  { title: t.bonus2Title, description: t.bonus2Desc },
  { title: t.bonus3Title, description: t.bonus3Desc },
  { title: t.bonus4Title, description: t.bonus4Desc },
  { title: t.bonus5Title, description: t.bonus5Desc },
];

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

function CardGrid({ items, accent }: { items: Engagement[]; accent: string }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.title}
          className="group card-brand rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition hover:-translate-y-0.5 hover:bg-white/[0.05]"
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-semibold text-white">{item.title}</h3>
            {item.badge && (
              <span
                className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] ${accent}`}
              >
                {item.badge}
              </span>
            )}
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-300">
            {item.description}
          </p>
          {item.extra}
        </div>
      ))}
    </div>
  );
}

function LivePage({ channels, loadError }: Props) {
  const t = useT('livePage');
  const engagements = getEngagements(t);
  const bonuses = getBonuses(t);
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-[var(--color-violet)]/25 blur-[120px]" />
          <div className="absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-[var(--color-green)]/15 blur-[100px]" />
          <div className="absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-[var(--color-yellow)]/10 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pt-36 pb-16 text-center">
          <LiveEventBanner />

          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-300 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-violet-light)] animate-pulse" />
            {t.heroBadge}
          </p>

          <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl md:text-6xl">
            <span className="block text-brand-gradient">{t.heroTitle}</span>
          </h1>
          <span className="brand-rule mx-auto mt-5" aria-hidden />

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            {t.heroSubtitle}
          </p>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-relaxed text-gray-300 backdrop-blur-xl">
            {t.heroBox}
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-20 px-4 pb-24 sm:px-6">
        {/* ── Tes engagements ─────────────────────────────── */}
        <section>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-violet-light)]">
              {t.engagementsEyebrow}
            </p>
            <Heading
              typeStyle="heading-md"
              className="mt-2 text-brand-gradient text-center"
            >
              {t.engagementsTitle}
            </Heading>
            <span className="brand-rule mx-auto mt-3" aria-hidden />
          </div>
          <CardGrid
            items={engagements}
            accent="border-[var(--color-green)]/30 bg-[var(--color-green)]/10 text-[var(--color-green-light)]"
          />
        </section>

        {/* ── Tes bonus ───────────────────────────────────── */}
        <section>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-yellow)]">
              {t.bonusesEyebrow}
            </p>
            <Heading
              typeStyle="heading-md"
              className="mt-2 text-brand-gradient text-center"
            >
              {t.bonusesTitle}
            </Heading>
            <span className="brand-rule mx-auto mt-3" aria-hidden />
          </div>
          <CardGrid
            items={bonuses}
            accent="border-[var(--color-violet)]/30 bg-[var(--color-violet)]/10 text-[var(--color-violet-light)]"
          />
        </section>

        {/* ── Callouts ────────────────────────────────────── */}
        <section className="grid gap-6 md:grid-cols-2">
          {/* Le principe clé — callout sombre */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0F0820] via-[#1c0f33] to-[#2a0d3d] p-8 shadow-2xl">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[var(--color-green)]/20 blur-[90px]"
              aria-hidden
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-green)]/30 bg-[var(--color-green)]/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-[var(--color-green-light)]">
                {t.calloutKeyBadge}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-gray-200">
                {t.calloutKeyBody}
              </p>
            </div>
          </div>

          {/* Notre ambition — callout clair (violet clair) */}
          <div className="relative overflow-hidden rounded-3xl border border-[var(--color-violet-light)]/30 bg-gradient-to-br from-[var(--color-violet)]/20 via-[var(--color-green)]/12 to-[var(--color-yellow)]/12 p-8 shadow-2xl">
            <div
              className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-[var(--color-violet)]/25 blur-[90px]"
              aria-hidden
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-violet-light)]/40 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-white">
                {t.calloutAmbitionBadge}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-gray-100">
                {t.calloutAmbitionBody}
              </p>
            </div>
          </div>
        </section>

        {/* ── Nos ambassadrices en direct (DB-driven) ─────── */}
        <section>
          {loadError ? (
            <div
              className="mx-auto max-w-md space-y-4 text-center"
              role="alert"
            >
              <h2 className="text-xl font-semibold text-white">
                {t.channelsErrorTitle}
              </h2>
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                {t.channelsErrorBody}
              </Paragraph>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
              >
                {t.retry}
              </button>
            </div>
          ) : (
            <LiveTwitchSection
              initialChannels={channels}
              eyebrow={t.channelsEyebrow}
              title={t.channelsTitle}
              subtitle={t.channelsSubtitle}
            />
          )}
        </section>

        {/* ── CTA final ───────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[var(--color-violet)]/20 via-[var(--color-green)]/10 to-[var(--color-yellow)]/10" />
          <div className="relative p-8 text-center sm:p-12">
            <Heading
              typeStyle="heading-md"
              className="text-brand-gradient text-center"
            >
              {t.ctaTitle}
            </Heading>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-gray-300">
              {t.ctaBody}
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 rounded-full bg-[var(--color-violet)] px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--color-violet-deep)]/40 transition-all hover:-translate-y-0.5 hover:bg-[var(--color-violet-deep)] hover:shadow-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
              >
                {t.ctaButton}
                <svg
                  className="h-4 w-4 transition-transform group-hover:translate-x-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14 5l7 7m0 0l-7 7m7-7H3"
                  />
                </svg>
              </a>
              <p className="max-w-md text-xs leading-relaxed text-gray-400">
                {t.ctaNoteBefore} <span className="italic">{t.ctaNoteEt}</span>{' '}
                {t.ctaNoteAfter}
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const liveSeo: SeoProps = {
  title: {
    fr: "Devenir Ambassadrice — Women's Cup",
    en: "Become an ambassador — Women's Cup",
  },
  description: {
    fr: "Rejoins le programme d'ambassadrices Twitch de l'OW Women's Cup : un partenariat gagnant-gagnant, tes engagements, tes bonus exclusifs et comment postuler.",
    en: "Join the OW Women's Cup Twitch ambassador program: a win-win partnership, your commitments, exclusive perks and how to apply.",
  },
};

LivePage.seo = liveSeo;

export default LivePage;
