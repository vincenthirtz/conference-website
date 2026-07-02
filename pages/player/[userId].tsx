// pages/player/[userId].tsx
// Profil PUBLIC d'une joueuse : rating actuel + rang, peak, bilan, courbe de
// progression (sparkline SVG maison — aucune lib de charts dans le repo),
// derniers matchs et head-to-head.
//
// Lecture publique via GET /api/players/[userId]/profile (tenant par défaut
// géré côté serveur). Fetch client, états loading / 404 / erreur.
//
// NB : ce fichier est une route dynamique sous /player/*. Next.js résout les
// routes statiques (profile.tsx, matches.tsx, …) AVANT [userId], donc l'espace
// joueur authentifié n'est jamais masqué par cette page.

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type {
  PlayerProfileResponse,
  PlayerProfileHistoryPoint,
  PlayerProfileRecentMatch,
  PlayerProfileH2H,
  PlayerProfileCore,
} from '@/types/rating';

type FetchState =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'error' }
  | { status: 'ok'; data: PlayerProfileResponse };

function coreLabel(p: PlayerProfileCore): string {
  return p.displayName ?? p.battleTag ?? 'Joueuse inconnue';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function PlayerProfilePage() {
  const router = useRouter();
  const { userId } = router.query;
  const [state, setState] = useState<FetchState>({ status: 'loading' });

  const load = useCallback(async (id: string) => {
    setState({ status: 'loading' });
    try {
      const res = await fetch(
        `/api/players/${encodeURIComponent(id)}/profile`
      );
      if (res.status === 404) {
        setState({ status: 'notfound' });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as PlayerProfileResponse;
      setState({ status: 'ok', data });
    } catch {
      setState({ status: 'error' });
    }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    if (typeof userId !== 'string' || !userId) {
      setState({ status: 'notfound' });
      return;
    }
    void load(userId);
  }, [router.isReady, userId, load]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6">
        <Link
          href="/leaderboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
        >
          ← Retour au classement
        </Link>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'notfound' && <NotFoundState />}
        {state.status === 'error' && (
          <ErrorState
            onRetry={() =>
              typeof userId === 'string' ? void load(userId) : undefined
            }
          />
        )}
        {state.status === 'ok' && <Profile data={state.data} />}
      </main>
    </div>
  );
}

function Profile({ data }: { data: PlayerProfileResponse }) {
  const { player, history, recentMatches, h2h } = data;
  const label = coreLabel(player);

  return (
    <>
      <ProfileHeader player={player} label={label} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-purple-300">
          Progression du rating
        </h2>
        <RatingChart history={history} />
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <RecentMatches matches={recentMatches} />
        <HeadToHead rows={h2h} />
      </div>
    </>
  );
}

function ProfileHeader({
  player,
  label,
}: {
  player: PlayerProfileCore;
  label: string;
}) {
  const total = player.wins + player.losses;
  const winRate = total > 0 ? Math.round((player.wins / total) * 100) : null;

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6">
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        {player.avatarUrl ? (
          <Image
            src={player.avatarUrl}
            alt=""
            width={80}
            height={80}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-neutral-800 text-2xl font-bold uppercase">
            {label[0]}
          </span>
        )}

        <div className="flex-1 text-center sm:text-left">
          <h1 className="text-2xl font-bold sm:text-3xl">{label}</h1>
          {player.displayName && player.battleTag ? (
            <p className="text-sm text-neutral-500">{player.battleTag}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-neutral-400 sm:justify-start">
            <span>
              Rang{' '}
              <span className="font-semibold text-white">#{player.rank}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              {player.gamesPlayed} match{player.gamesPlayed > 1 ? 's' : ''}
            </span>
            {winRate !== null && (
              <>
                <span aria-hidden>·</span>
                <span>{winRate}% de victoires</span>
              </>
            )}
          </div>
        </div>

        <div className="text-center">
          <div className="text-4xl font-bold text-purple-300">
            {Math.round(player.rating)}
          </div>
          <div
            className="text-xs text-neutral-500"
            title="Incertitude du rating (écart-type). Plus la valeur est basse, plus le rating est fiable."
          >
            ± {Math.round(player.rd)} · pic {Math.round(player.peakRating)}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-neutral-800 pt-5 text-center">
        <Stat value={player.wins} label="Victoires" tone="text-emerald-400" />
        <Stat value={player.losses} label="Défaites" tone="text-rose-400" />
        <Stat
          value={Math.round(player.peakRating)}
          label="Pic de rating"
          tone="text-amber-300"
        />
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone: string;
}) {
  return (
    <div>
      <div className={`text-xl font-semibold ${tone}`}>{value}</div>
      <div className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
    </div>
  );
}

// --- Sparkline SVG maison (pas de dépendance de charts) --------------------
function RatingChart({ history }: { history: PlayerProfileHistoryPoint[] }) {
  if (history.length < 2) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-sm text-neutral-400">
        Pas encore assez de matchs pour tracer une courbe de progression.
      </div>
    );
  }

  const W = 720;
  const H = 200;
  const PAD_X = 8;
  const PAD_Y = 16;

  // On construit la série à partir de ratingAfter (état après chaque match),
  // précédé du ratingBefore du 1er point pour montrer le point de départ.
  const values = [history[0].ratingBefore, ...history.map((h) => h.ratingAfter)];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const stepX = (W - PAD_X * 2) / (values.length - 1);
  const scaleY = (v: number) =>
    PAD_Y + (H - PAD_Y * 2) * (1 - (v - min) / span);

  const points = values.map((v, i) => ({
    x: PAD_X + i * stepX,
    y: scaleY(v),
  }));

  const linePath = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ');
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(
    1
  )} ${H - PAD_Y} L ${points[0].x.toFixed(1)} ${H - PAD_Y} Z`;

  const last = values[values.length - 1];
  const first = values[0];
  const delta = Math.round(last - first);

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-neutral-400">
        <span>Min {Math.round(min)}</span>
        <span
          className={
            delta > 0
              ? 'text-emerald-400'
              : delta < 0
                ? 'text-rose-400'
                : 'text-neutral-400'
          }
        >
          {delta > 0 ? '+' : ''}
          {delta} pts
        </span>
        <span>Max {Math.round(max)}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full sm:h-48"
        preserveAspectRatio="none"
        role="img"
        aria-label={`Courbe de progression du rating, de ${Math.round(
          first
        )} à ${Math.round(last)} points sur ${history.length} matchs.`}
      >
        <defs>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgb(168 85 247)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="rgb(168 85 247)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#ratingFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="rgb(192 132 252)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={2.5}
            fill="rgb(216 180 254)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

function RecentMatches({
  matches,
}: {
  matches: PlayerProfileRecentMatch[];
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-purple-300">
        Derniers matchs
      </h2>
      {matches.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
          Aucun match récent.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-800/60 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
          {matches.map((m) => (
            <li
              key={m.matchId}
              className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
            >
              <ResultBadge result={m.result} />
              <div className="min-w-0 flex-1 truncate">
                {m.opponentTeamName ? (
                  <span className="truncate text-neutral-200">
                    vs {m.opponentTeamName}
                  </span>
                ) : (
                  <span className="text-neutral-500">Adversaire inconnu</span>
                )}
              </div>
              <span className="shrink-0 text-xs text-neutral-500">
                {formatDate(m.occurredAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultBadge({ result }: { result: 'win' | 'loss' | 'draw' }) {
  const map = {
    win: { label: 'V', cls: 'bg-emerald-500/15 text-emerald-400' },
    loss: { label: 'D', cls: 'bg-rose-500/15 text-rose-400' },
    draw: { label: 'N', cls: 'bg-neutral-500/15 text-neutral-300' },
  } as const;
  const m = map[result];
  return (
    <span
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.cls}`}
    >
      {m.label}
    </span>
  );
}

