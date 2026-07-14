// pages/player/join-team.tsx
// Page pour demander a rejoindre une equipe existante (sans etre capitaine)

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import TeamPicker from '@/components/player/TeamPicker';
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
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
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
  // Distingue un échec réseau (bannière + retry) d'une liste réellement vide.
  const [teamsError, setTeamsError] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

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

  const loadTeams = useCallback(
    async (search?: string) => {
      setTeamsLoading(true);
      setTeamsError(null);
      try {
        const params = new URLSearchParams();
        if (search?.trim()) {
          params.set('search', search.trim());
        }
        params.set('limit', '50');
        params.set('joinable', '1');
        const res = await fetch(`/api/teams?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
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
        setTeams(result);
      } catch (err) {
        // Un échec ne doit pas se déguiser en « aucune équipe » : on remonte
        // une bannière d'erreur distincte (avec retry) plutôt qu'un état vide.
        logger.error('[join-team] load teams error:', err);
        setTeams([]);
        setTeamsError(t.teamsLoadError);
      } finally {
        setTeamsLoading(false);
        setTeamsLoaded(true);
      }
    },
    [t]
  );

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    // Garde le skeleton affiché pendant une éventuelle redirection pour éviter
    // que le formulaire ne clignote avant le changement de route.
    let redirecting = false;
    setLoading(true);
    (async () => {
      try {
        const data = await adminFetchJson<{
          demandes?: { status: string }[];
        }>('/api/demandes/join', { skipAuthRedirect: true });
        const pending = data.demandes?.find((d) => d.status === 'pending');
        if (pending && !cancelled) {
          redirecting = true;
          router.replace('/player');
          return;
        }
      } catch (err) {
        logger.error('[join-team] auth error:', err);
        if (!cancelled) setError(t.connectionError);
      } finally {
        if (!cancelled && !redirecting) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, token, router, adminFetchJson]);

  // Recharge la liste quand la recherche (debouncee) change.
  useEffect(() => {
    if (!ready) return;
    loadTeams(debouncedSearch);
  }, [debouncedSearch, ready, loadTeams]);

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
      await adminFetchJson('/api/demandes/join', {
        method: 'POST',
        body: JSON.stringify({
          teamId: selectedTeamId,
          message: message.trim() || undefined,
          desiredRole,
        }),
      });

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
          <div className="max-w-md text-center" role="status">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
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
                {/* Recherche + selection d'equipe (composant partage) */}
                <div>
                  <TeamPicker
                    teams={teams}
                    value={selectedTeamId}
                    onChange={setSelectedTeamId}
                    loading={teamsLoading}
                    error={teamsError}
                    accentColor="purple"
                    countryFilter
                    label={t.searchLabel}
                    emptyLabel={t.emptyTitle}
                    search={teamSearch}
                    onSearchChange={setTeamSearch}
                    searchPlaceholder={t.searchPlaceholder}
                  />

                  {teamsError && (
                    <button
                      type="button"
                      onClick={() => loadTeams(debouncedSearch)}
                      className="mt-3 text-sm text-purple-400 hover:text-purple-300"
                    >
                      {t.retry}
                    </button>
                  )}

                  {/* Incitation à créer sa propre équipe quand aucune ne recrute. */}
                  {!teamsLoading &&
                    !teamsError &&
                    teamsLoaded &&
                    teams.length === 0 && (
                      <p className="mt-3 text-center text-xs text-gray-500">
                        {t.emptySubtitle}{' '}
                        <Link
                          href="/player/request-captain"
                          className="text-purple-400 hover:text-purple-300"
                        >
                          {t.createMyTeam}
                        </Link>
                      </p>
                    )}
                </div>

                {/* Role souhaite */}
                <div>
                  <span
                    id="desired-role-label"
                    className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
                  >
                    {t.desiredRoleLabel}
                  </span>
                  <div
                    role="radiogroup"
                    aria-labelledby="desired-role-label"
                    className="flex gap-3"
                  >
                    <button
                      type="button"
                      role="radio"
                      aria-checked={desiredRole === 'player'}
                      onClick={() => setDesiredRole('player')}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/80 ${
                        desiredRole === 'player'
                          ? 'bg-purple-600/30 border-purple-400/50 text-white'
                          : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
                      }`}
                    >
                      {t.rolePlayer}
                    </button>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={desiredRole === 'substitute'}
                      onClick={() => setDesiredRole('substitute')}
                      className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition border focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/80 ${
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
                  <div
                    role="alert"
                    className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
                  >
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
