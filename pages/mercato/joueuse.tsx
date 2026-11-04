// pages/mercato/joueuse.tsx
//
// Le formulaire « je cherche une équipe » du hub mercato. Il vivait au milieu
// de /rejoindre, entre la liste et les renvois ; le hub garde les listes et
// donne à chaque formulaire sa page, que les deux cartes du hub (et le
// Discord) peuvent viser directement.
//
// Page 100 % statique. Indexable : c'est la cible du « trouver une équipe
// Overwatch féminine ».

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import nsRejoindrePage from '@/lib/i18n/locales/fr/rejoindrePage';
import JoinAsPlayerForm from '@/components/FreePlayers/JoinAsPlayerForm';

function MercatoPlayerFormPage() {
  const t = useT(nsMercato);
  const tj = useT(nsRejoindrePage);
  const steps = [
    { title: tj.how1Title, desc: tj.how1Desc },
    { title: tj.how2Title, desc: tj.how2Desc },
    { title: tj.how3Title, desc: tj.how3Desc },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-2xl px-6 pt-header-lg pb-6">
        <Link
          href="/mercato?onglet=joueuses"
          className="text-sm font-semibold text-[var(--color-green-light)] underline underline-offset-2"
        >
          {t.backToHub}
        </Link>
        <p className="mt-6 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
          {t.heroBadge}
        </p>
        <h1 className="text-brand-gradient mt-4 text-3xl font-bold leading-tight sm:text-4xl">
          {t.playerPageTitle}
        </h1>
        <p className="mt-3 text-gray-300">{t.playerPageSubtitle}</p>
      </div>

      <section className="mx-auto max-w-2xl px-6 pb-6">
        <h2 className="sr-only">{tj.howTitle}</h2>
        <ol className="grid gap-3 sm:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-xl border border-white/10 bg-[var(--bg-elevated)] p-4"
            >
              <p className="text-xs font-black text-white/30">{`0${i + 1}`}</p>
              <h3 className="mt-1 text-sm font-bold text-white">
                {step.title}
              </h3>
              <p className="mt-1 text-xs text-gray-300">{step.desc}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-2xl px-6 pb-20">
        <JoinAsPlayerForm />
      </section>
    </div>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Trouver une équipe Overwatch féminine',
    en: "Find a women's Overwatch team",
  },
  description: {
    fr: "Pas d'équipe ? Publie ta recherche dans le mercato sans créer de compte : poste, rang, plateforme. Les capitaines qui recrutent voient ta fiche et te contactent.",
    en: 'No team? Post your search in the transfer market without an account: role, rank, platform. Recruiting captains see your profile and reach out.',
  },
};

MercatoPlayerFormPage.seo = seo;

export default MercatoPlayerFormPage;
