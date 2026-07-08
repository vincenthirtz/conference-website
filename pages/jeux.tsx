import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { listGames } from '@/config/games';
import type { GameDef, GameSlug, MatchFormat } from '@/config/games';
import { useT, format } from '@/lib/i18n/useT';

type JeuxDict = ReturnType<typeof useT<'jeuxPage'>>;

const getGameCopy = (
  t: JeuxDict
): Record<GameSlug, { tagline: string; pitch: string }> => ({
  overwatch: { tagline: t.overwatchTagline, pitch: t.overwatchPitch },
  valorant: { tagline: t.valorantTagline, pitch: t.valorantPitch },
  cs2: { tagline: t.cs2Tagline, pitch: t.cs2Pitch },
  'r6-siege': { tagline: t.r6Tagline, pitch: t.r6Pitch },
  'marvel-rivals': { tagline: t.marvelTagline, pitch: t.marvelPitch },
  'rocket-league': { tagline: t.rocketTagline, pitch: t.rocketPitch },
  lol: { tagline: t.lolTagline, pitch: t.lolPitch },
  dota2: { tagline: t.dota2Tagline, pitch: t.dota2Pitch },
});

// Palette de degrades par jeu, utilises comme visuel de fallback quand
// on n'a pas (encore) d'image hero locale.
// Palette de dégradés par jeu, utilisés comme visuel de fallback quand
// on n'a pas (encore) d'image hero locale.
const GAME_GRADIENT: Record<GameSlug, string> = {
  overwatch: 'from-orange-500 via-amber-400 to-rose-500',
  valorant: 'from-rose-500 via-red-500 to-rose-700',
  cs2: 'from-amber-400 via-orange-500 to-yellow-600',
  'r6-siege': 'from-sky-500 via-blue-600 to-indigo-700',
  'marvel-rivals': 'from-purple-500 via-fuchsia-500 to-pink-500',
  'rocket-league': 'from-cyan-400 via-blue-500 to-indigo-600',
  lol: 'from-amber-300 via-yellow-500 to-amber-700',
  dota2: 'from-emerald-500 via-teal-600 to-cyan-700',
};

function formatLabel(format: MatchFormat): string {
  return format.toUpperCase();
}

function GameCard({ game }: { game: GameDef }) {
  const t = useT('jeuxPage');
  const copy = getGameCopy(t)[game.slug] ?? {
    tagline: '',
    pitch: t.fallbackPitch,
  };
  const gradient =
    GAME_GRADIENT[game.slug] ?? 'from-purple-500 via-fuchsia-500 to-pink-500';

  return (
    <article className="group relative flex flex-col overflow-hidden card-brand rounded-3xl bg-white/[0.04] shadow-2xl shadow-black/30 transition hover:bg-white/[0.06]">
      {/* Visuel hero : degrade decoratif avec le label en filigrane */}
      <div
        aria-hidden
        className={`relative h-40 w-full overflow-hidden bg-gradient-to-br ${gradient}`}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.25),transparent_55%)]" />
        <div className="absolute -right-6 -bottom-6 h-32 w-32 rounded-full bg-white/10 blur-2xl" />
        <span className="absolute bottom-3 left-4 text-2xl font-black uppercase tracking-tight text-white/90 drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)]">
          {game.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-4 p-6">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-purple-200">
            {copy.tagline}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-white">
            {game.label}
          </h3>
        </div>

        <p className="text-sm leading-relaxed text-gray-300">{copy.pitch}</p>

        {/* Capacites : veto / draft / pool */}
        <div className="flex flex-wrap gap-2">
          {game.hasMapVeto && (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-emerald-100">
              {t.mapVeto}
            </span>
          )}
          {game.hasDraft && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">
              {t.draft}
            </span>
          )}
          {game.mapPool.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
              {format(t.mapsCount, { count: game.mapPool.length })}
            </span>
          )}
          {!game.hasMapVeto && game.mapPool.length === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-300">
              {t.mapFixed}
            </span>
          )}
        </div>

        {/* Formats supportes */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
            {t.formats}
          </span>
          {game.matchFormats.map((fmt) => (
            <span
              key={fmt}
              className="inline-flex items-center rounded-md border border-purple-300/30 bg-purple-500/10 px-2 py-[3px] text-[11px] font-semibold uppercase tracking-wide text-purple-100"
            >
              {formatLabel(fmt)}
            </span>
          ))}
        </div>
      </div>
    </article>
  );
}

