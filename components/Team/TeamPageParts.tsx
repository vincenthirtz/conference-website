// components/Team/TeamPageParts.tsx
//
// Les briques d'affichage de la fiche publique d'équipe : carte de membre,
// tuile de sponsor, lien social, calque de bannière, vignette de statistique,
// carte de match, pastille de statut.
//
// POURQUOI ELLES SONT ICI. La page faisait 2 054 lignes. Le chargement en est
// sorti (`utils/teams/buildTeamPage.ts`), et voici la seconde moitié du
// découpage : ces sept composants ne lisaient RIEN de la portée de la page —
// ils recevaient déjà tout par props. Les déplacer n'a donc rien changé au
// rendu, et c'est exactement pour cela qu'ils étaient les bons candidats.
//
// Tous sont PRÉSENTATIONNELS : aucune requête, aucune décision, aucun état
// partagé. Ce qu'ils affichent leur est donné.

import Link from 'next/link';
import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import SpecialtyBadge from '@/components/Team/SpecialtyBadge';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { formatSiteDate } from '@/utils/timezone';
import { safeHref, socialHref } from '@/utils/social/profileHandles';
import { XIcon } from '@/components/Icons';
import nsTeamDetail from '@/lib/i18n/locales/fr/teamDetail';
import type {
  BannerOverlay,
  Sponsor,
} from '@/utils/markdown/teamPublicMarkdown';
import type { TeamMember, RecentMatch } from '@/utils/teams/buildTeamPage';

