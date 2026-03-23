import Link from 'next/link';
import { useState, useEffect } from 'react';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import Button from '@/components/Buttons/button';
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

  useEffect(() => {
    setHeroes(pickTwoRandom());
    // Fetch the mixed tournament ID from site settings
    fetch('/api/site-settings?key=mixte_tournament_id')
      .then((r) => r.json())
      .then((data) => {
        const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (data.value && UUID_RE.test(data.value)) {
          setMixteTournamentId(data.value);
          // Fetch team count for this tournament
          fetch('/api/tournaments')
            .then((r) => r.json())
            .then((json) => {
              const t = json.tournaments?.find((t: any) => t.id === data.value);
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

          <div className="flex flex-wrap gap-4 mt-4 justify-center">
            <Link href={mixteTournamentId ? `/team/create?tournament=${mixteTournamentId}` : '/team/create'}>
              <Button type="button" className="px-8 h-[52px]">
                Inscrire mon équipe
              </Button>
            </Link>
            <Link href={mixteTournamentId ? `/tournament/${mixteTournamentId}` : '/tournament/tournoi-mixte'}>
              <Button type="button" overlay className="px-8 h-[52px] border border-white/20 hover:border-white/40 transition">
                Voir le programme
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default ActualitesPreviewSection;
