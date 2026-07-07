import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

type RulesDict = ReturnType<typeof useT<'rulesPage'>>;

const getRuleSections = (t: RulesDict) => [
  {
    title: t.section1Title,
    items: [t.section1Item1, t.section1Item2, t.section1Item3, t.section1Item4],
  },
  {
    title: t.section2Title,
    items: [t.section2Item1, t.section2Item2, t.section2Item3, t.section2Item4],
  },
  {
    title: t.section3Title,
    items: [t.section3Item1, t.section3Item2, t.section3Item3, t.section3Item4],
  },
];

const getModeDetails = (t: RulesDict) => [
  { mode: t.mode1Name, rules: t.mode1Rules },
  { mode: t.mode2Name, rules: t.mode2Rules },
  { mode: t.mode3Name, rules: t.mode3Rules },
  { mode: t.mode4Name, rules: t.mode4Rules },
  { mode: t.mode5Name, rules: t.mode5Rules },
];

const getReferences = (t: RulesDict) => [
  {
    label: t.ref1Label,
    href: 'https://www.blizzard.com/fr-fr/legal/7f2d718d-142f-4a68-9272-5c587f1addfb/overwatch-2-code-of-conduct',
  },
  {
    label: t.ref2Label,
    href: 'https://overwatch.blizzard.com/fr-fr/news/patch-notes/',
  },
  {
    label: t.ref3Label,
    href: 'https://overwatch.blizzard.com/fr-fr/news/23997317/',
  },
];

function RulesPage() {
  const t = useT('rulesPage');
  const ruleSections = getRuleSections(t);
  const modeDetails = getModeDetails(t);
  const references = getReferences(t);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl px-6 pt-32 pb-14 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <p className="mx-auto mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitle}
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

        <section className="rounded-3xl border border-white/10 bg-gradient-to-r from-[#140a24] via-[#1c0f33] to-[#2a0d3d] p-6 sm:p-10 shadow-2xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-gray-200">
                {t.modesEyebrow}
              </p>
              <h3 className="text-2xl font-bold">{t.modesTitle}</h3>
            </div>
            <p className="text-sm text-gray-200">{t.modesNote}</p>
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
              {t.referencesEyebrow}
            </p>
            <h3 className="text-2xl font-bold text-white">
              {t.referencesTitle}
            </h3>
            <p className="text-sm text-gray-300">{t.referencesNote}</p>
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
    fr: 'Règles officielles Overwatch',
    en: 'Official Overwatch rules',
  },
  description: {
    fr: "Paramètres compétitifs, modes et conduite officielle Overwatch utilisés pour l'OW Women's Cup, basés sur les règles Blizzard.",
    en: "Competitive settings, modes and official Overwatch conduct used for OW Women's Cup, based on Blizzard's rules.",
  },
};

RulesPage.seo = rulesSeo;

export default RulesPage;
