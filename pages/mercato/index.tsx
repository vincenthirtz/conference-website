// pages/mercato/index.tsx
//
// Le HUB MERCATO : la page unique du marché des équipes. Elle réunit ce que
// /rejoindre (les joueuses qui cherchent une équipe) et /recrutement (les
// équipes qui recrutent) portaient séparément — deux pages qui se renvoyaient
// l'une à l'autre et qu'il fallait connaître toutes les deux.
//
//   - un onglet par face du marché (`?onglet=joueuses|equipes`, lien
//     partageable ; les anciennes URL y redirigent, cf. next.config.js) ;
//   - des filtres sur les champs du mercato (poste, genre affiché ou profil
//     recherché, plateforme, contrôle, rang), appliqués à la liste chargée ;
//   - les deux formulaires à un clic (/mercato/joueuse, /mercato/equipe).
//
// Page 100 % statique (aucune donnée au build) : les listes sont chargées côté
// client depuis les routes publiques anonymisées. Indexable : c'est la porte
// d'entrée SEO des deux recherches (« trouver une équipe Overwatch »,
// « recruter une joueuse Overwatch »).

import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { socialUrl } from '@/config/socials';
import { useT } from '@/lib/i18n/useT';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import Tabs, {
  tabButtonId,
  tabPanelId,
  useQueryTab,
  type TabItem,
} from '@/components/ui/Tabs';
import MercatoFilterPanel from '@/components/Mercato/MercatoFilterPanel';
import FreePlayersList from '@/components/FreePlayers/FreePlayersList';
import TeamOpeningsList from '@/components/TeamOpenings/TeamOpeningsList';
import ResendLinkForm from '@/components/FreePlayers/ResendLinkForm';
import OtherMarketCount from '@/components/shared/OtherMarketCount';
import type { MercatoFilters } from '@/utils/mercato';

// Valeurs de `?onglet=` : `joueuses` (défaut) et `equipes`. Les redirections
// de /rejoindre et /recrutement (next.config.js) les visent.
const ID_BASE = 'mercato';

// JSON-LD : les questions que se posent les deux publics. En français comme
// les autres schémas du site.
const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'Peut-on participer sans avoir d’équipe ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Oui. Publie ta recherche dans le mercato : pseudo, postes, rang, plateforme, sans créer de compte. Les capitaines qui recrutent voient ta fiche et te contactent.',
      },
    },
    {
      '@type': 'Question',
      name: 'Comment recruter une joueuse pour mon équipe Overwatch ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Publie une annonce dans le mercato : postes recherchés, rang, plateforme, but du recrutement, sans créer de compte. Les joueuses qui cherchent une équipe la voient et te contactent.',
      },
    },
    {
      '@type': 'Question',
      name: 'Faut-il un rang minimum pour jouer ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Non, aucun rang minimum. Le tournoi accueille tous les niveaux, débutantes comprises.',
      },
    },
    {
      '@type': 'Question',
      name: 'Mes coordonnées sont-elles publiques ?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Non. Ton email et ton pseudo Discord ne sont visibles que par des personnes connectées. Le genre, facultatif, n’est affiché que si tu choisis de le renseigner.',
      },
    },
  ],
};

const CTA_CLASS =
  'mt-4 inline-block rounded-lg bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]';

