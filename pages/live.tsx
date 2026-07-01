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
import { logger } from '@/utils/logger';

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

const engagements: Engagement[] = [
  {
    title: 'Parler de nous en stream',
    description:
      'Évoquer l’association pendant tes lives — 5 à 10 minutes suffisent largement — pour présenter le projet et les tournois.',
  },
  {
    title: 'Une vraie démarche de soutien',
    description:
      'T’inscrire dans une logique d’entraide : faire vivre l’asso au-delà d’un simple affichage, en relayant régulièrement nos actus.',
  },
  {
    title: 'Logo en mode pub',
    description:
      'Afficher notre logo sur ton stream pendant les écrans de publicité.',
  },
  {
    title: 'Commande de tchat',
    description:
      'Mettre en place une commande dédiée qui explique à ton tchat notre projet, nos tournois et nos actions.',
  },
  {
    title: 'Stream sur la chaîne de l’asso',
    badge: 'optionnel',
    description:
      'Tu as la possibilité d’animer un stream sur la chaîne de l’association une fois par mois, pour faire gonfler nos vues et renforcer la visibilité commune. Aucune obligation : c’est une opportunité ouverte si tu le souhaites.',
    extra: (
      <a
        href={ASSO_TWITCH_URL}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-purple-300 underline decoration-purple-400/40 underline-offset-2 transition hover:text-purple-200 hover:decoration-purple-300"
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

const bonuses: Engagement[] = [
  {
    title: 'Adhésion gratuite',
    description:
      'Tu deviens membre de l’association sans avoir à payer la cotisation.',
  },
  {
    title: 'Accès anticipé aux infos',
    description:
      'Tu reçois nos annonces 24 à 48 h en avance (ex. recrutement de Happy) pour réagir avant tout le monde.',
  },
  {
    title: 'Pub prioritaire & exclusive',
    description:
      'Mise en avant réservée aux membres de l’asso : ta chaîne est promue en priorité.',
  },
  {
    title: 'Chaîne recommandée d’abord',
    description:
      'Quand on oriente la communauté vers des streams, la tienne passe en tête de liste.',
  },
  {
    title: 'Voix consultative',
    description:
      'Ton avis est sollicité et pris en compte, au même titre que le nôtre, sur d’éventuelles décisions ou modifications.',
  },
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
          className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-purple-400/40 hover:bg-white/[0.05]"
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
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ── Hero ─────────────────────────────────────────── */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-purple-600/25 blur-[120px]" />
          <div className="absolute right-0 top-0 h-[400px] w-[400px] rounded-full bg-fuchsia-500/15 blur-[100px]" />
          <div className="absolute bottom-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-pink-500/10 blur-[100px]" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pt-36 pb-16 text-center">
          <LiveEventBanner />

          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-300 backdrop-blur-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
            Partenariat &middot; Women&apos;s Cup
          </p>

          <h1 className="mt-5 text-4xl font-bold leading-[1.1] sm:text-5xl md:text-6xl">
            <span className="block text-gradient">Devenir Ambassadrice</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-300">
            Un partenariat gagnant-gagnant pour renforcer notre présence sur
            Twitch et t&apos;offrir une vraie visibilité en tant
            qu&apos;ambassadrice.
          </p>

          <div className="mx-auto mt-8 max-w-2xl rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm leading-relaxed text-gray-300 backdrop-blur-xl">
            Cette fiche résume tes engagements et les avantages exclusifs que tu
            obtiens en rejoignant l&apos;association. L&apos;idée : un échange
            équilibré, sans paiement ni goodies, où chacun y trouve son compte.
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-20 px-4 pb-24 sm:px-6">
        {/* ── Tes engagements ─────────────────────────────── */}
        <section>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-purple-300">
              Ce qu&apos;on attend
            </p>
            <Heading
              typeStyle="heading-md"
              className="mt-2 text-gradient text-center"
            >
              Tes engagements envers l&apos;asso
            </Heading>
          </div>
          <CardGrid
            items={engagements}
            accent="border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-200"
          />
        </section>

        {/* ── Tes bonus ───────────────────────────────────── */}
        <section>
          <div className="text-center">
            <p className="text-xs uppercase tracking-[0.18em] text-pink-300">
              Ce que tu y gagnes
            </p>
            <Heading
              typeStyle="heading-md"
              className="mt-2 text-gradient text-center"
            >
              Tes bonus exclusifs
            </Heading>
          </div>
          <CardGrid
            items={bonuses}
            accent="border-purple-400/30 bg-purple-500/10 text-purple-200"
          />
        </section>

        {/* ── Callouts ────────────────────────────────────── */}
        <section className="grid gap-6 md:grid-cols-2">
          {/* Le principe clé — callout sombre */}
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0F0820] via-[#1A0F2E] to-[#2C0B2C] p-8 shadow-2xl">
            <div
              className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-fuchsia-500/20 blur-[90px]"
              aria-hidden
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-fuchsia-200">
                Le principe clé
              </p>
              <p className="mt-4 text-sm leading-relaxed text-gray-200">
                Comme on ne peut ni te payer ni t&apos;envoyer de goodies (pour
                l&apos;instant), l&apos;exclusivité de la pub est le vrai levier
                : c&apos;est ce qui donne un intérêt concret à rejoindre
                l&apos;asso.
              </p>
            </div>
          </div>

          {/* Notre ambition — callout clair (violet clair) */}
          <div className="relative overflow-hidden rounded-3xl border border-purple-300/30 bg-gradient-to-br from-purple-500/20 via-fuchsia-500/15 to-pink-500/15 p-8 shadow-2xl">
            <div
              className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-purple-400/25 blur-[90px]"
              aria-hidden
            />
            <div className="relative">
              <p className="inline-flex items-center gap-2 rounded-full border border-purple-200/40 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-purple-100">
                Notre ambition à long terme
              </p>
              <p className="mt-4 text-sm leading-relaxed text-purple-50">
                Créer un véritable groupe Twitch Women&apos;s Cup qui regroupe
                toutes nos ambassadrices et ambassadeurs au même endroit — pour
                gagner en visibilité, faire vivre une communauté soudée et
                grandir ensemble.
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
                Impossible de charger les chaînes
              </h2>
              <Paragraph typeStyle="body-sm" textColor="text-gray-300">
                Une erreur est survenue de notre côté. Réessayez dans quelques
                instants.
              </Paragraph>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="rounded-md bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-400"
              >
                Réessayer
              </button>
            </div>
          ) : (
            <LiveTwitchSection
              initialChannels={channels}
              eyebrow="Nos ambassadrices"
              title="Suis nos ambassadrices en direct"
              subtitle="Retrouve nos streameuses ambassadrices et leurs lives Women's Cup."
            />
          )}
        </section>

        {/* ── CTA final ───────────────────────────────────── */}
        <section className="relative overflow-hidden rounded-3xl border border-white/10">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-purple-600/20 via-fuchsia-600/10 to-pink-600/10" />
          <div className="relative p-8 text-center sm:p-12">
            <Heading typeStyle="heading-md" className="text-gradient text-center">
              Devenir ambassadrice
            </Heading>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-gray-300">
              Rejoins-nous sur le Discord de l&apos;association et ouvre un ticket
              de la catégorie «&nbsp;Devenir ambassadrice&nbsp;» pour lancer ta
              candidature. On te répond au plus vite.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <a
                href={DISCORD_INVITE_URL}
                target="_blank"
                rel="noreferrer"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-purple-500 px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-purple-900/50"
              >
                Ouvrir un ticket sur le Discord
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
                Une fois sur le Discord, ouvre un ticket dans la catégorie
                «&nbsp;Devenir ambassadrice&nbsp;». Le programme est inclusif :
                ambassadrices <span className="italic">et</span> ambassadeurs
                sont les bienvenus.
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

const liveSeo: SeoProps = {
  title: "Devenir Ambassadrice — Women's Cup",
  description:
    "Rejoins le programme d'ambassadrices Twitch de l'OW Women's Cup : un partenariat gagnant-gagnant, tes engagements, tes bonus exclusifs et comment postuler.",
};

LivePage.seo = liveSeo;

export default LivePage;
