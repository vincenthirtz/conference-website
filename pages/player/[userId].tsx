// pages/player/[userId].tsx
// Profil PUBLIC d'une joueuse : rating actuel + rang, peak, bilan, courbe de
// progression (sparkline SVG maison — aucune lib de charts dans le repo),
// derniers matchs et head-to-head.
//
// Pré-rendu ISR (getStaticPaths fallback:'blocking' + getStaticProps
// revalidate:300) via l'util partagé readPlayerProfile(DEFAULT_TENANT_ID) —
// contenu indexable, SEO/JSON-LD par-entité. Un fetch client rafraîchit
// ensuite le rating live après hydratation. 404 = notFound.
//
// NB : ce fichier est une route dynamique sous /player/*. Next.js résout les
// routes statiques (profile.tsx, matches.tsx, …) AVANT [userId], donc l'espace
// joueur authentifié n'est jamais masqué par cette page.

import { useCallback, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useIsrRefresh } from '@/hooks/useIsrRefresh';
import type {
  GetStaticPaths,
  GetStaticProps,
  InferGetStaticPropsType,
} from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import type {
  PlayerProfileResponse,
  PlayerProfileHistoryPoint,
  PlayerProfileRecentMatch,
  PlayerProfileH2H,
  PlayerProfileCore,
  ProfileBadge,
  ProfileBadgeTier,
  ProfilePlacement,
  ProfileSeason,
} from '@/types/rating';
import { readPlayerProfile } from '@/utils/rating/readPlayerProfile';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { useToast } from '@/components/Toast';

type PlayerProfileDict = ReturnType<typeof useT<'playerPublicProfile'>>;

type FetchState =
  | { status: 'loading' }
  | { status: 'notfound' }
  | { status: 'error' }
  | { status: 'ok'; data: PlayerProfileResponse };

function coreLabel(p: PlayerProfileCore): string {
  return p.displayName ?? p.battleTag ?? 'Joueuse inconnue';
}