function MercatoPage() {
  const t = useT(nsMercato);
  const tj = useT(nsRejoindrePage);
  const tr = useT(nsRecrutementPage);
  const router = useRouter();

  const tabs: TabItem[] = [
    { id: 'joueuses', label: t.tabPlayers },
    { id: 'equipes', label: t.tabTeams },
  ];
  const [active, setActive] = useQueryTab(tabs, 'onglet');
  const [playerFilters, setPlayerFilters] = useState<MercatoFilters>({});
  const [teamFilters, setTeamFilters] = useState<MercatoFilters>({});

  const badges = [t.heroNoAccount, t.heroNoRank, t.heroFree];

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
        <div className="relative mx-auto max-w-4xl px-6 pt-header-lg pb-10 text-center">
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

      {/* Les deux formulaires, toujours à un clic, quel que soit l'onglet. */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6">
            <h2 className="font-bold text-white">{t.ctaPlayerTitle}</h2>
            <p className="mt-2 text-sm text-gray-300">{t.ctaPlayerDesc}</p>
            <OtherMarketCount
              market="team-openings"
              one={tj.mirrorCountOne}
              many={tj.mirrorCountMany}
            />
            <Link
              href="/mercato/joueuse"
              className={CTA_CLASS}
              data-test="mercato-cta-player"
            >
              {t.ctaPlayer}
            </Link>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6">
            <h2 className="font-bold text-white">{t.ctaTeamTitle}</h2>
            <p className="mt-2 text-sm text-gray-300">{t.ctaTeamDesc}</p>
            <OtherMarketCount
              market="free-players"
              one={tr.altCountOne}
              many={tr.altCountMany}
            />
            <Link
              href="/mercato/equipe"
              className={CTA_CLASS}
              data-test="mercato-cta-team"
            >
              {t.ctaTeam}
            </Link>
          </div>
        </div>
      </section>

      {/* Onglets : une face du marché à la fois, filtres compris. */}
      <section className="mx-auto max-w-6xl px-6 pb-12">
        <Tabs
          tabs={tabs}
          active={active}
          onChange={setActive}
          ariaLabel={t.tabsLabel}
          idBase={ID_BASE}
          className="mb-6"
        />
        {/* Tant que la query n'est pas lue (page statique), l'onglet demandé
            par une ancienne URL n'est pas encore connu : on attend plutôt que
            de montrer une seconde l'autre liste. */}
        {router.isReady && (
          <div
            role="tabpanel"
            id={tabPanelId(ID_BASE, active)}
            aria-labelledby={tabButtonId(ID_BASE, active)}
            data-test={`mercato-panel-${active}`}
          >
            {active === 'equipes' ? (
              <>
                <MercatoFilterPanel
                  side="teams"
                  value={teamFilters}
                  onChange={setTeamFilters}
                />
                <TeamOpeningsList filters={teamFilters} />
              </>
            ) : (
              <>
                <MercatoFilterPanel
                  side="players"
                  value={playerFilters}
                  onChange={setPlayerFilters}
                />
                <FreePlayersList filters={playerFilters} />
              </>
            )}
          </div>
        )}
      </section>

      {/* Lien perdu : ancre visée par les pages de retrait/prolongation quand
          un lien n'est plus valide (anciennement /rejoindre#lien-perdu). */}
      <section id="lien-perdu" className="mx-auto max-w-2xl px-6 pb-12">
        <ResendLinkForm />
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-20">
        <div className="rounded-2xl border border-white/10 bg-[var(--bg-elevated)] p-6">
          <h2 className="font-bold text-white">{t.botTitle}</h2>
          <p className="mt-2 text-sm text-gray-300">{t.botDesc}</p>
          <a
            href={socialUrl('discord')}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-block rounded-lg border border-white/20 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/40"
          >
            {t.discordCta}
          </a>
        </div>
      </section>
    </div>
  );
}

const mercatoSeo: SeoProps = {
  title: {
    // Pas de suffixe : DefaultSeo ajoute déjà « | <nom du site> ».
    fr: 'Mercato : trouver une équipe ou recruter une joueuse Overwatch',
    en: 'Transfer market: find an Overwatch team or recruit a player',
  },
  description: {
    fr: 'Les joueuses qui cherchent une équipe et les équipes qui recrutent, au même endroit. Filtre par poste, rang, plateforme et contrôle, et publie ton annonce sans créer de compte.',
    en: 'Players looking for a team and teams that are recruiting, in one place. Filter by role, rank, platform and input, and post your listing without an account.',
  },
};

MercatoPage.seo = mercatoSeo;

export default MercatoPage;
