import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

type Partner = {
  name: string;
  description: string;
  url?: string;
  note?: string;
  logo?: string;
  pub?: boolean;
};

type PartnerCategory = {
  id: string;
  title: string;
  summary: string;
  accent: string;
  partners: Partner[];
};

const contactMail =
  'mailto:owwomenscup@gmail.com?subject=Partenariat%20OW%20Women%27s%20Cup%202026&body=Bonjour%20%21%0AJe%20souhaite%20discuter%20d%27un%20partenariat%20pour%20la%20prochaine%20%C3%A9dition.%0A';

const highlights = [
  {
    title: 'Visibilité en live',
    detail:
      'Overlay Twitch, habillage des scores, mentions antenne et activations lors des moments forts.',
  },
  {
    title: 'Communauté engagée',
    detail:
      'Rencontres avec les joueuses, ateliers, contenus co-brandés et relais sur nos réseaux.',
  },
  {
    title: 'Impact associatif',
    detail:
      'Chaque partenaire finance directement les récompenses des équipes, la production et les actions inclusives.',
  },
];

const partnerCategories: PartnerCategory[] = [
  {
    id: 'super',
    title: 'Super partenaire',
    summary:
      "Le soutien titre qui porte l'édition (naming, présence live, activités principales, animations IRL).",
    accent: 'from-amber-300 via-pink-400 to-purple-600',
    partners: [
      {
        name: 'En recherche',
        note: 'Super Partenaire 2026',
        description: `Place réservée au partenaire principal de la prochaine édition. Construction d'un programme sur-mesure.`,
      },
    ],
  },
  {
    id: 'major',
    title: 'Partenaire majeur',
    summary:
      'Marques qui financent la production, le cashprize ou le matériel et apparaissent sur chaque émission.',
    accent: 'from-indigo-300 via-purple-400 to-pink-400',
    partners: [
      {
        name: 'Slots ouverts',
        description:
          'Visibilité cross-plateformes, encarts avant/après matchs, placement dans les interviews et sur le site.',
      },
      {
        name: "Betty's Bar",
        description:
          'Soutien terrain et visibilité locale pour la prochaine édition, avec relais auprès du public esport.',
        logo: 'https://dynamic-media-cdn.tripadvisor.com/media/photo-o/0c/ab/a2/6b/betty-s-bar.jpg?w=500&h=300&s=1',
        note: 'Nouveau',
        url: 'https://www.instagram.com/bettysbarlyon/?hl=fr',
      },
      {
        name: 'Vous ?',
        description:
          'Contactez-nous pour choisir un soutien financier ou autre.',
        url: contactMail,
        pub: true,
      },
    ],
  },
  {
    id: 'cultural',
    title: 'Partenaire culturel',
    summary:
      'Institutions et acteurs culturels qui soutiennent la mise en avant des talents féminins et la médiation.',
    accent: 'from-emerald-300 via-cyan-300 to-blue-500',
    partners: [
      {
        name: 'Librairie à soi.e',
        description:
          'Déjà à nos côtés pour la médiation, la mise en avant des joueuses et l’animation d’ateliers.',
        note: 'Nouveau',
        logo: 'https://static.wixstatic.com/media/54f35a_ddaa971440884bba8f6e9b9b61ec2b0d~mv2.png/v1/crop/x_134,y_113,w_879,h_459/fill/w_250,h_130,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Librairie%20%C3%A0%20soi_e%20Lyon%20f%C3%A9iminisme.png',
        url: 'https://www.librairieasoie.com',
      },
      {
        name: 'Collectifs & médias',
        description:
          'Relais éditorial, portraits de joueuses, ateliers média-training et journées de sensibilisation.',
      },
      {
        name: 'Vous ?',
        description:
          'Contactez-nous pour choisir un soutien culturel ou autre.',
        url: contactMail,
        pub: true,
      },
    ],
  },
];

function PartnersPage() {
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
            Partenaires 2026
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Ils soutiennent la prochaine édition
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-200">
            Marque, institution ou média : découvrez comment rejoindre l&apos;OW
            Women&apos;s Cup et donner de l&apos;ampleur à la scène Overwatch
            féminine.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <a
              href={contactMail}
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Devenir partenaire
            </a>
            <Link
              href="/don"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Faire un don
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-16 px-4 pb-20 sm:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {highlights.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20"
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
              Catégories
            </p>
            <h3 className="text-3xl font-bold text-white">
              Les formats de soutien
            </h3>
            <p className="text-sm text-gray-300 max-w-3xl">
              Trois niveaux pour aligner vos objectifs avec la compétition : du
              naming à l&apos;activation culturelle auprès des talents et de la
              communauté.
            </p>
          </div>

          <div className="space-y-6">
            {partnerCategories.map((category) => (
              <div
                key={category.id}
                className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-2xl shadow-black/30 sm:p-8"
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
                        key={partner.name}
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
                        {partner.logo && (
                          <div className="mt-3 flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={partner.logo}
                              alt={`Logo ${partner.name}`}
                              className="max-h-14 w-auto object-contain drop-shadow"
                            />
                          </div>
                        )}
                        <p className="mt-2 text-sm text-gray-300">
                          {partner.description}
                        </p>
                        {partner.url && (
                          <a
                            href={partner.url}
                            className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-purple-200 underline decoration-purple-400/60 underline-offset-4 transition hover:text-white"
                          >
                            {partner.pub
                              ? 'Rejoindre le programme'
                              : 'Découvrir le partenaire'}
                            <span aria-hidden>↗</span>
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 text-center">
          <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
            Contact
          </p>
          <h4 className="mt-2 text-2xl font-semibold">
            Envie de rejoindre la page partenaires ?
          </h4>
          <p className="mt-3 text-sm text-gray-200 max-w-3xl mx-auto">
            On co-construit les activations (contenus, présence sur les lives,
            ateliers, prêts matériels) pour mettre en valeur votre marque et la
            scène féminine.
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <a
              href={contactMail}
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Écrire à l&apos;équipe
            </a>
            <Link
              href="/association"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Découvrir l&apos;asso
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const partnersSeo: SeoProps = {
  title: "Partenaires OW Women's Cup 2026",
  description:
    "Découvrez les catégories de soutien de la prochaine édition de l'OW Women's Cup : super partenaire titre, partenaires majeurs et partenaires culturels.",
};

PartnersPage.seo = partnersSeo;

export default PartnersPage;