function formatDate(iso: string, locale: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function PlayerProfilePage({
  profile,
}: InferGetStaticPropsType<typeof getStaticProps>) {
  const t = useT('playerPublicProfile');
  const router = useRouter();
  const { userId } = router.query;
  const id = typeof userId === 'string' ? userId : '';

  // 404 traité à part du hook générique (état métier distinct de l'erreur
  // réseau). Un refresh renvoyant 404 masque le profil pré-rempli.
  const [notFound, setNotFound] = useState(false);

  // Premier rendu = données pré-remplies par l'ISR (getStaticProps). Le fetch
  // client ne se déclenche qu'en fallback ISR (profil absent des props) ou au
  // retour de focus ; il ne double PAS la lecture des props ISR fraîches.
  const fetcher =
    useCallback(async (): Promise<PlayerProfileResponse | null> => {
      if (!id) return null;
      const res = await fetch(`/api/players/${encodeURIComponent(id)}/profile`);
      if (res.status === 404) {
        setNotFound(true);
        return null;
      }
      setNotFound(false);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as PlayerProfileResponse;
    }, [id]);

  const { data, error, refresh } = useIsrRefresh<PlayerProfileResponse>({
    initial: profile ?? null,
    fetcher,
    when: router.isReady && !!id,
  });

  const state: FetchState = notFound
    ? { status: 'notfound' }
    : data
      ? { status: 'ok', data }
      : error
        ? { status: 'error' }
        : { status: 'loading' };

  return (
    <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-black text-white">
      <main className="mx-auto max-w-4xl px-4 pb-16 pt-24 sm:px-6">
        <Link
          href="/leaderboard"
          className="mb-6 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
        >
          {t.backToLeaderboard}
        </Link>

        {state.status === 'loading' && <LoadingState />}
        {state.status === 'notfound' && <NotFoundState />}
        {state.status === 'error' && <ErrorState onRetry={refresh} />}
        {state.status === 'ok' && <Profile data={state.data} />}
      </main>
    </div>
  );
}

function Profile({ data }: { data: PlayerProfileResponse }) {
  const t = useT('playerPublicProfile');
  const { player, history, recentMatches, h2h, achievements } = data;
  const label = coreLabel(player);

  return (
    <>
      <ProfileHeader player={player} label={label} />

      <BadgesSection badges={achievements.badges} />

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-gradient">
          {t.ratingProgression}
        </h2>
        <RatingChart history={history} />
      </section>

      <PalmaresSection placements={achievements.palmares} />
      <SeasonsSection seasons={achievements.seasons} />

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        <RecentMatches matches={recentMatches} />
        <HeadToHead rows={h2h} />
      </div>
    </>
  );
}

// --- Badges -----------------------------------------------------------------
// Palette par rareté (tier). `null` = badge neutre (violet, cohérent avec
// l'accent du profil). On garde des fonds semi-transparents + bordure pour le
// contraste sur le dégradé sombre, comme les cards existantes.
const BADGE_TIER_STYLES: Record<ProfileBadgeTier | 'none', string> = {
  bronze: 'border-amber-700/50 bg-amber-700/15 text-amber-300',
  silver: 'border-zinc-400/40 bg-zinc-400/15 text-zinc-200',
  gold: 'border-yellow-500/40 bg-yellow-500/15 text-yellow-300',
  platinum: 'border-cyan-400/40 bg-cyan-400/15 text-cyan-200',
  none: 'border-purple-500/40 bg-purple-500/15 text-purple-200',
};

const getBadgeTierLabel = (
  t: PlayerProfileDict
): Record<ProfileBadgeTier, string> => ({
  bronze: t.tierBronze,
  silver: t.tierSilver,
  gold: t.tierGold,
  platinum: t.tierPlatinum,
});

function BadgesSection({ badges }: { badges: ProfileBadge[] }) {
  const t = useT('playerPublicProfile');
  const badgeTierLabel = getBadgeTierLabel(t);
  if (badges.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-gradient">
        {t.badges}
      </h2>
      <ul className="flex flex-wrap gap-2">
        {badges.map((badge) => {
          const styles = BADGE_TIER_STYLES[badge.tier ?? 'none'];
          const tierText = badge.tier ? ` (${badgeTierLabel[badge.tier]})` : '';
          return (
            <li key={badge.key}>
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles}`}
                title={badge.description}
                aria-label={`${badge.label}${tierText} : ${badge.description}`}
              >
                {badge.label}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// --- Palmarès ---------------------------------------------------------------
function PalmaresSection({ placements }: { placements: ProfilePlacement[] }) {
  const t = useT('playerPublicProfile');
  const locale = useLocale();
  if (placements.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-gradient">
        {t.palmares}
      </h2>
      <ul className="divide-y divide-neutral-800/60 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
        {placements.map((p) => (
          <li
            key={`${p.tournamentId}-${p.teamId}`}
            className="flex items-center gap-3 px-4 py-3 text-sm"
          >
            <RankMedal rank={p.rank} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-neutral-200">
                {p.tournamentName ? (
                  <Link
                    href={`/tournament/${p.tournamentSlug ?? p.tournamentId}`}
                    className="hover:text-[var(--color-violet-light)] hover:underline"
                  >
                    {p.tournamentName}
                  </Link>
                ) : (
                  <span className="text-neutral-400">
                    {t.tournamentFallback}
                  </span>
                )}
              </div>
              {p.teamName ? (
                <div className="truncate text-xs text-neutral-500">
                  {t.withTeam}{' '}
                  <Link
                    href={`/team/${p.teamId}`}
                    className="hover:text-[var(--color-violet-light)] hover:underline"
                  >
                    {p.teamName}
                  </Link>
                </div>
              ) : null}
            </div>
            {p.date ? (
              <span className="shrink-0 text-xs text-neutral-500">
                {formatDate(p.date, locale)}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

// Médaille pour le podium (1/2/3), sinon pastille « #rang ». L'emoji est
// masqué aux lecteurs d'écran (aria-hidden) ; le rang réel est fourni en
// texte alternatif via aria-label sur le conteneur.
function RankMedal({ rank }: { rank: number }) {
  const t = useT('playerPublicProfile');
  const podium: Record<number, { emoji: string; cls: string; word: string }> = {
    1: {
      emoji: '🥇',
      cls: 'bg-yellow-500/15 text-yellow-300',
      word: t.firstPlace,
    },
    2: {
      emoji: '🥈',
      cls: 'bg-zinc-400/15 text-zinc-200',
      word: t.secondPlace,
    },
    3: {
      emoji: '🥉',
      cls: 'bg-amber-700/20 text-amber-300',
      word: t.thirdPlace,
    },
  };
  const medal = podium[rank];

  if (medal) {
    return (
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base ${medal.cls}`}
        role="img"
        aria-label={medal.word}
      >
        <span aria-hidden>{medal.emoji}</span>
      </span>
    );
  }

  return (
    <span
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-xs font-bold text-neutral-300"
      aria-label={format(t.nthPlace, { rank })}
    >
      #{rank}
    </span>
  );
}

// --- Saisons (leagues) ------------------------------------------------------
function SeasonsSection({ seasons }: { seasons: ProfileSeason[] }) {
  const t = useT('playerPublicProfile');
  if (seasons.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-gradient">
        {t.seasons}
      </h2>
      <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
        <table className="w-full text-sm">
          <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-3 text-left">{t.thLeague}</th>
              <th className="px-4 py-3 text-right">{t.thRank}</th>
              <th className="px-4 py-3 text-right">{t.thPoints}</th>
            </tr>
          </thead>
          <tbody>
            {seasons.map((s) => (
              <tr
                key={`${s.leagueId}-${s.teamId}`}
                className="border-t border-neutral-800/60 transition-colors hover:bg-white/[0.03]"
              >
                <td className="px-4 py-3">
                  {s.leagueName ? (
                    s.leagueSlug ? (
                      <Link
                        href={`/leagues/${s.leagueSlug}`}
                        className="hover:text-[var(--color-violet-light)] hover:underline"
                      >
                        {s.leagueName}
                      </Link>
                    ) : (
                      <span className="text-neutral-200">{s.leagueName}</span>
                    )
                  ) : (
                    <span className="text-neutral-500">{t.leagueFallback}</span>
                  )}
                  {s.teamName ? (
                    <span className="block text-xs text-neutral-500">
                      {s.teamName}
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-right text-neutral-300">
                  {s.rank !== null ? `#${s.rank}` : '—'}
                </td>
                <td className="px-4 py-3 text-right text-neutral-300">
                  {s.points}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// --- Partage ----------------------------------------------------------------
// Bouton « Partager » : navigator.share (mobile) sinon copie du lien canonique
// dans le presse-papiers + toast « Lien copié ». Complété d'une rangée compacte
// d'intents X / Bluesky ouvrant une preview préremplie dans un nouvel onglet.
function buildProfileUrl(userId: string): string {
  if (typeof window !== 'undefined') return window.location.href;
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  return `${base}/player/${encodeURIComponent(userId)}`;
}

function ShareButtons({
  player,
  label,
}: {
  player: PlayerProfileCore;
  label: string;
}) {
  const t = useT('playerPublicProfile');
  const { addToast } = useToast();

  const shareTitle = format(t.shareTitle, { name: label });

  const copyLink = useCallback(async (url: string) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'absolute';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch {
      return false;
    }
  }, []);

  const handleShare = useCallback(async () => {
    const url = buildProfileUrl(player.userId);
    // navigator.share : feuille de partage native (mobile). On ignore
    // l'AbortError (l'utilisatrice a fermé la feuille) sans afficher d'erreur.
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: shareTitle, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        // Sinon on retombe sur la copie du lien ci-dessous.
      }
    }
    const ok = await copyLink(url);
    addToast(ok ? t.linkCopied : t.shareError, ok ? 'success' : 'error');
  }, [player.userId, shareTitle, copyLink, addToast, t.linkCopied, t.shareError]);

  const url = buildProfileUrl(player.userId);
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(shareTitle);
  const xUrl = `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`;
  const blueskyUrl = `https://bsky.app/intent/compose?text=${encodeURIComponent(
    `${shareTitle} ${url}`
  )}`;

  return (
    <div className="flex shrink-0 items-center gap-2">
      <button
        type="button"
        onClick={handleShare}
        className="inline-flex items-center gap-2 rounded-md border border-[var(--color-violet)]/40 bg-[var(--color-violet)]/15 px-3 py-1.5 text-sm font-semibold text-[var(--color-violet-light)] transition-colors hover:border-[var(--color-violet)] hover:bg-[var(--color-violet)]/25 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
        aria-label={t.shareAriaLabel}
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
        </svg>
        {t.share}
      </button>
      <a
        href={xUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.shareOnX}
        title={t.shareOnX}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M18.9 2H22l-7.5 8.6L23 22h-6.9l-5.4-7-6.2 7H1.4l8-9.2L1 2h7l4.9 6.5L18.9 2zm-2.4 18h1.9L7.6 3.9H5.6L16.5 20z" />
        </svg>
      </a>
      <a
        href={blueskyUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t.shareOnBluesky}
        title={t.shareOnBluesky}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-300 transition-colors hover:border-white/20 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 10.8C10.9 8.6 7.9 4.5 5.1 3 3.6 2.1 2 2.8 2 5.1c0 1.4.8 5.9 1.3 6.6.7 1.2 2 1.6 3.4 1.4-2 .3-3.7 1-.9 4 3 3.2 4.2-.9 4.2-2.8 0 1.9 1.1 6 4.2 2.8 2.8-3 1.1-3.7-.9-4 1.4.2 2.7-.2 3.4-1.4.5-.7 1.3-5.2 1.3-6.6 0-2.3-1.6-3-3.1-2.1C16.1 4.5 13.1 8.6 12 10.8z" />
        </svg>
      </a>
    </div>
  );
}

function ProfileHeader({
  player,
  label,
}: {
  player: PlayerProfileCore;
  label: string;
}) {
  const t = useT('playerPublicProfile');
  const total = player.wins + player.losses;
  const winRate = total > 0 ? Math.round((player.wins / total) * 100) : null;

  return (
    <div className="card-brand rounded-2xl bg-neutral-900/40 p-6">
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
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-bold sm:text-3xl">{label}</h1>
              {player.displayName && player.battleTag ? (
                <p className="text-sm text-neutral-500">{player.battleTag}</p>
              ) : null}
            </div>
            <ShareButtons player={player} label={label} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-neutral-400 sm:justify-start">
            <span>
              {t.rankLabel}{' '}
              <span className="font-semibold text-white">#{player.rank}</span>
            </span>
            <span aria-hidden>·</span>
            <span>
              {format(
                player.gamesPlayed > 1
                  ? t.matchesCount_other
                  : t.matchesCount_one,
                { count: player.gamesPlayed }
              )}
            </span>
            {winRate !== null && (
              <>
                <span aria-hidden>·</span>
                <span>{format(t.winRatePct, { rate: winRate })}</span>
              </>
            )}
          </div>
        </div>

        <div className="text-center">
          <div className="text-brand-gradient text-4xl font-bold">
            {Math.round(player.rating)}
          </div>
          <div
            className="text-xs text-neutral-500"
            title={t.ratingUncertaintyTitle}
          >
            {format(t.ratingDelta, {
              rd: Math.round(player.rd),
              peak: Math.round(player.peakRating),
            })}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3 border-t border-neutral-800 pt-5 text-center">
        <Stat value={player.wins} label={t.statWins} tone="text-emerald-400" />
        <Stat value={player.losses} label={t.statLosses} tone="text-rose-400" />
        <Stat
          value={Math.round(player.peakRating)}
          label={t.statPeak}
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
  const t = useT('playerPublicProfile');
  if (history.length < 2) {
    return (
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-8 text-center text-sm text-neutral-400">
        {t.chartNotEnough}
      </div>
    );
  }

  const W = 720;
  const H = 200;
  const PAD_X = 8;
  const PAD_Y = 16;

  // On construit la série à partir de ratingAfter (état après chaque match),
  // précédé du ratingBefore du 1er point pour montrer le point de départ.
  const values = [
    history[0].ratingBefore,
    ...history.map((h) => h.ratingAfter),
  ];
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
        <span>{format(t.chartMin, { value: Math.round(min) })}</span>
        <span
          className={
            delta > 0
              ? 'text-emerald-400'
              : delta < 0
                ? 'text-rose-400'
                : 'text-neutral-400'
          }
        >
          {format(t.chartPts, { delta: `${delta > 0 ? '+' : ''}${delta}` })}
        </span>
        <span>{format(t.chartMax, { value: Math.round(max) })}</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-40 w-full sm:h-48"
        preserveAspectRatio="none"
        role="img"
        aria-label={format(t.chartAriaLabel, {
          first: Math.round(first),
          last: Math.round(last),
          count: history.length,
        })}
      >
        <defs>
          <linearGradient id="ratingFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-violet)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--color-violet)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#ratingFill)" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-violet-light)"
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
            fill="var(--color-violet-light)"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}

function RecentMatches({ matches }: { matches: PlayerProfileRecentMatch[] }) {
  const t = useT('playerPublicProfile');
  const locale = useLocale();
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-gradient">
        {t.recentMatches}
      </h2>
      {matches.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
          {t.noRecentMatches}
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
                  m.opponentTeamId ? (
                    // Maillage interne : lien vers l'équipe adverse
                    // (la route /team/[slug] résout aussi par id).
                    <span className="truncate text-neutral-200">
                      {t.vs}{' '}
                      <Link
                        href={`/team/${m.opponentTeamId}`}
                        className="hover:text-[var(--color-violet-light)] hover:underline"
                      >
                        {m.opponentTeamName}
                      </Link>
                    </span>
                  ) : (
                    <span className="truncate text-neutral-200">
                      {t.vs} {m.opponentTeamName}
                    </span>
                  )
                ) : (
                  <span className="text-neutral-500">{t.unknownOpponent}</span>
                )}
              </div>
              <span className="shrink-0 text-xs text-neutral-500">
                {formatDate(m.occurredAt, locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ResultBadge({ result }: { result: 'win' | 'loss' | 'draw' }) {
  const t = useT('playerPublicProfile');
  const map = {
    win: { label: t.resultWin, cls: 'bg-emerald-500/15 text-emerald-400' },
    loss: { label: t.resultLoss, cls: 'bg-rose-500/15 text-rose-400' },
    draw: { label: t.resultDraw, cls: 'bg-neutral-500/15 text-neutral-300' },
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
  const t = useT('playerPublicProfile');
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-brand-gradient">
        {t.headToHead}
      </h2>
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 text-sm text-neutral-400">
          {t.noHeadToHead}
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40">
          <table className="w-full text-sm">
            <thead className="bg-neutral-900/80 text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-3 text-left">{t.thOpponent}</th>
                <th className="px-4 py-3 text-right">{t.thWinLoss}</th>
                <th className="px-4 py-3 text-right">{t.thMatches}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const oppLabel =
                  r.opponentDisplayName ??
                  r.opponentBattleTag ??
                  t.unknownPlayer;
                return (
                  <tr
                    key={r.opponentUserId}
                    className="border-t border-neutral-800/60 transition-colors hover:bg-white/[0.03]"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/player/${r.opponentUserId}`}
                        className="hover:text-[var(--color-violet-light)]"
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
  const t = useT('playerPublicProfile');
  return (
    <section className="py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-800 text-2xl">
        🔍
      </div>
      <h1 className="mb-2 text-xl font-semibold">{t.notFoundTitle}</h1>
      <p className="mx-auto mb-6 max-w-md text-sm text-neutral-400">
        {t.notFoundBody}
      </p>
      <Link
        href="/leaderboard"
        className="rounded-md bg-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
      >
        {t.viewLeaderboard}
      </Link>
    </section>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  const t = useT('playerPublicProfile');
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
      <h1 className="mb-2 text-xl font-semibold">{t.errorTitle}</h1>
      <p className="mb-6 text-neutral-400">{t.errorBody}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-[var(--color-violet)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-violet)]"
      >
        {t.retry}
      </button>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * SEO dynamique par-entité
 *
 * Le mécanisme : `getStaticProps` renvoie `props.seo` (SeoProps). `_app.tsx`
 * privilégie `pageProps.seo` sur la propriété statique `Component.seo` — c'est
 * la version DYNAMIQUE du mécanisme historique (cf. `_app.tsx`). On expose
 * quand même une prop statique de repli pour les pré-rendus dégradés.
 * -------------------------------------------------------------------------*/

function buildPlayerSeo(profile: PlayerProfileResponse): SeoProps {
  const { player } = profile;
  const label = coreLabel(player);
  const total = player.wins + player.losses;
  const winRate = total > 0 ? Math.round((player.wins / total) * 100) : null;
  const rating = Math.round(player.rating);

  const plural = player.gamesPlayed > 1;

  const descriptionFr =
    `Rang #${player.rank} · ${rating} de rating · ` +
    `${player.wins}V-${player.losses}D` +
    (winRate !== null ? ` (${winRate}% de victoires)` : '') +
    ` sur ${player.gamesPlayed} match${plural ? 's' : ''}. ` +
    `Progression, derniers matchs et face-à-face de ${label}.`;

  const descriptionEn =
    `Rank #${player.rank} · ${rating} rating · ` +
    `${player.wins}W-${player.losses}L` +
    (winRate !== null ? ` (${winRate}% win rate)` : '') +
    ` across ${player.gamesPlayed} match${plural ? 'es' : ''}. ` +
    `Progression, recent matches and head-to-head for ${label}.`;

  // JSON-LD ProfilePage → mainEntity Person.
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `Profil de ${label}`,
    mainEntity: {
      '@type': 'Person',
      name: label,
      ...(player.battleTag ? { alternateName: player.battleTag } : {}),
      ...(player.avatarUrl ? { image: player.avatarUrl } : {}),
    },
  };

  // Carte sociale dynamique (1200×630) générée par /api/og/player/[userId].
  // Absolue (DefaultSeo n'ajoute pas d'origine aux URLs déjà absolues). En
  // l'absence de NEXT_PUBLIC_SITE_URL (dev), on retombe sur le chemin relatif,
  // que DefaultSeo laisse tel quel.
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') || '';
  const ogImage = `${baseUrl}/api/og/player/${encodeURIComponent(
    player.userId
  )}`;

  return {
    title: {
      fr: `Profil de ${label} — ${rating}`,
      en: `${label}'s profile — ${rating}`,
    },
    description: { fr: descriptionFr, en: descriptionEn },
    image: ogImage,
    jsonLd,
  };
}

// Repli statique (pré-rendu dégradé sans données — ex. fallback avant que
// `_app.tsx` ait `pageProps.seo`). En pratique l'ISR fournit toujours le SEO
// dynamique via `props.seo`.
const playerProfileSeoFallback: SeoProps = {
  title: { fr: 'Profil joueuse', en: 'Player profile' },
  description: {
    fr: 'Profil public : rating, progression, derniers matchs et face-à-face de la joueuse.',
    en: 'Public profile: rating, progression, recent matches and head-to-head for the player.',
  },
};

PlayerProfilePage.seo = playerProfileSeoFallback;

export const getStaticPaths: GetStaticPaths = async () => {
  // On ne pré-génère aucun chemin au build : les profils sont générés à la
  // demande (fallback blocking) puis mis en cache / revalidés.
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<{
  profile: PlayerProfileResponse;
  seo: SeoProps;
}> = async (ctx) => {
  const rawUserId = ctx.params?.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;
  if (!userId || typeof userId !== 'string') {
    return { notFound: true, revalidate: 300 };
  }

  let profile: PlayerProfileResponse | null;
  try {
    profile = await readPlayerProfile(userId, DEFAULT_TENANT_ID);
  } catch {
    // Erreur DB transitoire : on ne fige pas un 404. On laisse Next réessayer
    // rapidement en renvoyant notFound avec un revalidate court.
    return { notFound: true, revalidate: 30 };
  }

  if (!profile) {
    return { notFound: true, revalidate: 300 };
  }

  return {
    props: { profile, seo: buildPlayerSeo(profile) },
    revalidate: 300,
  };
};
