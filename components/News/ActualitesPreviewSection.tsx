import Link from 'next/link';
import { useState, useEffect } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import type { JSX } from 'react';

const HEROES = [
  'hero-ana',
  'hero-cassidy',
  'hero-dva',
  'hero-doomfist',
  'hero-genji',
  'hero-junker-queen',
  'hero-kiriko',
  'hero-mercy',
  'hero-orisa',
  'hero-ramattra',
  'hero-reinhardt',
  'hero-sojourn',
  'hero-sombra',
  'hero-tracer',
  'hero-widowmaker',
];

function pickTwoRandom(): [string, string] {
  const shuffled = [...HEROES].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}

function ActualitesPreviewSection(): JSX.Element {
  const [heroes, setHeroes] = useState<[string, string] | null>(null);
  const [mixteTournamentId, setMixteTournamentId] = useState<string | null>(null);
  const [teamCount, setTeamCount] = useState<number | null>(null);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    setHeroes(pickTwoRandom());
    // Fetch the mixed tournament ID from site settings
    fetch('/api/site-settings?key=mixte_tournament_id')
      .then((r) => r.json())
      .then((data) => {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (data.value && UUID_RE.test(data.value)) {
          setMixteTournamentId(data.value);
          // Fetch team count for this specific tournament
          fetch(`/api/tournaments?id=${data.value}`)
            .then((r) => r.json())
            .then((json) => {
              const t = json.tournaments?.[0];
              if (t) setTeamCount(t.team_count ?? 0);
            })
            .catch(() => {});
        }
      })
      .catch(() => {});
  }, []);

  return (
    <section
      id="tournoi-mixte"
      className="container mt-20 mb-16 lg:mb-24 flex flex-col gap-8 px-4 md:px-0"
    >
      <div className="relative overflow-hidden rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-950/40 via-neutral-900/60 to-purple-950/30 p-8 md:p-12">
        {/* Decorative glow */}
        <div className="absolute -top-20 -right-20 h-60 w-60 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 h-60 w-60 rounded-full bg-purple-500/10 blur-3xl" />

        {/* Hero face-off images */}
        {heroes && (
          <>
            <div
              className="absolute left-0 top-0 bottom-0 w-2/5 lg:w-1/3 pointer-events-none hidden md:block opacity-80"
              style={{
                maskImage:
                  'linear-gradient(to right, rgba(0,0,0,0.8) 10%, transparent 85%), linear-gradient(to bottom, rgba(0,0,0,1) 30%, transparent 90%)',
                WebkitMaskImage:
                  'linear-gradient(to right, rgba(0,0,0,0.8) 10%, transparent 85%), linear-gradient(to bottom, rgba(0,0,0,1) 30%, transparent 90%)',
                maskComposite: 'intersect',
                WebkitMaskComposite: 'source-in',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/images/${heroes[0]}.jpg`}
                alt=""
                className="h-full w-full object-cover object-top scale-125 origin-top"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/30 to-transparent mix-blend-color" />
            </div>
            <div
              className="absolute right-0 top-0 bottom-0 w-2/5 lg:w-1/3 pointer-events-none hidden md:block opacity-80"
              style={{
                maskImage:
                  'linear-gradient(to left, rgba(0,0,0,0.8) 10%, transparent 85%), linear-gradient(to bottom, rgba(0,0,0,1) 30%, transparent 90%)',
                WebkitMaskImage:
                  'linear-gradient(to left, rgba(0,0,0,0.8) 10%, transparent 85%), linear-gradient(to bottom, rgba(0,0,0,1) 30%, transparent 90%)',
                maskComposite: 'intersect',
                WebkitMaskComposite: 'source-in',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/images/${heroes[1]}.jpg`}
                alt=""
                className="h-full w-full object-cover object-top scale-125 origin-top -scale-x-100"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-purple-600/30 to-transparent mix-blend-color" />
            </div>
          </>
        )}

        <div className="relative flex flex-col items-center text-center gap-6">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/20 text-blue-300 text-sm font-semibold uppercase tracking-wider">
            <span className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
            3 Avril 2026
          </span>

          <Heading
            typeStyle="heading-md"
            className="text-gradient text-center"
          >
            Tournoi Mixte
          </Heading>

          <div className="max-w-2xl">
            <Paragraph
              typeStyle="body-lg"
              className="mt-2"
              textColor="text-gray-200"
            >
              Tournoi mixte hommes/femmes pour lancer la saison comp&eacute;titive.
              Un avant-go&ucirc;t de ce qui vous attend en octobre&nbsp;!
            </Paragraph>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 w-full max-w-2xl">
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-2xl font-bold text-white">Mixte</div>
              <div className="text-xs text-neutral-400 mt-1">Format ouvert</div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-2xl font-bold text-white">3 Avril</div>
              <div className="text-xs text-neutral-400 mt-1">Save the date</div>
            </div>
            <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 p-4 text-center">
              <div className="text-2xl font-bold text-white">
                {teamCount !== null ? teamCount : '–'}
              </div>
              <div className="text-xs text-blue-300/80 mt-1">
                {teamCount !== null && teamCount > 1 ? 'Équipes inscrites' : 'Équipe inscrite'}
              </div>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
              <div className="text-2xl font-bold text-white">Saison 2026</div>
              <div className="text-xs text-neutral-400 mt-1">Coup d&apos;envoi</div>
            </div>
          </div>

          {/* Cast Mixte */}
          <div className="flex items-center gap-6 mt-4">
            <span className="text-sm font-semibold text-neutral-400 uppercase tracking-wider">Cast</span>
            <div className="flex gap-4">
              <a
                href="https://www.twitch.tv/eiaeltv"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition text-purple-300 text-sm font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                eiaeltv
              </a>
              <a
                href="https://www.twitch.tv/cheikh_daniels"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition text-purple-300 text-sm font-medium"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z"/></svg>
                cheikh_daniels
              </a>
            </div>
          </div>

          <div className="flex flex-wrap gap-4 mt-6 justify-center">
            <Link href={mixteTournamentId ? `/team/create?tournament=${mixteTournamentId}` : '/team/create'}>
              <button
                type="button"
                className="group flex items-center gap-3 px-8 py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 text-white font-semibold text-base shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-300 hover:scale-105"
              >
                <svg className="w-5 h-5 transition-transform duration-300 group-hover:-translate-y-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <line x1="19" y1="8" x2="19" y2="14" />
                  <line x1="22" y1="11" x2="16" y2="11" />
                </svg>
                Inscrire mon équipe
              </button>
            </Link>
            <Link href={mixteTournamentId ? `/tournament/${mixteTournamentId}` : '/tournament/tournoi-mixte'}>
              <button
                type="button"
                className="group flex items-center gap-3 px-8 py-3.5 rounded-xl bg-white/[0.06] backdrop-blur border border-white/15 hover:border-white/30 hover:bg-white/10 text-white font-semibold text-base transition-all duration-300 hover:scale-105"
              >
                <svg className="w-5 h-5 transition-transform duration-300 group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                Voir le programme
              </button>
            </Link>
            <button
              type="button"
              onClick={async () => {
                const url = mixteTournamentId
                  ? `${window.location.origin}/tournament/${mixteTournamentId}`
                  : `${window.location.origin}/tournament/tournoi-mixte`;
                const shareData = {
                  title: 'Tournoi Mixte – OW Women\'s Cup 2026',
                  text: 'Rejoins le Tournoi Mixte OW Women\'s Cup ! Inscris ton équipe et montre ton niveau.',
                  url,
                };
                try {
                  if (navigator.share) {
                    await navigator.share(shareData);
                  } else {
                    await navigator.clipboard.writeText(url);
                    setShareCopied(true);
                    setTimeout(() => setShareCopied(false), 2000);
                  }
                } catch {}
              }}
              className="group flex items-center gap-2.5 px-6 py-3.5 rounded-xl bg-white/[0.06] backdrop-blur border border-white/15 hover:border-emerald-400/40 hover:bg-emerald-500/10 text-white font-semibold text-base transition-all duration-300 hover:scale-105"
            >
              {shareCopied ? (
                <>
                  <svg className="w-5 h-5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span className="text-emerald-300">Lien copié !</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                  Partager
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ActualitesPreviewSection;