function GamesPage() {
  const t = useT('jeuxPage');
  const games = listGames();

  // Stats calculées dynamiquement depuis le registry : si on ajoute un jeu,
  // les chiffres suivent sans intervention.
  const totalMaps = games.reduce((sum, g) => sum + g.mapPool.length, 0);
  const vetoGames = games.filter((g) => g.hasMapVeto).length;
  const draftGames = games.filter((g) => g.hasDraft).length;
  const allFormats = new Set<string>();
  for (const g of games) {
    for (const f of g.matchFormats) allFormats.add(f);
  }

  const heroStats: { value: string; label: string; sub?: string }[] = [
    {
      value: String(games.length),
      label: t.statGamesLabel,
      sub: t.statGamesSub,
    },
    {
      value: String(totalMaps),
      label: t.statMapsLabel,
      sub: t.statMapsSub,
    },
    {
      value: String(vetoGames),
      label: t.statVetoLabel,
      sub: t.statVetoSub,
    },
    {
      value: String(draftGames),
      label: t.statDraftLabel,
      sub: t.statDraftSub,
    },
    {
      value: String(allFormats.size),
      label: t.statFormatsLabel,
      sub: t.statFormatsSub,
    },
  ];

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-0 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
          <div className="absolute left-10 bottom-0 h-48 w-48 rounded-full bg-cyan-400/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-16">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.badgeMulti}
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight text-brand-gradient sm:text-5xl md:text-6xl">
            {t.heroTitle}
          </h1>
          <span className="brand-rule mt-4" aria-hidden />
          <p className="mt-4 max-w-3xl text-lg text-gray-200">
            {t.heroSubtitlePart1}
            <strong>{t.heroSubtitleStrong}</strong>
            {format(t.heroSubtitlePart2, { count: games.length })}
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/inscription-2026"
              className="rounded-full bg-[var(--color-violet)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {t.ctaRegisterTeam}
            </Link>
            <Link
              href="/tournaments"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {t.ctaViewTournaments}
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-16 px-4 pb-20 sm:px-6">
        {/* En chiffres */}
        <section aria-labelledby="stats-heading" className="-mt-6 sm:-mt-10">
          <h2 id="stats-heading" className="sr-only">
            {t.statsHeading}
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="relative overflow-hidden card-brand rounded-2xl bg-white/[0.04] p-4 shadow-xl shadow-black/20"
              >
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 blur-2xl"
                />
                <p className="relative text-3xl font-black leading-none text-white sm:text-4xl">
                  {stat.value}
                </p>
                <p className="relative mt-1 text-xs uppercase tracking-[0.14em] text-purple-200">
                  {stat.label}
                </p>
                {stat.sub && (
                  <p className="relative mt-1 text-[11px] text-gray-400">
                    {stat.sub}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Grille de cartes jeu */}
        <section aria-labelledby="games-grid-heading" className="space-y-8">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.catalogueEyebrow}
            </p>
            <h2
              id="games-grid-heading"
              className="text-3xl font-bold text-brand-gradient"
            >
              {format(t.catalogueTitle, { count: games.length })}
            </h2>
            <span className="brand-rule" aria-hidden />
            <p className="text-sm text-gray-300 max-w-3xl">{t.catalogueDesc}</p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {games.map((game) => (
              <GameCard key={game.slug} game={game} />
            ))}
          </div>
        </section>

        {/* Tableau comparatif */}
        <section aria-labelledby="compare-heading" className="space-y-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.compareEyebrow}
            </p>
            <h2
              id="compare-heading"
              className="text-3xl font-bold text-brand-gradient"
            >
              {t.compareTitle}
            </h2>
            <span className="brand-rule" aria-hidden />
            <p className="text-sm text-gray-300 max-w-3xl">{t.compareDesc}</p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[11px] uppercase tracking-[0.14em] text-gray-300">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t.tableGame}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t.tableMapVeto}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t.tableDraft}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t.tableMaps}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t.tableFormats}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {games.map((game) => {
                  const gradient =
                    GAME_GRADIENT[game.slug] ??
                    'from-purple-500 via-fuchsia-500 to-pink-500';
                  return (
                    <tr
                      key={game.slug}
                      className="transition hover:bg-white/[0.03]"
                    >
                      <th
                        scope="row"
                        className="px-4 py-3 font-semibold text-white"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            aria-hidden
                            className={`inline-block h-3 w-3 rounded-full bg-gradient-to-br ${gradient}`}
                          />
                          {game.label}
                        </div>
                      </th>
                      <td className="px-4 py-3">
                        {game.hasMapVeto ? (
                          <span className="text-emerald-300">{t.tableYes}</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {game.hasDraft ? (
                          <span className="text-amber-300">{t.tableYes}</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {game.mapPool.length > 0
                          ? format(t.mapsCount, { count: game.mapPool.length })
                          : t.mapFixed}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {game.matchFormats.map((fmt) => (
                            <span
                              key={fmt}
                              className="inline-flex items-center rounded border border-purple-300/30 bg-purple-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-purple-100"
                            >
                              {formatLabel(fmt)}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Comment ca marche */}
        <section aria-labelledby="how-heading" className="space-y-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.howEyebrow}
            </p>
            <h2
              id="how-heading"
              className="text-3xl font-bold text-brand-gradient"
            >
              {t.howTitle}
            </h2>
            <span className="brand-rule" aria-hidden />
            <p className="text-sm text-gray-300 max-w-3xl">{t.howDesc}</p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                step: '1',
                title: t.step1Title,
                detail: t.step1Detail,
              },
              {
                step: '2',
                title: t.step2Title,
                detail: t.step2Detail,
              },
              {
                step: '3',
                title: t.step3Title,
                detail: t.step3Detail,
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative overflow-hidden card-brand rounded-2xl bg-white/[0.05] p-6 shadow-xl shadow-black/20"
              >
                <span
                  aria-hidden
                  className="absolute -right-4 -top-6 text-[6rem] font-black leading-none text-white/[0.04]"
                >
                  {item.step}
                </span>
                <p className="text-xs uppercase tracking-[0.16em] text-purple-200">
                  {format(t.stepLabel, { n: item.step })}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-white">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-gray-200">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Bot Discord */}
        <section aria-labelledby="bot-heading" className="space-y-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.botEyebrow}
            </p>
            <h2
              id="bot-heading"
              className="text-3xl font-bold text-brand-gradient"
            >
              {t.botTitle}
            </h2>
            <span className="brand-rule" aria-hidden />
            <p className="text-sm text-gray-300 max-w-3xl">{t.botDesc}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: t.cap1Title,
                scope: t.scopeUniversal,
                commands: [
                  '/creer-tournoi',
                  '/publier-tournoi',
                  '/inscrire-equipe',
                  '/creer-mon-equipe',
                  '/inviter',
                  '/roster',
                ],
                detail: t.cap1Detail,
              },
              {
                title: t.cap2Title,
                scope: t.scopeUniversal,
                commands: [
                  '/next-match',
                  '/checkin',
                  '/report-score',
                  '/bracket',
                  '/forfait',
                ],
                detail: t.cap2Detail,
              },
              {
                title: t.cap3Title,
                scope: t.scope5Games,
                badges: [
                  'Overwatch',
                  'Valorant',
                  'CS2',
                  'R6 Siege',
                  'Marvel Rivals',
                ],
                detail: t.cap3Detail,
              },
              {
                title: t.cap4Title,
                scope: t.scopeLolDota,
                commands: ['/draft-init'],
                detail: t.cap4Detail,
              },
              {
                title: t.cap5Title,
                scope: t.scopeUniversal,
                commands: ['/lives', '/casters', '/assigner-cast', '/annoncer'],
                detail: t.cap5Detail,
              },
              {
                title: t.cap6Title,
                scope: t.scopeUniversal,
                commands: ['/scrim'],
                detail: t.cap6Detail,
              },
              {
                title: t.cap7Title,
                scope: t.scopeUniversal,
                commands: [
                  '/signalement',
                  '/ma-dispute',
                  '/disputes',
                  '/resoudre-dispute',
                ],
                detail: t.cap7Detail,
              },
              {
                title: t.cap8Title,
                scope: t.scopeUniversal,
                commands: ['/classement', '/stats', '/historique', '/profil'],
                detail: t.cap8Detail,
              },
              {
                title: t.cap9Title,
                scope: t.scopeUniversal,
                commands: ['/help', '/aide-tournoi', '/demander-bot', '/me'],
                detail: t.cap9Detail,
              },
            ].map((cap) => (
              <div
                key={cap.title}
                className="flex flex-col gap-3 card-brand rounded-2xl bg-white/[0.05] p-5 shadow-xl shadow-black/20 transition hover:bg-white/[0.07]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-semibold text-white">
                    {cap.title}
                  </h3>
                  <span className="shrink-0 rounded-full border border-purple-300/30 bg-purple-500/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-purple-100">
                    {cap.scope}
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-gray-300">
                  {cap.detail}
                </p>

                {cap.commands && cap.commands.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cap.commands.map((cmd) => (
                      <code
                        key={cmd}
                        className="rounded-md border border-white/10 bg-neutral-900/80 px-2 py-0.5 text-[11px] font-mono text-cyan-200"
                      >
                        {cmd}
                      </code>
                    ))}
                  </div>
                )}

                {cap.badges && cap.badges.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {cap.badges.map((b) => (
                      <span
                        key={b}
                        className="rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-100"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-gray-300 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex-1">
              <span className="font-semibold text-white">
                {t.multiTenantLabel}
              </span>
              {t.multiTenantBody}
            </p>
            <Link
              href="/onboard"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-[var(--color-violet)] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-current"
              >
                <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.514.075.075 0 0 0-.079.037 13.74 13.74 0 0 0-.608 1.249 18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.2 14.2 0 0 0 1.226-1.994.076.076 0 0 0-.041-.105 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.956-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.956 2.42-2.157 2.42zm7.974 0c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42z" />
              </svg>
              {t.inviteBotCta}
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading" className="space-y-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              {t.faqEyebrow}
            </p>
            <h2
              id="faq-heading"
              className="text-3xl font-bold text-brand-gradient"
            >
              {t.faqTitle}
            </h2>
            <span className="brand-rule" aria-hidden />
            <p className="text-sm text-gray-300 max-w-3xl">
              {t.faqIntroBefore}
              <code className="rounded border border-white/10 bg-neutral-900/80 px-1.5 py-0.5 font-mono text-[12px] text-cyan-200">
                /aide-tournoi
              </code>
              {t.faqIntroAfter}
            </p>
          </div>

          <div className="space-y-3">
            {[
              { q: t.faq1Question, a: t.faq1Answer },
              { q: t.faq2Question, a: t.faq2Answer },
              { q: t.faq3Question, a: t.faq3Answer },
              { q: t.faq4Question, a: t.faq4Answer },
              { q: t.faq5Question, a: t.faq5Answer },
              { q: t.faq6Question, a: t.faq6Answer },
              { q: t.faq7Question, a: t.faq7Answer },
            ].map((item, idx) => (
              <details
                key={idx}
                className="group rounded-2xl border border-white/10 bg-white/[0.04] open:border-purple-300/30 open:bg-white/[0.07]"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-base font-semibold text-white transition hover:text-purple-200">
                  <span>{item.q}</span>
                  <span
                    aria-hidden
                    className="text-xl leading-none text-purple-300 transition group-open:rotate-45"
                  >
                    +
                  </span>
                </summary>
                <div className="border-t border-white/10 px-5 py-4 text-sm leading-relaxed text-gray-300">
                  {item.a}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* CTA final */}
        <section className="section-brand-bg card-brand rounded-2xl bg-white/[0.05] p-6 sm:p-8 text-center">
          <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
            {t.ctaEyebrow}
          </p>
          <h3 className="mt-2 text-2xl font-semibold text-brand-gradient">
            {t.ctaTitle}
          </h3>
          <span className="brand-rule mx-auto mt-3" aria-hidden />
          <p className="mt-3 text-sm text-gray-200 max-w-3xl mx-auto">
            {t.ctaDesc}
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="rounded-full bg-[var(--color-violet)] px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:bg-[var(--color-violet-deep)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet-light)]"
            >
              {t.ctaContact}
            </Link>
            <Link
              href="/partenaires"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:border-[var(--color-green)]/60 hover:bg-[var(--color-green)]/10 hover:text-[var(--color-green-light)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-green)]"
            >
              {t.ctaBecomePartner}
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const gamesSeo: SeoProps = {
  title: {
    fr: 'Jeux supportés — tournois esport féminin multi-jeux',
    en: "Supported games — multi-game women's esport tournaments",
  },
  description: {
    fr: "OW Women's Cup gère désormais 8 jeux esport (Overwatch, Valorant, CS2, R6 Siege, Marvel Rivals, Rocket League, League of Legends, Dota 2) avec veto, draft et match threads Discord automatisés.",
    en: "OW Women's Cup now runs 8 esport titles (Overwatch, Valorant, CS2, R6 Siege, Marvel Rivals, Rocket League, League of Legends, Dota 2) with veto, draft and automated Discord match threads.",
  },
};

GamesPage.seo = gamesSeo;

export default GamesPage;
