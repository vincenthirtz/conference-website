import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { supabaseAdmin } from '@/utils/supabase';
import { useT, format } from '@/lib/i18n/useT';

type PartnersDict = ReturnType<typeof useT<'partenairesPage'>>;

type Partner = {
  id: string;
  name: string;
  description: string;
  category: 'super' | 'major' | 'cultural';
  logo_url?: string | null;
  website_url?: string | null;
  note?: string | null;
  display_order: number;
};

type PartnersPageProps = {
  partners: Partner[];
};

export const getStaticProps: GetStaticProps<PartnersPageProps> = async () => {
  let partners: Partner[] = [];

  if (supabaseAdmin) {
    const { data, error } = await supabaseAdmin
      .from('partners')
      .select(
        'id, name, description, category, logo_url, website_url, note, display_order'
      )
      .eq('is_active', true)
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true });

    if (!error && data) {
      partners = data as Partner[];
    }
  }

  return {
    props: { partners },
    revalidate: 900,
  };
};

type PartnerCategory = {
  id: string;
  title: string;
  summary: string;
  accent: string;
  partners: Partner[];
};

const getHighlights = (t: PartnersDict) => [
  {
    title: t.h1Title,
    detail: t.h1Detail,
  },
  {
    title: t.h2Title,
    detail: t.h2Detail,
  },
  {
    title: t.h3Title,
    detail: t.h3Detail,
  },
];

const getCategoryMeta = (
  t: PartnersDict
): Record<string, { title: string; summary: string; accent: string }> => ({
  super: {
    title: t.superTitle,
    summary: t.superSummary,
    accent: 'from-amber-300 via-pink-400 to-purple-600',
  },
  major: {
    title: t.majorTitle,
    summary: t.majorSummary,
    accent: 'from-indigo-300 via-purple-400 to-pink-400',
  },
  cultural: {
    title: t.culturalTitle,
    summary: t.culturalSummary,
    accent: 'from-emerald-300 via-cyan-300 to-blue-500',
  },
});

function groupPartnersByCategory(
  partners: Partner[],
  t: PartnersDict
): PartnerCategory[] {
  const categories: PartnerCategory[] = [];
  const order = ['super', 'major', 'cultural'];
  const categoryMeta = getCategoryMeta(t);

  for (const catId of order) {
    const meta = categoryMeta[catId];
    const categoryPartners = partners.filter((p) => p.category === catId);
    categories.push({
      id: catId,
      title: meta.title,
      summary: meta.summary,
      accent: meta.accent,
      partners: categoryPartners,
    });
  }

  return categories;
}

function PartnersPage({ partners }: PartnersPageProps) {
  const t = useT('partenairesPage');
  const highlights = getHighlights(t);
  const partnerCategories = groupPartnersByCategory(partners, t);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-0 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
          <div className="absolute left-10 bottom-0 h-48 w-48 rounded-full bg-amber-400/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-brand-gradient sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <span className="brand-rule mt-4" aria-hidden />
          <p className="mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/partenaires/demande"
              className="rounded-full bg-[var(--color-violet)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {t.ctaBecomePartner}
            </Link>
            <Link
              href="/don"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {t.ctaDonate}
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-16 px-4 pb-20 sm:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="card-brand rounded-2xl bg-white/[0.05] p-5 shadow-xl shadow-black/20"
            >
              <p className="text-xs uppercase tracking-[0.16em] text-purple-200">
                {item.title}
              </p>
              <h2 className="mt-2 text-xl font-semibold text-white">
                {item.title}
              </h2>
              <p className="mt-2 text-sm text-gray-200">{item.detail}</p>
            </div>
          ))}
        </section>

        <section className="space-y-8">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.catEyebrow}
            </p>
            <h3 className="text-3xl font-bold text-brand-gradient">
              {t.catTitle}
            </h3>
            <span className="brand-rule" aria-hidden />
            <p className="text-sm text-gray-300 max-w-3xl">{t.catDesc}</p>
          </div>

          <div className="space-y-6">
            {partnerCategories.map((category) => (
              <div
                key={category.id}
                className="relative overflow-hidden card-brand rounded-3xl bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8"
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -left-10 -top-10 h-40 w-40 rounded-full opacity-40 blur-3xl bg-gradient-to-br ${category.accent}`}
                />
                <div className="relative space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.18em] text-gray-300">
                      {category.title}
                    </span>
                    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] uppercase tracking-[0.12em] text-white">
                      {category.id}
                    </span>
                  </div>
                  <h4 className="text-2xl font-semibold text-white">
                    {category.title}
                  </h4>
                  <p className="text-sm text-gray-200">{category.summary}</p>

                  <div className="grid gap-4 sm:grid-cols-2">
                    {category.partners.map((partner) => (
                      <div
                        key={partner.id}
                        className="rounded-2xl border border-white/10 bg-neutral-900/60 p-4 shadow-inner shadow-black/20"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-lg font-semibold text-white">
                            {partner.name}
                          </p>
                          {partner.note && (
                            <span className="rounded-full border border-amber-200/40 bg-amber-400/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                              {partner.note}
                            </span>
                          )}
                        </div>
                        {partner.logo_url && (
                          <div className="mt-3 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={partner.logo_url}
                              alt={format(t.logoAlt, { name: partner.name })}
                              width={120}
                              height={56}
                              loading="lazy"
                              decoding="async"
                              className="max-h-14 w-auto object-contain drop-shadow"
                            />
                          </div>
                        )}
                        <p className="mt-2 text-sm text-gray-300">
                          {partner.description}
                        </p>
                        {partner.website_url && (
                          <a
                            href={partner.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-green-light)] underline decoration-[var(--color-green)]/60 underline-offset-4 transition hover:text-white"
                          >
                            {t.discoverPartner}
                            <span aria-hidden>↗</span>
                          </a>
                        )}
                      </div>
                    ))}
                    {/* CTA to join */}
                    <Link
                      href="/partenaires/demande"
                      className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/[0.02] p-4 text-center transition hover:border-[var(--color-green)]/50 hover:bg-[var(--color-green)]/5"
                    >
                      <span className="text-2xl mb-2">+</span>
                      <span className="text-sm font-semibold text-[var(--color-green-light)]">
                        {t.joinProgram}
                      </span>
                      <span className="text-xs text-gray-400 mt-1">
                        {format(t.becomeCategory, {
                          category: category.title.toLowerCase(),
                        })}
                      </span>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section-brand-bg card-brand rounded-2xl bg-white/[0.05] p-6 sm:p-8 text-center">
          <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
            {t.contactEyebrow}
          </p>
          <h4 className="mt-2 text-2xl font-semibold text-brand-gradient">
            {t.contactTitle}
          </h4>
          <span className="brand-rule mx-auto mt-3" aria-hidden />
          <p className="mt-3 text-sm text-gray-200 max-w-3xl mx-auto">
            {t.contactDesc}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <Link
              href="/partenaires/demande"
              className="rounded-full bg-[var(--color-violet)] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {t.makeRequest}
            </Link>
            <Link
              href="/association"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {t.discoverAsso}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const partnersSeo: SeoProps = {
  title: {
    fr: 'Partenaires & sponsors — édition 2026',
    en: 'Partners & sponsors — 2026 edition',
  },
  description: {
    fr: "Découvrez les catégories de soutien de la prochaine édition de l'OW Women's Cup : super partenaire titre, partenaires majeurs et partenaires culturels.",
    en: "Explore the support tiers for the next OW Women's Cup edition: title partner, major partners and cultural partners.",
  },
};

PartnersPage.seo = partnersSeo;

export default PartnersPage;
