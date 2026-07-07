import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

const ruleSections = [
  {
    title: 'Composition & restrictions',
    items: [
      '5v5 obligatoire : 1 Tank, 2 D\u00e9g\u00e2ts, 2 Soutien (Role Queue).',
      'H\u00e9ros uniques : aucun doublon autoris\u00e9 dans une m\u00eame \u00e9quipe.',
      "Patch en cours : toutes les parties se jouent sur la derni\u00e8re version live d'Overwatch (pas de rollbacks).",
      'Objets de workshop, mods, macros ou scripts interdits.',
    ],
  },
  {
    title: 'Param\u00e8tres de salon officiels',
    items: [
      'Pr\u00e9r\u00e9glage : R\u00e8gles de comp\u00e9tition.',
      'Score limit\u00e9 par mode (ex. Contr\u00f4le en BO3).',
      'Temps de pr\u00e9paration 45 s (d\u00e9part) / 35 s (mi-temps).',
      'Pause technique : uniquement en cas de bug ou d\u00e9connexion, max 5 min par \u00e9quipe.',
    ],
  },
  {
    title: 'Fair-play & conduite',
    items: [
      'Aucun exploit, stream sniping ou partage de compte.',
      'Chat vocal et textuel soumis au Code de conduite Blizzard.',
      "R\u00e9solution des litiges : d\u00e9cision finale par l'arbitrage tournoi.",
      'Rejoindre le Discord du tournoi est obligatoire : https://discord.gg/gERSsjC3Vd',
    ],
  },
];

const modeDetails = [
  {
    mode: 'Contr\u00f4le (Control)',
    rules:
      'BO3 sur trois points de contr\u00f4le. Si 1-1, manche d\u00e9cisive. Overtime si une \u00e9quipe conteste ou est sur le point de capturer.',
  },
  {
    mode: 'Hybride (Assaut/ Escorte)',
    rules:
      'Att/Def : capture du point A puis escorte du convoi. Victoire \u00e0 la meilleure progression; overtime si la progression est contest\u00e9e.',
  },
  {
    mode: 'Escorte (Escort)',
    rules:
      "Att/Def : escorte pure du convoi jusqu'au point final. Si \u00e9galit\u00e9 apr\u00e8s les deux manches, reprise avec banque de temps; meilleure distance d\u00e9partage.",
  },
  {
    mode: 'Flashpoint',
    rules:
      "Points de capture successifs, premier \u00e0 2 points. Overtime si un point est contest\u00e9. Reset d'ultimes \u00e0 chaque prise.",
  },
  {
    mode: 'Push',
    rules:
      "\u00c9quipe gagnante : distance la plus avanc\u00e9e. Overtime si le robot est contest\u00e9 ou proche du marqueur de l'adversaire.",
  },
];

const references = [
  {
    label: 'Code de conduite Blizzard',
    href: 'https://www.blizzard.com/fr-fr/legal/7f2d718d-142f-4a68-9272-5c587f1addfb/overwatch-2-code-of-conduct',
  },
  {
    label: 'Notes de mise \u00e0 jour Overwatch (patch live)',
    href: 'https://overwatch.blizzard.com/fr-fr/news/patch-notes/',
  },
  {
    label:
      'Param\u00e8tres \u00ab R\u00e8gles de comp\u00e9tition \u00bb (guide officiel)',
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
            R&egrave;glement officiel
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            R&egrave;gles officielles Overwatch
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            R&eacute;sum&eacute; des param&egrave;tres comp&eacute;titifs
            Overwatch utilis&eacute;s pour l&apos;OW Women&apos;s Cup. Toute
            l&apos;organisation se base sur les r&egrave;gles officielles
            Blizzard, adapt&eacute;es au format du tournoi.
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
              <h2 className="text-xl font-semibold text-white">
                {section.title}
              </h2>
              <ul className="mt-3 space-y-2 text-sm text-gray-200">
                {section.items.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span
                      className="mt-[6px] h-2 w-2 rounded-full bg-purple-400"
                      aria-hidden
                    />
                    <span>
                      {/https?:\/\/\S+/.test(item)
                        ? item.split(/(https?:\/\/\S+)/).map((part, i) =>
                            /^https?:\/\//.test(part) ? (
                              <Link
                                key={i}
                                href={part}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="text-purple-300 underline hover:text-purple-200"
                              >
                                {part}
                              </Link>
                            ) : (
                              part
                            )
                          )
                        : item}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#0F1F3A] via-[#1A0F2E] to-[#2C0B2C] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                Modes de jeu
              </p>
              <h3 className="text-2xl font-bold">
                Conditions de victoire par mode
              </h3>
            </div>
            <p className="text-sm text-gray-200">
              S&apos;applique avec le pr&eacute;r&eacute;glage &laquo;
              R&egrave;gles de comp&eacute;tition &raquo; dans les salons
              personnalis&eacute;s.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {modeDetails.map((item) => (
              <div
                key={item.mode}
                className="rounded-2xl border border-white/10 bg-white/[0.06] p-4"
              >
                <p className="text-sm uppercase tracking-[0.14em] text-purple-200">
                  {item.mode}
                </p>
                <p className="mt-2 text-sm text-gray-100">{item.rules}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              R&eacute;f&eacute;rences officielles
            </p>
            <h3 className="text-2xl font-bold text-white">Sources Blizzard</h3>
            <p className="text-sm text-gray-300">
              Consultez les documents officiels pour les mises &agrave; jour de
              r&egrave;gles, de maps ou de patchs.
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
  title: {
    fr: 'R\u00e8gles officielles Overwatch',
    en: 'Official Overwatch rules',
  },
  description: {
    fr: "Param\u00e8tres comp\u00e9titifs, modes et conduite officielle Overwatch utilis\u00e9s pour l'OW Women's Cup, bas\u00e9s sur les r\u00e8gles Blizzard.",
    en: "Competitive settings, modes and official Overwatch conduct used for OW Women's Cup, based on Blizzard's rules.",
  },
};

RulesPage.seo = rulesSeo;

export default RulesPage;
