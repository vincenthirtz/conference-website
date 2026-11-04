// pages/mercato/equipe.tsx
//
// Le formulaire « mon équipe recrute » du hub mercato — le pendant de
// /mercato/joueuse. Il vivait au milieu de /recrutement ; le hub garde les
// listes et donne à chaque formulaire sa page.
//
// Une capitaine connectée peut aussi publier depuis son espace (annonce
// rattachée à l'équipe, TeamOpeningEditor) ou depuis Discord (/mercato
// equipe) : mêmes champs. Ce formulaire-ci reste sans compte.
//
// Page 100 % statique. Indexable : « recruter une joueuse Overwatch ».

import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';
import nsMercato from '@/lib/i18n/locales/fr/mercato';
import nsRecrutementPage from '@/lib/i18n/locales/fr/recrutementPage';
import PostOpeningForm from '@/components/TeamOpenings/PostOpeningForm';

function MercatoTeamFormPage() {
  const t = useT(nsMercato);
  const tr = useT(nsRecrutementPage);
  const steps = [
    { title: tr.how1Title, desc: tr.how1Desc },
    { title: tr.how2Title, desc: tr.how2Desc },
    { title: tr.how3Title, desc: tr.how3Desc },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-2xl px-6 pt-header-lg pb-6">
        <Link
          href="/mercato?onglet=equipes"
          className="text-sm font-semibold text-[var(--color-green-light)] underline underline-offset-2"
        >
          {t.backToHub}
        </Link>
        <p className="mt-6 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
          {t.heroBadge}
        </p>
        <h1 className="text-brand-gradient mt-4 text-3xl font-bold leading-tight sm:text-4xl">
          {t.teamPageTitle}
        </h1>
        <p className="mt-3 text-gray-300">{t.teamPageSubtitle}</p>
      </div>

      <section className="mx-auto max-w-2xl px-6 pb-6">
        <h2 className="sr-only">{tr.howTitle}</h2>
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
        <PostOpeningForm />
      </section>
    </div>
  );
}

const seo: SeoProps = {
  title: {
    fr: 'Recruter une joueuse Overwatch',
    en: 'Recruit an Overwatch player',
  },
  description: {
    fr: "Il te manque une joueuse ? Publie l'annonce de ton équipe dans le mercato sans créer de compte : postes, rang, plateforme, but du recrutement.",
    en: 'One player short? Post your team listing in the transfer market without an account: roles, rank, platform, recruiting purpose.',
  },
};

MercatoTeamFormPage.seo = seo;

export default MercatoTeamFormPage;
