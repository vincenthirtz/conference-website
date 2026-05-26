import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { listGames } from '@/config/games';
import type { GameDef, GameSlug, MatchFormat } from '@/config/games';

const GAME_COPY: Record<GameSlug, { tagline: string; pitch: string }> = {
  overwatch: {
    tagline: 'Le titre fondateur de la communauté.',
    pitch:
      "Le hero shooter de Blizzard est le cœur de l'OW Women's Cup depuis 2025. Map veto complet, pool de 29 maps et formats BO1/3/5 pour les phases finales.",
  },
  valorant: {
    tagline: 'Tactique 5v5 sur la scène FPS.',
    pitch:
      'Le tactical shooter de Riot intègre notre stack tournoi avec son pool compétitif (Ascent, Bind, Lotus, Sunset…) et un veto inspiré du ruleset VCT.',
  },
  cs2: {
    tagline: 'Le mythe du tir 5v5.',
    pitch:
      'Counter-Strike 2 utilise les séquences de veto ESL / Major (ban-ban-pick-pick-ban-ban-decider) sur les active-duty maps officielles.',
  },
  'r6-siege': {
    tagline: 'Siège tactique 5v5, destruction & gadgets.',
    pitch:
      'Rainbow Six Siege rejoint le programme avec son pool ranked complet (Bank, Clubhouse, Kafe, Nighthaven Labs…) et un veto calé sur les règles esport.',
  },
  'marvel-rivals': {
    tagline: '6v6 hero shooter Marvel.',
    pitch:
      'Marvel Rivals propose Domination, Convoy et Convergence sur un pool de 11 cartes : tournois BO1/3/5 avec veto pour éviter les cartes « maison ».',
  },
  'rocket-league': {
    tagline: 'Voitures-fusées, 3v3, sport mécanique.',
    pitch:
      'Rocket League se passe de veto (arène fixe) mais utilise des formats longs BO3/5/7 pour les playoffs : la stack tournoi gère directement le match sans veto.',
  },
  lol: {
    tagline: 'MOBA Riot, Tournament Draft.',
    pitch:
      "League of Legends utilise le Tournament Draft officiel : 10 bans + 10 picks répartis en deux phases. Le bot lance la draft sur Discord et la pousse à l'UI live.",
  },
  dota2: {
    tagline: 'MOBA Valve, Captains Mode.',
    pitch:
      'Dota 2 utilise le Captains Mode (patch 7.34+) : 9 bans + 10 picks en trois phases, géré de bout en bout par notre moteur de draft multi-jeux.',
  },
};

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
  const copy = GAME_COPY[game.slug] ?? {
    tagline: '',
    pitch:
      'Jeu supporté par la stack tournoi multi-jeux : inscription, bracket, scoring et match thread Discord automatisés.',
  };
  const gradient =
    GAME_GRADIENT[game.slug] ?? 'from-purple-500 via-fuchsia-500 to-pink-500';

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-black/30 transition hover:border-white/25 hover:bg-white/[0.06]">
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
              Map veto
            </span>
          )}
          {game.hasDraft && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-100">
              Draft
            </span>
          )}
          {game.mapPool.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white">
              {game.mapPool.length} maps
            </span>
          )}
          {!game.hasMapVeto && game.mapPool.length === 0 && (
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-300">
              Map fixe
            </span>
          )}
        </div>

        {/* Formats supportes */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
          <span className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
            Formats
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
      label: 'jeux supportés',
      sub: 'FPS, MOBA, sport mécanique',
    },
    {
      value: String(totalMaps),
      label: 'maps cumulées',
      sub: 'toutes pool confondues',
    },
    {
      value: String(vetoGames),
      label: 'jeux avec veto',
      sub: 'séquences ESL / VCT auto',
    },
    {
      value: String(draftGames),
      label: 'jeux avec draft',
      sub: 'LoL & Dota 2',
    },
    {
      value: String(allFormats.size),
      label: 'formats',
      sub: 'BO1 → BO7 selon le jeu',
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
            Multi-jeux
          </p>
          <h1 className="mt-4 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            Les jeux supportés par le système de la Women&apos;s Cup
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-200">
            Notre stack tournoi (bracket, veto, draft, match threads Discord)
            est maintenant <strong>multi-jeux</strong>. {games.length} titres
            sont supportés nativement : choisis ton jeu, ton format, et lance la
            machine.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link
              href="/inscription-2026"
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Inscrire mon équipe
            </Link>
            <Link
              href="/tournaments"
              className="rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Voir les tournois
            </Link>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-6xl space-y-16 px-4 pb-20 sm:px-6">
        {/* En chiffres */}
        <section aria-labelledby="stats-heading" className="-mt-6 sm:-mt-10">
          <h2 id="stats-heading" className="sr-only">
            En chiffres
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {heroStats.map((stat) => (
              <div
                key={stat.label}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-xl shadow-black/20"
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
              Catalogue
            </p>
            <h2
              id="games-grid-heading"
              className="text-3xl font-bold text-white"
            >
              {games.length} jeux pris en charge
            </h2>
            <p className="text-sm text-gray-300 max-w-3xl">
              Pour chaque titre on gère les inscriptions, les vetos / drafts,
              les scores et la diffusion sur Discord. Pas besoin d&apos;outil
              externe.
            </p>
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
              Comparatif
            </p>
            <h2 id="compare-heading" className="text-3xl font-bold text-white">
              Tout sur une grille
            </h2>
            <p className="text-sm text-gray-300 max-w-3xl">
              Capacités du moteur tournoi par jeu. Utile pour choisir ton format
              ou comparer deux titres rapidement.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03]">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-white/10 bg-white/[0.04] text-[11px] uppercase tracking-[0.14em] text-gray-300">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Jeu
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Map veto
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Draft
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Maps
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Formats
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
                          <span className="text-emerald-300">✓ Oui</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {game.hasDraft ? (
                          <span className="text-amber-300">✓ Oui</span>
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-200">
                        {game.mapPool.length > 0
                          ? `${game.mapPool.length} maps`
                          : 'Map fixe'}
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
              Pipeline
            </p>
            <h2 id="how-heading" className="text-3xl font-bold text-white">
              Comment ça marche
            </h2>
            <p className="text-sm text-gray-300 max-w-3xl">
              La même stack pour tous les jeux : zéro friction pour les équipes,
              zéro copier-coller pour le staff.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {[
              {
                step: '1',
                title: 'Inscris ton équipe',
                detail:
                  "Crée ton équipe, choisis ton jeu et ton format. La plateforme vérifie la composition et te place dans le bracket dès l'ouverture des inscriptions.",
              },
              {
                step: '2',
                title: 'Veto / draft automatisé',
                detail:
                  "Avant chaque match, l'outil lance le veto ou la draft (selon le jeu) avec timer, alternance auto et historique. Aucun staff nécessaire.",
              },
              {
                step: '3',
                title: 'Match thread Discord live',
                detail:
                  'Le bot ouvre un thread dédié, publie le scoreboard, relève les scores et clôt le match. Les casters et les viewers suivent en direct.',
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.05] p-6 shadow-xl shadow-black/20"
              >
                <span
                  aria-hidden
                  className="absolute -right-4 -top-6 text-[6rem] font-black leading-none text-white/[0.04]"
                >
                  {item.step}
                </span>
                <p className="text-xs uppercase tracking-[0.16em] text-purple-200">
                  Étape {item.step}
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
              Discord
            </p>
            <h2 id="bot-heading" className="text-3xl font-bold text-white">
              Le bot Discord, ton cockpit
            </h2>
            <p className="text-sm text-gray-300 max-w-3xl">
              Tout passe par des commandes slash : inscription, match, veto,
              draft, score, dispute. Une seule interface, identique pour tous
              les jeux.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                title: 'Tournois & équipes',
                scope: 'Universel',
                commands: [
                  '/creer-tournoi',
                  '/publier-tournoi',
                  '/inscrire-equipe',
                  '/creer-mon-equipe',
                  '/inviter',
                  '/roster',
                ],
                detail:
                  'Création, publication, inscriptions, gestion du roster. La commande /creer-tournoi propose les 8 jeux au choix.',
              },
              {
                title: 'Match live',
                scope: 'Universel',
                commands: [
                  '/next-match',
                  '/checkin',
                  '/report-score',
                  '/bracket',
                  '/forfait',
                ],
                detail:
                  'Le bot ouvre un thread Discord par match, suit le check-in, collecte les scores et propage la victoire dans le bracket automatiquement.',
              },
              {
                title: 'Map veto',
                scope: '5 jeux',
                badges: [
                  'Overwatch',
                  'Valorant',
                  'CS2',
                  'R6 Siege',
                  'Marvel Rivals',
                ],
                detail:
                  'Veto automatisé en DM avec les capitaines : alternance, timer, séquences ESL/VCT spécifiques au jeu. Aucune saisie manuelle côté staff.',
              },
              {
                title: 'Draft MOBA',
                scope: 'LoL & Dota 2',
                commands: ['/draft-init'],
                detail:
                  'Tournament Draft (LoL) et Captains Mode (Dota 2) gérés de bout en bout : bans, picks, fearless draft, timer serveur et UI spectateur live.',
              },
              {
                title: 'Cast & live',
                scope: 'Universel',
                commands: ['/lives', '/casters', '/assigner-cast', '/annoncer'],
                detail:
                  'Coordination des casters, attribution des matchs à caster, annonces multi-channels et relais des lives Twitch.',
              },
              {
                title: 'Scrims & entraînement',
                scope: 'Universel',
                commands: ['/scrim'],
                detail:
                  'Création de scrims publics, recherche d’adversaire, fil dédié et rappels automatiques. Marche pour tous les jeux du registry.',
              },
              {
                title: 'Disputes & arbitrage',
                scope: 'Universel',
                commands: [
                  '/signalement',
                  '/ma-dispute',
                  '/disputes',
                  '/resoudre-dispute',
                ],
                detail:
                  'Forum disputes dédié, suivi par le staff arbitrage et notifications aux capitaines à chaque évolution.',
              },
              {
                title: 'Stats & classement',
                scope: 'Universel',
                commands: ['/classement', '/stats', '/historique', '/profil'],
                detail:
                  'Classement live du tournoi, stats agrégées par équipe et joueur, historique des matchs avec replay du veto/draft.',
              },
              {
                title: 'Aide & support',
                scope: 'Universel',
                commands: ['/help', '/aide-tournoi', '/demander-bot', '/me'],
                detail:
                  'Une aide contextuelle par commande, un canal /aide-tournoi pour le staff et l’enregistrement du bot sur d’autres serveurs.',
              },
            ].map((cap) => (
              <div
                key={cap.title}
                className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.05] p-5 shadow-xl shadow-black/20 transition hover:border-white/25 hover:bg-white/[0.07]"
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
              <span className="font-semibold text-white">Multi-tenant :</span>{' '}
              le bot peut tourner sur plusieurs serveurs Discord avec un
              cloisonnement total des tournois, des équipes et des stats.
              Pratique si une autre asso veut bénéficier de la même stack.
            </p>
            <Link
              href="/onboard"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-900/40 transition hover:brightness-110"
            >
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="h-4 w-4 fill-current"
              >
                <path d="M20.317 4.369a19.79 19.79 0 0 0-4.885-1.514.075.075 0 0 0-.079.037 13.74 13.74 0 0 0-.608 1.249 18.27 18.27 0 0 0-5.487 0 12.65 12.65 0 0 0-.617-1.25.077.077 0 0 0-.079-.036A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.2 14.2 0 0 0 1.226-1.994.076.076 0 0 0-.041-.105 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.371-.291a.074.074 0 0 1 .078-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .079.009c.12.099.245.198.372.292a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.041.106c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.331c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.956-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.956 2.42-2.157 2.42zm7.974 0c-1.182 0-2.157-1.086-2.157-2.42 0-1.333.955-2.42 2.157-2.42 1.21 0 2.176 1.096 2.157 2.42 0 1.334-.946 2.42-2.157 2.42z" />
              </svg>
              Inviter le bot sur mon serveur
            </Link>
          </div>
        </section>

        {/* FAQ */}
        <section aria-labelledby="faq-heading" className="space-y-6">
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-[0.18em] text-gray-300">
              FAQ
            </p>
            <h2 id="faq-heading" className="text-3xl font-bold text-white">
              Les questions qu&apos;on nous pose
            </h2>
            <p className="text-sm text-gray-300 max-w-3xl">
              Une autre question ? Le canal{' '}
              <code className="rounded border border-white/10 bg-neutral-900/80 px-1.5 py-0.5 font-mono text-[12px] text-cyan-200">
                /aide-tournoi
              </code>{' '}
              du Discord est ouvert à toutes les capitaines.
            </p>
          </div>

          <div className="space-y-3">
            {[
              {
                q: 'Mon jeu préféré n’est pas dans la liste, vous pouvez l’ajouter ?',
                a: 'Oui — la stack est conçue pour ça. Ajouter un jeu se fait en déclarant son registry (pool de cartes ou flow de draft, formats supportés) et en mettant à jour la commande /creer-tournoi. Compte une à deux semaines selon la complexité. Ouvre une discussion via la page Contact pour qu’on en discute.',
              },
              {
                q: 'Comment fonctionne le map veto exactement ?',
                a: 'Le bot envoie un DM aux deux capitaines dès que le match est prêt. Chaque capitaine ban ou pick à son tour selon la séquence du jeu (ESL/Major pour CS2, VCT pour Valorant, etc.), avec un timer serveur. La séquence est rejouée dans le thread Discord et stockée pour l’historique du match.',
              },
              {
                q: 'Pourquoi seuls LoL et Dota 2 ont un draft de héros ?',
                a: 'Parce que ces deux jeux ont une vraie phase de draft formalisée (Tournament Draft pour LoL, Captains Mode pour Dota 2) où les bans/picks alternent. Les hero shooters comme Overwatch ou Marvel Rivals ont du hero swap libre en partie : il n’y a rien à drafter avant le match.',
              },
              {
                q: 'Le bot peut-il tourner sur d’autres serveurs Discord ?',
                a: 'Oui. Le bot est multi-tenant : on peut l’inviter sur n’importe quel serveur. Chaque serveur a ses propres tournois, équipes et stats, cloisonnés via un identifiant de tenant. Le bouton « Inviter le bot sur mon serveur » au-dessus lance la procédure self-service.',
              },
              {
                q: 'Quel format choisir pour mon tournoi ?',
                a: 'BO1 = match unique (rapide, idéal pour les phases de groupes). BO3 = standard compétitif, deux maps gagnantes sur trois. BO5 = grandes finales. BO7 = uniquement Rocket League (sport mécanique, parties courtes). Tu peux mélanger les formats : par exemple BO1 en poules et BO3 en élimination.',
              },
              {
                q: 'Combien ça coûte pour utiliser le système ?',
                a: 'Zéro. La stack est open et l’association OW Women’s Cup la maintient comme outil communautaire. Tu peux participer à nos tournois, ou inviter le bot sur ton serveur si tu organises les tiens — dans tous les cas il n’y a pas de licence.',
              },
              {
                q: 'Est-ce que je peux suivre les matchs en direct sans installer le bot ?',
                a: 'Oui : tous les matchs publics sont visibles sur ce site (bracket, scores, replay du veto et de la draft) et les casts Twitch sont relayés sur la page Live. Le bot est l’outil des joueuses et du staff, pas une obligation pour le public.',
              },
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
        <section className="rounded-2xl border border-white/10 bg-white/[0.05] p-6 sm:p-8 text-center">
          <p className="text-sm uppercase tracking-[0.14em] text-gray-300">
            Suggestion
          </p>
          <h3 className="mt-2 text-2xl font-semibold">
            Tu veux qu&apos;on ajoute ton jeu ?
          </h3>
          <p className="mt-3 text-sm text-gray-200 max-w-3xl mx-auto">
            La stack est conçue pour accueillir de nouveaux titres. Si la scène
            féminine de ton jeu mérite un tournoi outillé comme le nôtre, dis-le
            nous, on regarde ensemble.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <Link
              href="/contact"
              className="rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
            >
              Nous contacter
            </Link>
            <Link
              href="/partenaires"
              className="rounded-full border border-white/20 px-5 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Devenir partenaire
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}

const gamesSeo: SeoProps = {
  title: 'Jeux supportés — tournois esport féminin multi-jeux',
  description:
    "OW Women's Cup gère désormais 8 jeux esport (Overwatch, Valorant, CS2, R6 Siege, Marvel Rivals, Rocket League, League of Legends, Dota 2) avec veto, draft et match threads Discord automatisés.",
};

GamesPage.seo = gamesSeo;

export default GamesPage;
