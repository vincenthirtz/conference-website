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
      "Marvel Rivals propose Domination, Convoy et Convergence sur un pool de 11 cartes : tournois BO1/3/5 avec veto pour éviter les cartes « maison ».",
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
            Les jeux de la scène OW Women&apos;s Cup
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
            féminine de ton jeu mérite un tournoi outillé comme le nôtre,
            dis-le nous, on regarde ensemble.
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
