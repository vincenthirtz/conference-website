// pages/player/join-team.tsx
// Page pour demander a rejoindre une equipe existante (sans etre capitaine)

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useDebounce } from '@/hooks/useDebounce';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import { MAX_TEAM_PLAYERS } from '@/utils/constants';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../../utils/logger';

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  member_count?: number;
  is_joinable?: boolean;
};

export default function JoinTeamPage() {
  const t = useT('joinTeam');
  const router = useRouter();
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const { data: managedTeam, loading: teamLoading } = useManagedTeam();
  const [loading, setLoading] = useState(true);

  // Le joueur fait-il déjà partie d'une équipe ? (via le cache partagé
  // useManagedTeam, comme requests.tsx). Si oui, on masque le formulaire de
  // join et on l'oriente vers Demandes › Transfert.
  const alreadyInTeam = !!managedTeam?.team;
  const currentTeamName = managedTeam?.team?.name ?? '';

  // Equipes
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  // Distingue « pas encore chargé » de « chargé mais vide » pour l'état vide.
  const [teamsLoaded, setTeamsLoaded] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

  // Filtres
  const [filterCountry, setFilterCountry] = useState('');
  const [availableCountries, setAvailableCountries] = useState<string[]>([]);

  // Role souhaite
  const [desiredRole, setDesiredRole] = useState<'player' | 'substitute'>(
    'player'
  );

  // Message et etats
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successTeamName, setSuccessTeamName] = useState('');

  const debouncedSearch = useDebounce(teamSearch, 300);

  const loadTeams = useCallback(async (search?: string, country?: string) => {
    setTeamsLoading(true);
    try {
      const params = new URLSearchParams();
      if (search?.trim()) {
        params.set('search', search.trim());
      }
      params.set('limit', '50');
      params.set('joinable', '1');
      if (country) params.set('country', country);
      const res = await fetch(`/api/teams?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        let result: Team[] = data.teams || [];
        // Garde-fou défensif : l'API exclut déjà les équipes pleines en
        // joinable=1, mais on ne laisse jamais passer une équipe pleine côté
        // front (member_count >= MAX_TEAM_PLAYERS).
        result = result.filter(
          (tm) =>
            typeof tm.member_count !== 'number' ||
            tm.member_count < MAX_TEAM_PLAYERS
        );
        // Collecter les pays disponibles
        const countries = new Set<string>();
        for (const tm of data.teams || []) {
          if (tm.country) countries.add(tm.country);
        }
        setAvailableCountries(Array.from(countries).sort());
        setTeams(result);
      }
    } catch (err) {
      logger.error('[join-team] load teams error:', err);
    } finally {
      setTeamsLoading(false);
      setTeamsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/demandes/join', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          const pending = data.demandes?.find(
            (d: any) => d.status === 'pending'
          );
          if (pending && !cancelled) {
            router.replace('/player');
            return;
          }
        }
      } catch (err) {
        logger.error('[join-team] auth error:', err);
        if (!cancelled) setError(t.connectionError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, router]);

  // Recharge la liste quand la recherche (debouncee) ou le pays change.
  useEffect(() => {
    if (!ready) return;
    loadTeams(debouncedSearch, filterCountry);
  }, [debouncedSearch, filterCountry, ready, loadTeams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double-submit : le disabled ne protège pas d'un double-Enter
    // envoyé avant le re-render.
    if (submitting) return;
    setError(null);

    if (!selectedTeamId) {
      setError(t.selectTeamError);
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/demandes/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          teamId: selectedTeamId,
          message: message.trim() || undefined,
          desiredRole,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t.createRequestError);
      }

      const team = teams.find((tm) => tm.id === selectedTeamId);
      setSuccessTeamName(team?.name || t.selectedTeamFallback);
      setSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || t.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading || teamLoading) {
    return <PlayerPageSkeleton rows={3} />;
  }

  if (!user) {
    return null;
  }

  if (success) {
    return (
      <>
        <Head>
          <title>{t.successTabTitle}</title>
        </Head>

        <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
          <div className="max-w-md text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h1 className="text-2xl font-bold mb-4">{t.successTitle}</h1>
            <p className="text-gray-400 mb-6">
              {format(t.successBody, { name: successTeamName })}
            </p>
            <Link
              href="/player"
              className="inline-block px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold transition"
            >
              {t.backToSpace}
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>{t.pageTabTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-2xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            ← {t.backToSpace}
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h1 className="text-2xl font-bold mb-2">{t.pageTitle}</h1>
            <p className="text-gray-400 text-sm mb-6">{t.pageIntro}</p>

            {alreadyInTeam ? (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-4 text-sm text-amber-200">
                <p className="font-semibold mb-1">{t.alreadyInTeamTitle}</p>
                <p>
                  {format(t.alreadyInTeamBody, {
                    teamName: currentTeamName || t.selectedTeamFallback,
                  })}
                </p>
                <Link
                  href="/player/requests"
                  className="mt-3 inline-block text-purple-300 hover:text-purple-200 underline"
                >
                  {t.alreadyInTeamCta}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
              {/* Recherche d'equipe */}
              <div>
                <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                  {t.searchLabel}
                </label>
                <input
                  type="text"
                  value={teamSearch}
                  onChange={(e) => setTeamSearch(e.target.value)}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 mb-3"
                  placeholder={t.searchPlaceholder}
                />

                {availableCountries.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 mb-3">
                    <select
                      value={filterCountry}
                      onChange={(e) => setFilterCountry(e.target.value)}
                      className="rounded-lg bg-black/60 border border-white/10 px-3 py-1.5 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                    >
                      <option value="">{t.allCountries}</option>
                      {availableCountries.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/40 p-2">
                  {teamsLoading && (
                    <div className="text-sm text-gray-500 text-center py-4">
                      {t.loading}
                    </div>
                  )}

                  {!teamsLoading && teamsLoaded && teams.length === 0 && (
                    <div className="text-center py-6 px-4">
                      <p className="text-sm text-gray-400">{t.emptyTitle}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t.emptySubtitle}
                      </p>
                      <Link
                        href="/player/request-captain"
                        className="mt-3 inline-block text-sm text-purple-400 hover:text-purple-300"
                      >
                        {t.createMyTeam}
                      </Link>
                    </div>
                  )}

                  {!teamsLoading &&
                    teams.map((team) => (
                      <button
                        key={team.id}
                        type="button"
                        onClick={() => setSelectedTeamId(team.id)}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                          selectedTeamId === team.id
                            ? 'bg-purple-600/30 border border-purple-400/50'
                            : 'bg-white/5 border border-transparent hover:bg-white/10'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {team.logo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={team.logo_url}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span className="text-xs text-gray-500">
                              {(team.short_name || team.name)
                                .slice(0, 2)
                                .toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-white truncate">
                            {team.name}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-400">
                            {team.short_name && <span>{team.short_name}</span>}
                            {team.country && (
                              <>
                                {team.short_name && <span>·</span>}
                                <span>{team.country}</span>
                              </>
                            )}
                            {typeof team.member_count === 'number' && (
                              <>
                                {(team.short_name || team.country) && (
                                  <span>·</span>
                                )}
                                <span>
                                  {team.member_count}/{MAX_TEAM_PLAYERS}{' '}
                                  {t.membersSuffix}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {selectedTeamId === team.id && (
                          <svg
                            className="w-5 h-5 text-purple-400 flex-shrink-0"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </button>
                    ))}
                </div>
              </div>

              {/* Role souhaite */}
              <div>
                <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
                  {t.desiredRoleLabel}
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDesiredRole('player')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border ${
                      desiredRole === 'player'
                        ? 'bg-purple-600/30 border-purple-400/50 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {t.rolePlayer}
                  </button>
                  <button
                    type="button"
                    onClick={() => setDesiredRole('substitute')}
                    className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border ${
                      desiredRole === 'substitute'
                        ? 'bg-purple-600/30 border-purple-400/50 text-white'
                        : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                    }`}
                  >
                    {t.roleSub}
                  </button>
                </div>
              </div>

              {/* Message optionnel */}
              <div>
                <label
                  htmlFor="message"
                  className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                >
                  {t.messageLabel}
                </label>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 transition resize-none"
                  placeholder={t.messagePlaceholder}
                  maxLength={500}
                />
              </div>

              {error && (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !selectedTeamId}
                className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
                  submitting || !selectedTeamId
                    ? 'bg-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400'
                }`}
              >
                {submitting ? t.submitting : t.submit}
              </button>
            </form>
            )}
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>
              {t.ctaQuestion}{' '}
              <Link
                href="/player/request-captain"
                className="text-purple-400 hover:text-purple-300"
              >
                {t.becomeCaptain}
              </Link>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}

const joinTeamSeo: SeoProps = {
  title: {
    fr: 'Rejoindre une équipe',
    en: 'Join a team',
  },
  description: {
    fr: "Demande à rejoindre une équipe existante de l'OW Women's Cup.",
    en: "Request to join an existing OW Women's Cup team.",
  },
  noindex: true,
};

JoinTeamPage.seo = joinTeamSeo;
