import Head from 'next/head';

type TimelineItem = {
  id: string;
  title: string;
  period: string;
  description: string;
  badge?: string;
};

const frenchMonthMap: Record<string, number> = {
  janvier: 0,
  fevrier: 1,
  février: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  decembre: 11,
};

const timeline: TimelineItem[] = [
  {
    id: 'prep',
    title: 'Préparation & annonces',
    period: 'Décembre 2025',
    description:
      'Reveal des formats, ouverture des rôles staff et publication du rulebook mis à jour.',
    badge: 'Go Live',
  },
  {
    id: 'signup',
    title: 'Inscriptions équipes',
    period: 'Janvier 2026',
    description:
      'Ouverture des inscriptions, vérification des rosters et accompagnement des nouvelles équipes.',
  },
  {
    id: 'season',
    title: 'Saison régulière',
    period: 'Avril 2026',
    description:
      'Rounds suisses + classements hebdo. Diffusions communautaires et interviews.',
  },
  {
    id: 'playoffs',
    title: 'Playoffs',
    period: 'Mai 2026',
    description:
      'Bracket double élimination (upper et low bracket). Maps révélées à l’avance, veto en direct, analyst desk.',
    badge: 'Clutch Time',
  },
  {
    id: 'finals',
    title: 'Grandes finales',
    period: 'Juin 2026',
    description:
      'Grande scène online, invités spéciaux, showmatch. Podium, récompenses et récap de la saison.',
  },
];

export default function Timeline2026Page() {
  const now = new Date();
  const currentIdx = timeline.findIndex((item) => {
    const [monthLabel, yearLabel] = item.period.split(' ');
    const normalized = monthLabel
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    const monthNumber = frenchMonthMap[normalized];
    const yearNumber = parseInt(yearLabel, 10);
    return monthNumber === now.getMonth() && yearNumber === now.getFullYear();
  });

  const highlightPercent =
    currentIdx >= 0 && timeline.length > 1
      ? (currentIdx / (timeline.length - 1)) * 100
      : null;

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <Head>
        <title>Chronologie 2026 | OW Women&apos;s Cup</title>
      </Head>

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 w-[420px] h-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 w-[360px] h-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-24 pb-16 relative">
          <p className="text-xs uppercase tracking-[0.24em] text-purple-200/80">
            Roadmap 2026
          </p>
          <h1 className="text-4xl md:text-5xl font-bold mt-3 leading-tight">
            Toutes les étapes jusqu&apos;aux finales 2026
          </h1>
          <p className="text-neutral-300 text-lg mt-4 max-w-2xl">
            Suis le déroulé de la saison : inscriptions, playoffs et grande
            finale. Chaque jalon sera détaillé et mis à jour en temps réel.
          </p>
        </div>
      </div>

      {/* Timeline */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="relative">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-4 md:left-1/2 -translate-x-1/2 w-[3px] rounded-full bg-gradient-to-b from-purple-400 via-purple-300/40 to-pink-500 shadow-[0_0_25px_rgba(168,85,247,0.4)] z-10"
          />
          {highlightPercent !== null && (
            <div
              aria-hidden
              className="pointer-events-none absolute left-4 md:left-1/2 -translate-x-1/2 w-3 h-24 -translate-y-1/2 z-20"
              style={{ top: `${highlightPercent}%` }}
            >
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-amber-300 via-pink-400 to-amber-200 blur-md opacity-80" />
              <div className="absolute inset-1 rounded-full bg-gradient-to-b from-amber-300 via-pink-400 to-amber-200 shadow-[0_0_30px_rgba(249,115,22,0.35)]" />
            </div>
          )}
          <div className="grid md:grid-cols-2 gap-12">
            {timeline.map((item, idx) => {
              const isLeft = idx % 2 === 0;
              const isCurrent = idx === currentIdx;
              return (
                <div
                  key={item.id}
                  className={`relative md:col-span-1 ${
                    isLeft ? 'md:pr-10' : 'md:pl-10 md:translate-y-10'
                  }`}
                >
                  <div
                    className={`absolute w-4 h-4 rounded-full bg-gradient-to-br from-purple-300 to-pink-500 border-2 border-white/60 shadow-[0_0_15px_rgba(219,39,119,0.65)] ${
                      isLeft
                        ? 'left-[-1.2rem] md:left-auto md:right-full md:translate-x-1/2'
                        : 'left-[-1.2rem] md:left-[-0.4rem]'
                    } ${isCurrent ? 'scale-110 ring-4 ring-pink-400/40 animate-pulse' : ''}`}
                  />
                  <div
                    className={`bg-neutral-900 border rounded-2xl p-6 shadow-xl shadow-black/20 backdrop-blur ${
                      isCurrent
                        ? 'border-pink-400/40 shadow-[0_0_30px_rgba(236,72,153,0.3)]'
                        : 'border-white/10'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <span
                        className={`text-xs uppercase tracking-[0.18em] ${
                          isCurrent ? 'text-pink-100' : 'text-neutral-400'
                        }`}
                      >
                        {item.period}
                      </span>
                      {item.badge && (
                        <span
                          className={`text-[11px] px-2 py-1 rounded-full border ${
                            isCurrent
                              ? 'bg-pink-500/20 text-pink-50 border-pink-300/60'
                              : 'bg-purple-500/20 text-purple-100 border-purple-400/40'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <h3
                      className={`text-xl font-semibold mt-2 ${
                        isCurrent ? 'text-white' : ''
                      }`}
                    >
                      {item.title}
                    </h3>
                    <p className="text-neutral-300 text-sm mt-3 leading-relaxed">
                      {item.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
