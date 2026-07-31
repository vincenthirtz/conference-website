// components/Caster/BriefingPanel.tsx
//
// Briefing match du Cockpit caster : compos des 2 equipes, H2H, news recentes.
// Fetch /api/caster/briefing/[matchId] uniquement si le segment match est
// proche (T-30 min ou deja live).

import { useEffect, useState } from 'react';
import { logger } from '@/utils/logger';
import { maskBattleTag } from '@/utils/battleTag';
import { useT, format } from '@/lib/i18n/useT';

type TeamMember = {
  id: string;
  battle_tag: string | null;
  role: string;
  is_substitute: boolean;
  is_staff?: boolean;
  display_name?: string | null;
  is_captain: boolean;
  is_manager: boolean;
};

type TeamBlock = {
  id: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  country: string | null;
  members: TeamMember[];
};

type Briefing = {
  match: {
    id: string;
    scheduledAt: string | null;
    status: string;
    matchFormat: string | null;
    roundName: string | null;
    tournament: { id: string; name: string; slug: string } | null;
  };
  teams: TeamBlock[];
  headToHead: {
    totalMeetings: number;
    aWins: number;
    bWins: number;
    draws: number;
    lastPlayedAt: string | null;
    lastMatchId: string | null;
  };
  recentNews: Array<{
    id: string;
    title: string;
    slug: string;
    tag: string | null;
    publishedAt: string | null;
    excerpt: string | null;
  }>;
};

type Props = {
  matchId: string;
  accessToken: string | null;
};

export default function BriefingPanel({ matchId, accessToken }: Props) {
  const t = useT('briefingPanel');
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken) {
      setLoading(false);
      return;
    }
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/caster/briefing/${matchId}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!res.ok) {
          if (res.status === 404) {
            setError(t.matchNotFound);
            return;
          }
          const body = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            body?.error || format(t.errorWithStatus, { status: res.status })
          );
        }
        const json = (await res.json()) as Briefing;
        if (!cancelled) {
          setBriefing(json);
          setError(null);
        }
      } catch (err) {
        logger.error('[BriefingPanel] error', err);
        if (!cancelled) {
          setError((err as Error)?.message || t.loadError);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, matchId, t]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="text-sm font-semibold text-white mb-2">
          {t.briefingLabel}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-300">
          <div className="w-4 h-4 border-2 border-neutral-600 border-t-purple-400 rounded-full animate-spin" />
          {t.loadingBriefing}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-900/15 p-4">
        <div className="text-sm font-semibold text-white mb-1">
          {t.briefingLabel}
        </div>
        <p className="text-xs text-red-100/80">{error}</p>
      </div>
    );
  }

  if (!briefing) return null;

  const [teamA, teamB] = briefing.teams;
  const h2h = briefing.headToHead;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-white">
          {t.briefingTitle}
        </div>
        {briefing.match.matchFormat && (
          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/10 text-gray-200">
            {briefing.match.matchFormat}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
        {[teamA, teamB].map((team, idx) =>
          team ? (
            <div
              key={team.id}
              className="rounded-xl border border-white/10 bg-black/30 p-3"
            >
              <div className="flex items-center gap-2 mb-2">
                {team.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={team.logoUrl}
                    alt=""
                    className="w-7 h-7 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-7 h-7 rounded bg-white/10" aria-hidden />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-white truncate">
                    {team.name}
                  </div>
                  {team.country && (
                    <div className="text-[11px] text-gray-300">
                      {team.country}
                    </div>
                  )}
                </div>
              </div>
              <ul className="space-y-1">
                {team.members.length === 0 ? (
                  <li className="text-[11px] text-gray-300 italic">
                    {t.noRoster}
                  </li>
                ) : (
                  team.members.slice(0, 8).map((m) => (
                    <li
                      key={m.id}
                      className="flex items-center gap-2 text-[11px] text-gray-200"
                    >
                      <span className="font-mono truncate flex-1">
                        {maskBattleTag(m.battle_tag) ||
                          m.display_name ||
                          '—'}
                      </span>
                      <span className="text-[11px] text-gray-300">
                        {m.role}
                      </span>
                      {m.is_captain && (
                        <span className="text-[10px] uppercase font-bold text-amber-300 px-1 py-0.5 bg-amber-500/15 rounded">
                          C
                        </span>
                      )}
                      {m.is_substitute && (
                        <span className="text-[10px] uppercase font-bold text-gray-300 px-1 py-0.5 bg-white/10 rounded">
                          S
                        </span>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          ) : (
            <div
              key={`empty-${idx}`}
              className="rounded-xl border border-white/5 bg-black/20 p-3 text-[11px] text-gray-300 italic"
            >
              {t.teamUnavailable}
            </div>
          )
        )}
      </div>

      <div className="rounded-xl border border-white/10 bg-black/30 p-3 mb-4">
        <div className="text-[10px] uppercase tracking-wider text-gray-300 mb-1">
          {t.h2hLabel}
        </div>
        {h2h.totalMeetings === 0 ? (
          <div className="text-xs text-gray-300">{t.noPreviousMeeting}</div>
        ) : (
          <div className="flex items-center justify-between text-sm">
            <span className="font-mono text-white">{h2h.aWins}</span>
            <span className="text-[11px] text-gray-300">
              {format(
                h2h.totalMeetings > 1 ? t.meetings_other : t.meetings_one,
                { count: h2h.totalMeetings }
              )}
              {h2h.draws > 0 ? format(t.drawsSuffix, { count: h2h.draws }) : ''}
            </span>
            <span className="font-mono text-white">{h2h.bWins}</span>
          </div>
        )}
      </div>

      {briefing.recentNews.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-gray-300 mb-1.5">
            {t.recentNews}
          </div>
          <ul className="space-y-1.5">
            {briefing.recentNews.slice(0, 3).map((n) => (
              <li key={n.id}>
                <a
                  href={`/news/${n.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-xs text-gray-100 hover:text-purple-300 transition"
                >
                  <span className="font-semibold leading-tight">{n.title}</span>
                  {n.excerpt && (
                    <span className="block text-[11px] text-gray-300 mt-0.5 leading-snug line-clamp-2">
                      {n.excerpt}
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
