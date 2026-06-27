// pages/player/matches.tsx
// Espace joueur — "Mes matchs". Liste les matchs de l'equipe du joueur,
// scindes en "A venir" et "Resultats". Donnees via GET /api/player/matches.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type { PlayerMatchesPayload } from '@/pages/api/player/matches';

import { logger } from '../../utils/logger';

type PlayerMatch = PlayerMatchesPayload['matches'][number];

function formatScheduled(iso: string | null): string {
  if (!iso) return 'Date à venir';
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  });
}

function formatLabel(match: PlayerMatch): string | null {
  if (match.format) return match.format.toUpperCase();
  if (match.bestOf) return `BO${match.bestOf}`;
  return null;
}

function isUpcoming(match: PlayerMatch): boolean {
  if (match.status === 'pending' || match.status === 'ongoing') return true;
  if (match.scheduledAt) {
    return new Date(match.scheduledAt).getTime() > Date.now();
  }
  return false;
}

function scheduledTime(match: PlayerMatch): number {
  return match.scheduledAt ? new Date(match.scheduledAt).getTime() : 0;
}

function ResultBadge({ result }: { result: PlayerMatch['result'] }) {
  if (result === 'win') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
        Victoire
      </span>
    );
  }
  if (result === 'loss') {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
        Défaite
      </span>
    );
  }
  if (result === 'draw') {
    return (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-200">
        Nul
      </span>
    );
  }
  return null;
}

function MatchCard({ match }: { match: PlayerMatch }) {
  const upcoming = isUpcoming(match);
  const checkin = match.checkin;
  const label = formatLabel(match);
  const isLive = match.status === 'ongoing';

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-purple-200/80">
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
            </span>
            En direct
          </span>
        )}
        {match.tournament && (
          <span>
            {match.tournament.slug ? (
              <Link
                href={`/tournament/${encodeURIComponent(match.tournament.slug)}`}
                className="hover:text-white transition"
              >
                {match.tournament.name}
              </Link>
            ) : (
              match.tournament.name
            )}
          </span>
        )}
        {match.roundName && <span>{match.roundName}</span>}
        {label && <span className="tabular-nums">{label}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-xl md:text-2xl font-bold text-white leading-tight">
            <span className="text-white/50">vs</span>{' '}
            {match.opponent?.name ?? 'Adversaire à définir'}
          </h3>
          <p className="text-sm text-gray-300 mt-1">
            <span className="capitalize">
              {formatScheduled(match.scheduledAt)}
            </span>
          </p>
        </div>

        {!upcoming && match.score && (
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-2xl font-bold text-white">
              {match.score.mine ?? '–'} <span className="text-white/40">–</span>{' '}
              {match.score.opponent ?? '–'}
            </span>
            <ResultBadge result={match.result} />
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Link
          href={`/match/${match.id}`}
          className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10"
        >
          Voir le match
          <span aria-hidden>→</span>
        </Link>

        {match.streamUrl && (
          <a
            href={match.streamUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-sm font-medium text-fuchsia-100 transition hover:bg-fuchsia-500/20"
          >
            Live cast
            <span aria-hidden>↗</span>
          </a>
        )}

        {upcoming && checkin?.alreadyCheckedIn && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-100">
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
            Check-in validé
          </span>
        )}

        {upcoming && checkin?.isOpen && !checkin.alreadyCheckedIn && (
          <Link
            href="/player/checkin"
            className="inline-flex items-center gap-1 rounded-full bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            Check-in
            <span aria-hidden>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function PlayerMatches() {
  const {
    user,
    loading: authLoading,
    ready,
  } = usePlayerSession({
    redirectTo: '/login?next=/player/matches',
  });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<PlayerMatchesPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const json = await adminFetchJson<PlayerMatchesPayload>(
        '/api/player/matches',
        { skipAuthRedirect: true }
      );
      setData(json);
    } catch (err) {
      logger.error('[player/matches] load error:', err);
      setError('Erreur lors du chargement de tes matchs.');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  if (authLoading || (loading && !data)) {
    return <PlayerPageSkeleton rows={3} />;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-md mx-auto px-4 py-10 pt-32 text-center">
          <h1 className="text-3xl font-bold text-gradient">Mes matchs</h1>
          <p className="mt-4 text-gray-300">
            Connecte-toi pour voir les matchs de ton équipe.
          </p>
          <Link
            href="/login?next=/player/matches"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
          >
            Se connecter
          </Link>
        </main>
      </div>
    );
  }

  const matches = data?.matches ?? [];
  const upcoming = matches
    .filter(isUpcoming)
    .sort((a, b) => scheduledTime(a) - scheduledTime(b));
  const past = matches
    .filter((m) => !isUpcoming(m))
    .sort((a, b) => scheduledTime(b) - scheduledTime(a));

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-4xl mx-auto px-4 py-10 pt-24 pb-16">
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Link href="/player" className="hover:text-white transition">
              &larr; Tableau de bord
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mt-2">
            Mes matchs
          </h1>
          {data?.team ? (
            <p className="text-sm text-gray-400 mt-2">
              Calendrier et résultats de {data.team.name}.
            </p>
          ) : (
            <p className="text-sm text-gray-400 mt-2">
              Ton calendrier de matchs.
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        {!data?.team && !error ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 text-center">
            <p className="text-lg font-semibold text-white">
              Tu n&apos;es pas encore dans une équipe
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Rejoins ou crée une équipe pour voir tes matchs ici.
            </p>
            <Link
              href="/player"
              className="mt-6 inline-flex items-center justify-center rounded-full bg-purple-600 hover:bg-purple-500 px-5 py-2.5 text-sm font-medium text-white transition"
            >
              Aller au tableau de bord
            </Link>
          </div>
        ) : data?.team && matches.length === 0 && !error ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-8 text-center">
            <p className="text-lg font-semibold text-white">
              Aucun match programmé
            </p>
            <p className="mt-2 text-sm text-gray-400">
              Tes prochains matchs apparaîtront ici dès qu&apos;ils seront
              planifiés.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 text-white">
                  À venir
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({upcoming.length})
                  </span>
                </h2>
                <div className="space-y-4">
                  {upcoming.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-4 text-white">
                  Résultats
                  <span className="ml-2 text-sm font-normal text-gray-500">
                    ({past.length})
                  </span>
                </h2>
                <div className="space-y-4">
                  {past.map((m) => (
                    <MatchCard key={m.id} match={m} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const playerMatchesSeo: SeoProps = {
  title: 'Mes matchs',
  description:
    "Calendrier et résultats des matchs de ton équipe OW Women's Cup.",
  noindex: true,
};

PlayerMatches.seo = playerMatchesSeo;

export default PlayerMatches;
