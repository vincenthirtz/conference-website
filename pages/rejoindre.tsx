// pages/rejoindre.tsx
//
// Le parcours « je joue seule » — lot 1 du backlog d'acquisition
// (docs/BACKLOG-acquisition-joueuses.md, constat A2).
//
// Avant cette page, une joueuse sans équipe n'avait littéralement rien à faire
// sur le site : le hero proposait « Créer une équipe » ou « Discord », et la
// FAQ d'inscription la renvoyait explicitement ailleurs. Or c'est le plus gros
// gisement d'acquisition — celles qui n'ont pas déjà cinq copines.
//
// Page 100 % statique (aucune donnée au build) : la liste est chargée côté
// client depuis /api/public/free-players, qui porte son propre cache court.
// Indexable — c'est aussi une page d'entrée SEO (« trouver une équipe Overwatch
// féminine »).

import { useCallback, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { ACTIVE_WOMEN_TOURNAMENT_ID } from '@/utils/activeEdition';
import { useT } from '@/lib/i18n/useT';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';
import JoinAsPlayerForm from '@/components/FreePlayers/JoinAsPlayerForm';
import FreePlayersList from '@/components/FreePlayers/FreePlayersList';

const DISCORD_INVITE = 'https://discord.gg/gERSsjC3Vd';
const CREATE_TEAM_HREF = `/team/create?tournament=${ACTIVE_WOMEN_TOURNAMENT_ID}`;

// JSON-LD : la question que se pose exactement la visiteuse cible. Reste en
// français comme les autres schémas du site (cf. inscription-2026).
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Peut-on participer sans avoir d’équipe ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Oui. Signale-toi sur la page « Rejoindre une équipe » : tu renseignes ton pseudo, les postes que tu joues et tes disponibilités, sans créer de compte. Les capitaines qui recrutent voient ta fiche et te contactent.",
      },
    },
    {
      '@type': 'Question',
      name: 'Faut-il un rang minimum pour jouer ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Non, aucun rang minimum. Le tournoi accueille tous les niveaux, débutantes comprises, et le format Swiss fait affronter des équipes de niveau équivalent au fil des rondes.",
      },
    },
    {
      '@type': 'Question',
      name: 'Mes coordonnées sont-elles publiques ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: "Non. Ton email et ton pseudo Discord ne sont visibles que par les capitaines connectées. La liste publique n’affiche que ton pseudo, tes postes et tes disponibilités.",
      },
    },
  ],
};

function RejoindrePage() {
  const t = useT(nsRejoindrePage);
  // Une publication réussie doit se voir immédiatement dans la liste juste en
  // dessous : sans ça, la joueuse doute que son envoi soit parti.
  const [refreshKey, setRefreshKey] = useState(0);
  const handlePublished = useCallback(() => setRefreshKey((k) => k + 1), []);

  const badges = [t.heroNoAccount, t.heroNoRank, t.heroFree];
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
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[var(--color-violet)]/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-[var(--color-green)]/20 blur-3xl" />
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
        <JoinAsPlayerForm onPublished={handlePublished} />
      </section>

      {/* Liste publique */}
      <div className="mx-auto max-w-6xl px-6 py-12">
        <FreePlayersList refreshKey={refreshKey} />
      </div>

      {/* Renvois : les deux autres portes d'entrée */}
      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6">
            <h2 className="font-bold text-white">{t.altTitle}</h2>
            <p className="mt-2 text-sm text-gray-300">{t.altDesc}</p>
            <Link
              href={CREATE_TEAM_HREF}
              className="mt-4 inline-block rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
            >
              {t.altCta}
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6">
            <h2 className="font-bold text-white">{t.discordTitle}</h2>
            <p className="mt-2 text-sm text-gray-300">{t.discordDesc}</p>
            <a
              href={DISCORD_INVITE}
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

const rejoindreSeo: SeoProps = {
  title: {
    fr: "Trouver une équipe Overwatch féminine — OW Women's Cup",
    en: "Find a women's Overwatch team — OW Women's Cup",
  },
  description: {
    fr: "Pas d'équipe ? Signale-toi sans créer de compte : les capitaines qui recrutent voient ta fiche et te contactent. Aucun rang minimum, tous les niveaux bienvenus.",
    en: "No team? Add yourself without creating an account: recruiting captains see your profile and reach out. No minimum rank, all levels welcome.",
  },
};

RejoindrePage.seo = rejoindreSeo;

export default RejoindrePage;
