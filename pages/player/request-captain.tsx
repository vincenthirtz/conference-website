// pages/player/request-captain.tsx
// Page pour demander à devenir capitaine d'une équipe (existante ou nouvelle)

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useDebounce } from '@/hooks/useDebounce';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import ExistingTeamSelector from '@/components/player/ExistingTeamSelector';
import NewTeamForm from '@/components/player/NewTeamForm';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../../utils/logger';

type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type TeamMember = {
  email: string;
  battleTag: string;
  displayName: string;
  specialty: string;
};

export default function RequestCaptainPage() {
  const router = useRouter();
  const { user, token, loading: authLoading, ready } = usePlayerSession();
  const t = useT('requestCaptain');
  const [loading, setLoading] = useState(true);

  // Mode de sélection
  const [mode, setMode] = useState<'existing' | 'new'>('new');

  // Équipes existantes
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [teamSearch, setTeamSearch] = useState('');

  // Nouvelle équipe
  const [teamName, setTeamName] = useState('');

  // Membres (pour nouvelle équipe)
  const [members, setMembers] = useState<TeamMember[]>([]);
  // Validité des membres remontée par NewTeamForm (email/BattleTag/doublons).
  const [membersValid, setMembersValid] = useState(true);

  // Message et états
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successTeamName, setSuccessTeamName] = useState('');

  const debouncedSearch = useDebounce(teamSearch, 300);

  const loadTeams = useCallback(
    async (search?: string) => {
      setTeamsLoading(true);
      try {
        const params = new URLSearchParams();
        if (search?.trim()) {
          params.set('search', search.trim());
        }
        const res = await fetch(`/api/teams?${params.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setTeams(data.teams || []);
        }
      } catch (err) {
        logger.error('[request-captain] load teams error:', err);
      } finally {
        setTeamsLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!ready || !token) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/demandes/captain', {
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
        logger.error('[request-captain] auth error:', err);
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

  // Recharge la liste d'equipes quand la recherche (debouncee) change.
  useEffect(() => {
    if (!ready) return;
    loadTeams(debouncedSearch);
  }, [debouncedSearch, ready, loadTeams]);

  const addMember = () => {
    if (members.length >= 5) return;
    setMembers([
      ...members,
      { email: '', battleTag: '', displayName: '', specialty: '' },
    ]);
  };

  const updateMember = (
    index: number,
    field: keyof TeamMember,
    value: string
  ) => {
    const updated = [...members];
    updated[index][field] = value;
    setMembers(updated);
  };

  const removeMember = (index: number) => {
    setMembers(members.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Garde anti double-submit : le disabled ne protège pas d'un double-Enter
    // envoyé avant le re-render.
    if (submitting) return;
    setError(null);

    if (mode === 'existing') {
      if (!selectedTeamId) {
        setError(t.errSelectTeam);
        return;
      }
    } else {
      if (!teamName.trim()) {
        setError(t.errTeamNameRequired);
        return;
      }
      if (teamName.trim().length < 2) {
        setError(t.errTeamNameTooShort);
        return;
      }
      // Bloque tant qu'un membre a une erreur (BattleTag / email / doublon)
      // affichée par NewTeamForm.
      if (!membersValid) {
        setError(t.errMemberInvalid);
        return;
      }
    }

    const validMembers = members.filter((m) => m.email.trim());
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const m of validMembers) {
      if (!emailRegex.test(m.email.trim())) {
        setError(format(t.errInvalidEmail, { email: m.email }));
        return;
      }
    }

    setSubmitting(true);

    try {
      const body: any = {
        message: message.trim() || undefined,
      };

      if (mode === 'existing') {
        body.existingTeamId = selectedTeamId;
      } else {
        body.teamName = teamName.trim();
        if (validMembers.length > 0) {
          body.members = validMembers.map((m) => ({
            email: m.email.trim(),
            battleTag: m.battleTag.trim() || undefined,
            displayName: m.displayName.trim() || undefined,
            specialty: m.specialty.trim() || null,
          }));
        }
      }

      const res = await fetch('/api/demandes/captain', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || t.errCreateRequest);
      }

      if (mode === 'existing') {
        const team = teams.find((tm) => tm.id === selectedTeamId);
        setSuccessTeamName(team?.name || t.fallbackSelectedTeam);
      } else {
        setSuccessTeamName(teamName.trim());
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || t.errGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return <PlayerPageSkeleton rows={3} />;
  }

  if (!user) {
    return null;
  }

  if (success) {
    return (
      <>
        <Head>
          <title>{t.successTitleTab}</title>
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
            <h1 className="text-2xl font-bold mb-4">{t.successHeading}</h1>
            <p className="text-gray-400 mb-6">
              {format(t.successBody, { teamName: successTeamName })}
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
        <title>{t.pageTitleTab}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-2xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            {t.backLink}
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h1 className="text-2xl font-bold mb-2">{t.heading}</h1>
            <p className="text-gray-400 text-sm mb-6">{t.intro}</p>

            {/* Toggle mode */}
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setMode('new')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  mode === 'new'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {t.modeNew}
              </button>
              <button
                type="button"
                onClick={() => setMode('existing')}
                className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition ${
                  mode === 'existing'
                    ? 'bg-purple-600 text-white'
                    : 'bg-white/5 text-gray-400 hover:bg-white/10'
                }`}
              >
                {t.modeExisting}
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {mode === 'existing' && (
                <ExistingTeamSelector
                  teams={teams}
                  teamsLoading={teamsLoading}
                  selectedTeamId={selectedTeamId}
                  teamSearch={teamSearch}
                  onTeamSearchChange={setTeamSearch}
                  onSelectTeam={setSelectedTeamId}
                />
              )}

              {mode === 'new' && (
                <NewTeamForm
                  teamName={teamName}
                  onTeamNameChange={setTeamName}
                  members={members}
                  onAddMember={addMember}
                  onUpdateMember={updateMember}
                  onRemoveMember={removeMember}
                  onValidityChange={setMembersValid}
                />
              )}

              {/* Message */}
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

              {(() => {
                const submitDisabled =
                  submitting ||
                  (mode === 'existing' && !selectedTeamId) ||
                  (mode === 'new' && (!teamName.trim() || !membersValid));
                return (
                  <button
                    type="submit"
                    disabled={submitDisabled}
                    className={`w-full px-4 py-3 rounded-xl font-semibold transition ${
                      submitDisabled
                        ? 'bg-gray-600 cursor-not-allowed'
                        : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400'
                    }`}
                  >
                    {submitting ? t.submitting : t.submit}
                  </button>
                );
              })()}
            </form>
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            <p>{t.footerNote}</p>
          </div>
        </main>
      </div>
    </>
  );
}

const requestCaptainSeo: SeoProps = {
  title: 'Devenir capitaine',
  description: "Demande à devenir capitaine d'une équipe OW Women's Cup.",
  noindex: true,
};

RequestCaptainPage.seo = requestCaptainSeo;