function HeadToHead({ rows }: { rows: PlayerProfileH2H[] }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-purple-300">
        Face-à-face
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
          Aucun face-à-face enregistré.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-left">Adversaire</th>
                <th className="px-4 py-3 text-right">V - D</th>
                <th className="px-4 py-3 text-right">Matchs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const oppLabel =
                  r.opponentDisplayName ??
                  r.opponentBattleTag ??
                  'Joueuse inconnue';
                return (
                  <tr
                    key={r.opponentUserId}
                    className="border-t border-neutral-800/60 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/player/${r.opponentUserId}`}
                        className="hover:text-purple-300"
                      >
                        {oppLabel}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className="text-emerald-400">{r.wins}</span>
                      <span className="text-neutral-600"> - </span>
                      <span className="text-rose-400">{r.losses}</span>
                    </td>
                    <td className="px-4 py-3 text-right text-neutral-300">
                      {r.games}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function LoadingState() {
  return (
    <div className="space-y-8">
      <div className="h-44 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/40" />
      <div className="h-52 animate-pulse rounded-2xl border border-neutral-800 bg-neutral-900/40" />
    </div>
  );
}

function NotFoundState() {
  return (
    <section className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-2xl">
        🔍
      </div>
      <h1 className="mb-2 text-xl font-semibold">Joueuse introuvable</h1>
      <p className="mx-auto mb-6 max-w-md text-sm text-neutral-400">
        Cette joueuse n&apos;existe pas ou n&apos;a pas encore de rating.
      </p>
      <Link
        href="/leaderboard"
        className="rounded-md bg-purple-500 px-4 py-2 text-sm font-semibold transition-colors hover:bg-purple-400"
      >
        Voir le classement
      </Link>
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="py-16 text-center" role="alert">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full border border-red-500/30 bg-red-500/10">
        <svg
          className="h-8 w-8 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
      </div>
      <h1 className="mb-2 text-xl font-semibold">
        Impossible de charger ce profil
      </h1>
      <p className="mb-6 text-neutral-400">
        Une erreur est survenue. Réessayez dans quelques instants.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-purple-500 px-4 py-2 text-sm font-semibold transition-colors hover:bg-purple-400"
      >
        Réessayer
      </button>
    </section>
  );
}

const playerProfileSeo: SeoProps = {
  title: 'Profil joueuse — OW Women’s Cup',
  description:
    'Profil public : rating, progression, derniers matchs et face-à-face de la joueuse.',
};

PlayerProfilePage.seo = playerProfileSeo;
