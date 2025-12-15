import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

const ruleSections = [
  {
    title: 'Composition & restrictions',
    items: [
      '5v5 obligatoire : 1 Tank, 2 Dégâts, 2 Soutien (Role Queue).',
      'Héros uniques : aucun doublon autorisé dans une même équipe.',
      'Patch en cours : toutes les parties se jouent sur la dernière version live d’Overwatch 2 (pas de rollbacks).',
      'Objets de workshop, mods, macros ou scripts interdits.',
    ],
  },
  {
    title: 'Paramètres de salon officiels',
    items: [
      'Préréglage : Règles de compétition.',
      'Score limité par mode (ex. Contrôle en BO3).',
      'Temps de préparation 45 s (départ) / 35 s (mi-temps).',
      'Pause technique : uniquement en cas de bug ou déconnexion, max 5 min par équipe.',
    ],
  },
  {
    title: 'Fair-play & conduite',
    items: [
      'Aucun exploit, stream sniping ou partage de compte.',
      'Chat vocal et textuel soumis au Code de conduite Blizzard.',
      'Résolution des litiges : décision finale par l’arbitrage tournoi.',
    ],
  },
];

const modeDetails = [
  {
    mode: 'Contrôle (Control)',
    rules:
      'BO3 sur trois points de contrôle. Si 1-1, manche décisive. Overtime si une équipe conteste ou est sur le point de capturer.',
  },
  {
    mode: 'Hybride (Assaut/ Escorte)',
    rules:
      'Att/Def : capture du point A puis escorte du convoi. Victoire à la meilleure progression; overtime si la progression est contestée.',
  },
  {
    mode: 'Escorte (Escort)',
    rules:
      'Att/Def : escorte pure du convoi jusqu’au point final. Si égalité après les deux manches, reprise avec banque de temps; meilleure distance départage.',
  },
  {
    mode: 'Flashpoint',
    rules:
      'Points de capture successifs, premier à 2 points. Overtime si un point est contesté. Reset d’ultimes à chaque prise.',
  },
  {
    mode: 'Push',
    rules:
      'Robot central. Équipe gagnante : distance la plus avancée. Overtime si le robot est contesté ou proche du marqueur de l’adversaire.',
  },
];

const references = [
  {
    label: 'Code de conduite Blizzard',
    href: 'https://www.blizzard.com/fr-fr/legal/7f2d718d-142f-4a68-9272-5c587f1addfb/overwatch-2-code-of-conduct',
  },
  {
    label: 'Notes de mise à jour Overwatch 2 (patch live)',
    href: 'https://overwatch.blizzard.com/fr-fr/news/patch-notes/',
  },
  {
    label: 'Paramètres « Règles de compétition » (guide officiel)',
    href: 'https://overwatch.blizzard.com/fr-fr/news/23997317/',
  },
];

function RulesPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            Règlement officiel
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Règles officielles Overwatch 2
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            Résumé des paramètres compétitifs Overwatch 2 utilisés pour l’OW Women&apos;s Cup. Toute
            l’organisation se base sur les règles officielles Blizzard, adaptées au format du
            tournoi.
          </p>
        </div>
      </div>

      <main className="mx-auto max-w-5xl space-y-14 px-4 pb-20 sm:px-6">
        <section className="grid gap-4 md:grid-cols-3">
          {ruleSections.map((section) => (
            <div
              key={section.title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl shadow-black/20"
            >
              <h2 className="text-xl font-semibold text-white">{section.title}</h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-200">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span className="mt-[6px] h-2 w-2 rounded-full bg-purple-400" aria-hidden />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">Modes de jeu</p>
              <h3 className="text-2xl font-bold">Conditions de victoire par mode</h3>
            </div>
            <p className="text-sm text-gray-200">
              S’applique avec le préréglage « Règles de compétition » dans les salons personnalisés.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {modeDetails.map((item) => (
              <div
                key={item.mode}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
              >
                <p className="text-sm uppercase tracking-[0.14em] text-purple-200">{item.mode}</p>
                <p className="mt-2 text-sm text-gray-100">{item.rules}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">Références officielles</p>
            <h3 className="text-2xl font-bold text-white">Sources Blizzard</h3>
            <p className="text-sm text-gray-300">
              Consultez les documents officiels pour les mises à jour de règles, de maps ou de
              patchs.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {references.map((ref) => (
              <Link
                key={ref.href}
                href={ref.href}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white hover:border-purple-300/50 hover:bg-white/[0.1] transition"
              >
                {ref.label} ↗
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const rulesSeo: SeoProps = {
  title: 'Règles officielles Overwatch 2',
  description:
    "Paramètres compétitifs, modes et conduite officielle Overwatch 2 utilisés pour l'OW Women's Cup, basés sur les règles Blizzard.",
};

RulesPage.seo = rulesSeo;

export default RulesPage;