/** Interne au module : la page ne s'en sert pas. */
function memberInitials(member: TeamMember): string {
  const source = member.display_name || member.battle_tag || 'M';
  const parts = source
    .trim()
    .split(/[\s#-]+/)
    .filter(Boolean);
  if (parts.length === 0) return 'M';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function MemberCard({
  member,
  accent,
  substitute,
}: {
  member: TeamMember;
  accent: string | null;
  substitute?: boolean;
}) {
  const t = useT(nsTeamDetail);
  const name = member.display_name || member.battle_tag || t.memberFallback;
  const avatar =
    member.avatar_url && safeHref(member.avatar_url) ? member.avatar_url : null;
  const xHref = socialHref('x', member.twitter ?? null);
  const twitchHref = socialHref('twitch', member.twitch ?? null);

  const containerClasses = substitute
    ? 'bg-white/[0.02] border-dashed border-white/10'
    : member.is_captain
      ? 'bg-amber-500/10 border-amber-500/30'
      : 'bg-white/5 border-white/10';

  return (
    <div
      className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${containerClasses}`}
    >
      <div className="flex-shrink-0">
        {avatar ? (
          // biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint)
          <img
            src={avatar}
            alt=""
            width={48}
            height={48}
            loading="lazy"
            className="w-12 h-12 rounded-lg object-cover border border-white/10"
            style={accent ? { borderColor: `${accent}66` } : undefined}
          />
        ) : (
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center text-sm font-semibold ${
              member.is_captain
                ? 'bg-amber-500/20 border border-amber-500/30 text-amber-200'
                : 'bg-gradient-to-br from-neutral-700 to-neutral-800 text-neutral-200'
            }`}
            style={
              !member.is_captain && accent
                ? {
                    borderColor: `${accent}66`,
                    color: accent,
                  }
                : undefined
            }
          >
            {memberInitials(member)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {member.user_id ? (
            // Maillage interne : lien vers le profil public de la joueuse.
            <Link
              href={`/player/${encodeURIComponent(member.user_id)}`}
              className={`text-sm font-semibold truncate hover:underline ${substitute ? 'text-gray-300 hover:text-white' : 'text-white hover:text-[var(--color-violet-light)]'}`}
            >
              {name}
            </Link>
          ) : (
            <p
              className={`text-sm font-semibold truncate ${substitute ? 'text-gray-300' : 'text-white'}`}
            >
              {name}
            </p>
          )}
          {member.is_captain && (
            <svg
              className="w-4 h-4 text-amber-400 flex-shrink-0"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-label={t.captainAria}
            >
              <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .6-.4 1-1 1H6c-.6 0-1-.4-1-1v-1h14v1z" />
            </svg>
          )}
          <SpecialtyBadge specialty={member.specialty} />
          {substitute && (
            <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-white/10 border border-white/10 text-gray-300">
              {t.substituteBadge}
            </span>
          )}
          {/* Niveau déclaré. Le composant ne rend rien quand il n'y en a pas :
              « non déclaré » sur chaque fiche ferait du bruit. */}
          <SkillRatingBadge skillRating={member.skill_rating} />
        </div>
        {(member.pronouns || member.battle_tag) && (
          <p className="text-[11px] text-gray-400 mt-0.5 truncate">
            {member.pronouns}
            {member.pronouns && member.battle_tag ? ' • ' : ''}
            {member.battle_tag && member.battle_tag !== name
              ? member.battle_tag
              : ''}
          </p>
        )}
        {member.tagline && (
          <p className="text-xs text-gray-300 italic mt-1 line-clamp-2">
            {member.tagline}
          </p>
        )}
        {(xHref || twitchHref) && (
          <div className="flex items-center gap-2 mt-1.5">
            {xHref && (
              <a
                href={xHref}
                target="_blank"
                rel="noreferrer"
                aria-label="X"
                className="text-gray-400 hover:text-white transition-colors"
              >
                <XIcon className="w-3.5 h-3.5" />
              </a>
            )}
            {twitchHref && (
              <a
                href={twitchHref}
                target="_blank"
                rel="noreferrer"
                aria-label="Twitch"
                className="text-gray-400 hover:text-purple-300 transition-colors"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M2.149 0L.537 4.119v16.836h5.731V24h3.224l3.045-3.045h4.657L23.463 14.9V0H2.149zm1.612 1.612h17.985v12.298l-3.582 3.582h-5.731l-3.045 3.045v-3.045H3.761V1.612zm6.985 11.582h1.612V6.642h-1.612v6.552zm4.478 0h1.612V6.642h-1.612v6.552z" />
                </svg>
              </a>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function SponsorTile({ sponsor }: { sponsor: Sponsor }) {
  const safe = sponsor.url ? safeHref(sponsor.url) : undefined;
  const inner = (
    <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2 hover:border-white/30 transition-colors">
      {sponsor.logo_url && safeHref(sponsor.logo_url) ? (
        // biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint)
        <img
          src={sponsor.logo_url}
          alt={sponsor.name}
          className="w-8 h-8 rounded-md object-contain bg-white/10"
          loading="lazy"
        />
      ) : (
        <div className="w-8 h-8 rounded-md bg-white/10 flex items-center justify-center text-xs font-semibold text-white">
          {sponsor.name.slice(0, 2).toUpperCase()}
        </div>
      )}
      <span className="text-sm text-white">{sponsor.name}</span>
    </div>
  );
  if (safe) {
    return (
      <a href={safe} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  }
  return inner;
}

export function SocialLink({
  href,
  label,
  icon,
  hover,
}: {
  href: string | undefined;
  label: string;
  icon: React.ReactNode;
  hover: string;
}) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 transition-colors text-xs ${hover}`}
    >
      {icon}
      {label}
    </a>
  );
}

export function BannerOverlayLayer({
  overlay,
  accent,
  secondary,
}: {
  overlay: BannerOverlay;
  accent: string | null;
  secondary: string | null;
}) {
  if (overlay === 'none') return null;
  if (overlay === 'dark') {
    return <div className="absolute inset-0 bg-black/50" />;
  }
  if (overlay === 'grid') {
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </>
    );
  }
  if (overlay === 'dots') {
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'radial-gradient(rgba(255,255,255,0.25) 1.2px, transparent 1.2px)',
            backgroundSize: '14px 14px',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
      </>
    );
  }
  // 'gradient' (default): use accent/secondary tint when available, else black
  if (accent && secondary) {
    return (
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `linear-gradient(to top, ${accent}cc, ${secondary}33, transparent)`,
        }}
      />
    );
  }
  return (
    <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent" />
  );
}

export function StatCard({
  label,
  value,
  hint,
  color,
}: {
  label: string;
  value: string | number;
  hint?: string;
  color?: 'emerald' | 'red';
}) {
  const colorClasses = {
    emerald: 'from-emerald-500/20 to-emerald-500/5 border-emerald-500/30',
    red: 'from-red-500/20 to-red-500/5 border-red-500/30',
  };

  return (
    <div
      className={`rounded-2xl bg-gradient-to-br ${color ? colorClasses[color] : 'from-white/8 via-white/5 to-white/0'} border ${color ? '' : 'border-white/10'} px-3 py-3`}
    >
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">
        {label}
      </p>
      <p className="text-xl font-semibold text-white">
        {typeof value === 'number' ? value.toString() : value}
      </p>
      {hint && <p className="text-[10px] text-gray-400 mt-[2px]">{hint}</p>}
    </div>
  );
}

export function MatchCard({
  match,
  teamId,
}: {
  match: RecentMatch;
  teamId: string;
}) {
  const t = useT(nsTeamDetail);
  const locale = useLocale();
  // Consider match finished if status is 'finished' or 'done'
  const isFinished =
    match.status === 'finished' ||
    match.status === 'done' ||
    match.status?.toLowerCase().includes('finish');

  const ourScore = match.isTeam1 ? match.team1_score : match.team2_score;
  const theirScore = match.isTeam1 ? match.team2_score : match.team1_score;
  const hasScores = ourScore !== null && theirScore !== null;

  // Determine result: first check winner_team_id, then fallback to scores
  let result: 'win' | 'loss' | 'draw' | null = null;

  // Method 1: Use winner_team_id if available
  if (match.winner_team_id) {
    if (match.winner_team_id === teamId) {
      result = 'win';
    } else {
      result = 'loss';
    }
  }
  // Method 2: Fallback to score comparison if match is finished and has scores
  else if ((isFinished || hasScores) && hasScores) {
    if (ourScore > theirScore) {
      result = 'win';
    } else if (ourScore < theirScore) {
      result = 'loss';
    } else {
      result = 'draw';
    }
  }

  const resultColors = {
    win: 'bg-emerald-500/30 border-emerald-500/50 text-emerald-300',
    loss: 'bg-red-500/30 border-red-500/50 text-red-300',
    draw: 'bg-yellow-500/30 border-yellow-500/50 text-yellow-300',
  };

  const dateStr = match.scheduled_at
    ? formatSiteDate(match.scheduled_at, locale, {
        day: '2-digit',
        month: '2-digit',
      })
    : null;

  // Card border color based on result
  const cardBorderColor = result
    ? result === 'win'
      ? 'border-emerald-500/40 hover:border-emerald-500/60'
      : result === 'loss'
        ? 'border-red-500/40 hover:border-red-500/60'
        : 'border-yellow-500/40 hover:border-yellow-500/60'
    : 'border-white/10 hover:border-white/30';

  return (
    <Link href={`/match/${match.id}`}>
      <div
        className={`flex items-center gap-3 bg-white/5 border ${cardBorderColor} rounded-xl px-4 py-3 transition-colors cursor-pointer group`}
      >
        {/* Result indicator */}
        {result && (
          <div
            className={`w-10 h-10 rounded-lg border ${resultColors[result]} flex items-center justify-center text-sm font-bold`}
          >
            {result === 'win'
              ? t.resultWin
              : result === 'loss'
                ? t.resultLoss
                : t.resultDraw}
          </div>
        )}
        {!result && (
          <div className="w-10 h-10 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-xs text-gray-400">
            —
          </div>
        )}

        {/* Match info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">
              {t.matchVs}{' '}
              {match.opponent?.short_name || match.opponent?.name || 'TBD'}
            </p>
            {ourScore !== null && theirScore !== null && (
              <span
                className={`text-sm font-bold font-mono ${
                  result === 'win'
                    ? 'text-emerald-400'
                    : result === 'loss'
                      ? 'text-red-400'
                      : 'text-gray-300'
                }`}
              >
                {ourScore} - {theirScore}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-500">
            {dateStr && <span>{dateStr}</span>}
            {match.round_name && (
              <>
                <span>•</span>
                <span>{match.round_name}</span>
              </>
            )}
            {match.tournament && (
              <>
                <span>•</span>
                <span className="truncate">{match.tournament.name}</span>
              </>
            )}
          </div>
        </div>

        <svg
          className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
      </div>
    </Link>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const t = useT(nsTeamDetail);
  const statusConfig: Record<string, { label: string; color: string }> = {
    running: { label: t.statusRunning, color: 'text-emerald-300' },
    ongoing: { label: t.statusRunning, color: 'text-emerald-300' },
    published: { label: t.statusUpcoming, color: 'text-yellow-300' },
    upcoming: { label: t.statusUpcoming, color: 'text-yellow-300' },
    finished: { label: t.statusFinished, color: 'text-gray-400' },
    completed: { label: t.statusFinished, color: 'text-gray-400' },
    draft: { label: t.statusDraft, color: 'text-gray-500' },
  };

  const config = statusConfig[status] || {
    label: status,
    color: 'text-gray-400',
  };

  return <span className={config.color}>{config.label}</span>;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
