// pages/recrutement.tsx
//
// Le MIROIR de /rejoindre : « les équipes qui recrutent ».
//
// /rejoindre couvre une seule moitié du problème — la joueuse sans équipe s'y
// signale. L'autre moitié n'existait nulle part : une capitaine à qui il manque
// une joueuse n'avait que le Discord, où l'annonce descend dans le fil en une
// heure. Les deux faces alimentent le même appariement, donc elles se
// ressemblent volontairement : même parcours, mêmes contraintes (aucun compte
// requis, trois champs obligatoires), même liste publique anonymisée.
//
// Page 100 % statique (aucune donnée au build) : la liste est chargée côté
// client depuis /api/public/team-openings. Indexable — c'est aussi une porte
// d'entrée SEO (« recruter une joueuse Overwatch »).

import { useCallback, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { socialUrl } from '@/config/socials';
import { useT } from '@/lib/i18n/useT';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import PostOpeningForm from '@/components/TeamOpenings/PostOpeningForm';
import TeamOpeningsList from '@/components/TeamOpenings/TeamOpeningsList';

// JSON-LD : les questions que se pose exactement la capitaine visée. Reste en
// français comme les autres schémas du site (cf. /rejoindre).
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Comment recruter une joueuse pour mon équipe Overwatch ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Publie une annonce sur la page « Les équipes qui recrutent » : nom de l'équipe, postes recherchés, créneaux, sans créer de compte. Les joueuses qui cherchent une équipe voient ton annonce et te contactent.",
      },
    },
    {
      '@type': 'Question',
      name: 'Faut-il que mon équipe soit déjà inscrite au tournoi ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Non. Tu peux publier une annonce avant d'inscrire ton équipe : compléter le roster passe généralement avant l'inscription.",
      },
    },
    {
      '@type': 'Question',
      name: 'Mes coordonnées sont-elles publiques ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Non. Ton email et ton pseudo Discord ne servent qu'à recevoir les candidatures. La liste publique n'affiche que le nom de l'équipe, les postes recherchés et vos créneaux.",
      },
    },
  ],
};

function RecrutementPage() {
  const t = useT(nsRecrutementPage);
  // Une publication réussie doit se voir immédiatement dans la liste juste en
  // dessous : sans ça, la capitaine doute que son annonce soit partie.
  const [refreshKey, setRefreshKey] = useState(0);
  const handlePublished = useCallback(() => setRefreshKey((k) => k + 1), []);

  const badges = [t.heroNoAccount, t.heroFast, t.heroFree];
  const steps = [
    { title: t.how1Title, desc: t.how1Desc },
    { title: t.how2Title, desc: t.how2Desc },
    { title: t.how3Title, desc: t.how3Desc },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      </Head>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[var(--color-green)]/25 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-[var(--color-violet)]/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-4xl px-6 pt-28 pb-12 text-center">
          <p className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="text-brand-gradient mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-gray-200">
            {t.heroSubtitle}
          </p>
          <ul className="mt-6 flex flex-wrap justify-center gap-2">
            {badges.map((badge) => (
              <li
                key={badge}
                className="rounded-full border border-[var(--color-green)]/30 bg-[var(--color-green)]/10 px-3 py-1.5 text-xs font-medium text-[var(--color-green-light)]"
              >
                {badge}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Comment ça marche */}
      <section className="mx-auto max-w-5xl px-6 py-10">
        <h2 className="text-center text-sm font-semibold uppercase tracking-[0.18em] text-gray-400">
          {t.howTitle}
        </h2>
        <ol className="mt-6 grid gap-5 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="relative rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6"
            >
              <span
                aria-hidden
                className="pointer-events-none absolute right-5 top-4 text-4xl font-black leading-none text-white/[0.06]"
              >
                {`0${i + 1}`}
              </span>
              <h3 className="font-bold text-white">{step.title}</h3>
              <p className="mt-2 text-sm text-gray-300">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Formulaire */}
      <section className="mx-auto max-w-2xl px-6 py-6">
        <h2 className="text-2xl font-extrabold tracking-tight text-white">
          {t.formTitle}
        </h2>
        <p className="mb-5 mt-1 text-sm text-gray-400">{t.formSubtitle}</p>
        <PostOpeningForm onPublished={handlePublished} />
      </section>

      {/* Liste publique */}
      <div className="mx-auto max-w-6xl px-6 py-12">
        <TeamOpeningsList refreshKey={refreshKey} />
      </div>

      {/* Renvois : l'autre face du miroir, et le Discord */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6">
            <h2 className="font-bold text-white">{t.altTitle}</h2>
            <p className="mt-2 text-sm text-gray-300">{t.altDesc}</p>
            <Link
              href="/rejoindre"
              className="mt-4 inline-block rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              {t.altCta}
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6">
            <h2 className="font-bold text-white">{t.discordTitle}</h2>
            <p className="mt-2 text-sm text-gray-300">{t.discordDesc}</p>
            <a
              href={socialUrl('discord')}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              {t.discordCta}
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

const recrutementSeo: SeoProps = {
  title: {
    fr: "Recruter une joueuse Overwatch — OW Women's Cup",
    en: "Recruit an Overwatch player — OW Women's Cup",
  },
  description: {
    fr: "Il te manque une joueuse ? Publie l'annonce de ton équipe sans créer de compte : postes recherchés, niveau, créneaux. Les joueuses qui cherchent une équipe te contactent.",
    en: 'One player short? Post your team opening without creating an account: roles wanted, level, practice slots. Players looking for a team will reach out.',
  },
};

RecrutementPage.seo = recrutementSeo;

export default RecrutementPage;
