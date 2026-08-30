// pages/rejoindre/[token].tsx
//
// Page publique du « lien d'équipe » (cf. utils/teams/inviteLinks.ts et
// pages/api/teams/invite-links/*).
//
// Différence avec /invitation/[token] : celui-là est NOMINATIF (il décrit
// l'invitation d'une personne précise, qui accepte ou refuse). Ici le lien ne
// vise personne — il a été collé dans un Discord — donc la page décrit
// l'ÉQUIPE, puis exige une session et inscrit qui la valide.
//
// Le lien n'authentifie pas : un visiteur anonyme est envoyé vers
// /login?next=/rejoindre/<token> et revient ici connecté.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from '@/hooks/useSession';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import nsTeamJoinLink from '@/lib/i18n/locales/fr/teamJoinLink';

type JoinLinkInfo = {
  team: {
    name: string;
    short_name: string | null;
    logo_url: string | null;
    slug: string | null;
  };
  role: string;
  battle_tag_required: boolean;
  expires_at: string | null;
  remaining_uses: number | null;
};

const SPECIALTIES = ['tank', 'dps', 'support', 'flex'] as const;

function JoinByLinkPage() {
  const t = useT(nsTeamJoinLink);
  const router = useRouter();
  const { user, token: authToken, loading: authLoading } = useSession();

  const token =
    typeof router.query.token === 'string' ? router.query.token : null;

  const [info, setInfo] = useState<JoinLinkInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [done, setDone] = useState<'joined' | 'already' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [battleTag, setBattleTag] = useState('');
  const [specialty, setSpecialty] = useState('');

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setLoading(false);
      setLoadError(t.errorNotFound);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/teams/invite-links/by-token?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error || t.errorNotFound);
          return;
        }
        setInfo(json as JoinLinkInfo);
      })
      .catch(() => {
        if (!cancelled) setLoadError(t.errorNetwork);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router.isReady, token, t]);

  const join = useCallback(async () => {
    if (!token || !authToken) return;
    setJoining(true);
    setActionError(null);
    try {
      const res = await fetch('/api/teams/invite-links/by-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          token,
          battle_tag: battleTag.trim() || null,
          specialty: specialty || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(json?.error || t.errorAction);
        return;
      }
      setDone(json?.already_member ? 'already' : 'joined');
    } catch {
      setActionError(t.errorNetwork);
    } finally {
      setJoining(false);
    }
  }, [token, authToken, battleTag, specialty, t]);

  const roleLabel = (role: string): string => {
    switch (role) {
      case 'manager':
        return t.roleManager;
      case 'coach':
        return t.roleCoach;
      case 'substitute':
        return t.roleSubstitute;
      default:
        return t.rolePlayer;
    }
  };

  const nextHref = `/rejoindre/${token ?? ''}`;
  const teamName = info?.team.name ?? '';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
        {/* Lien privé : jamais indexé. */}
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black px-4 py-16 text-white">
        <div className="mx-auto max-w-lg">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8">
            {loading ? (
              <p className="text-sm text-gray-400">{t.loading}</p>
            ) : loadError ? (
              <>
                <h1 className="text-xl font-bold">{t.errorTitle}</h1>
                <p className="mt-2 text-sm text-gray-400">{loadError}</p>
                <Link
                  href="/"
                  className="mt-6 inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500"
                >
                  {t.backHome}
                </Link>
              </>
            ) : done ? (
              <>
                <h1 className="text-xl font-bold">
                  {done === 'joined' ? t.joinedTitle : t.alreadyMemberTitle}
                </h1>
                <p className="mt-2 text-sm text-gray-300">
                  {format(
                    done === 'joined' ? t.joinedBody : t.alreadyMemberBody,
                    { team: teamName }
                  )}
                </p>
                <Link
                  href="/player/manage-team"
                  className="mt-6 inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500"
                >
                  {t.goToTeamSpace}
                </Link>
              </>
            ) : (
              <>
                <div className="flex items-center gap-4">
                  {info?.team.logo_url && (
                    <Image
                      src={info.team.logo_url}
                      alt=""
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-xl object-contain"
                      unoptimized
                    />
                  )}
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                      {t.eyebrow}
                    </p>
                    <h1 className="mt-1 text-2xl font-black">
                      {format(t.heading, { team: teamName })}
                    </h1>
                  </div>
                </div>

                <p className="mt-4 text-sm leading-relaxed text-gray-300">
                  {format(t.body, {
                    team: teamName,
                    role: roleLabel(info?.role ?? 'player'),
                  })}
                </p>

                {typeof info?.remaining_uses === 'number' && (
                  <p className="mt-2 text-xs text-gray-500">
                    {format(t.remainingUses, {
                      count: String(info.remaining_uses),
                    })}
                  </p>
                )}
                {info?.expires_at && (
                  <p className="mt-1 text-xs text-gray-500">
                    {format(t.expiresAt, {
                      date: new Date(info.expires_at).toLocaleDateString(
                        'fr-FR'
                      ),
                    })}
                  </p>
                )}

                {actionError && (
                  <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    {actionError}
                  </p>
                )}

                {authLoading ? (
                  <p className="mt-6 text-sm text-gray-400">{t.loading}</p>
                ) : user ? (
                  <div className="mt-6 space-y-4">
                    {info?.battle_tag_required && (
                      <div>
                        <label
                          htmlFor="join-battle-tag"
                          className="block text-sm text-gray-300"
                        >
                          {t.battleTagLabel}
                        </label>
                        <input
                          id="join-battle-tag"
                          type="text"
                          value={battleTag}
                          onChange={(e) => setBattleTag(e.target.value)}
                          placeholder={t.battleTagPlaceholder}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          {t.battleTagHint}
                        </p>
                      </div>
                    )}

                    {info?.battle_tag_required && (
                      <div>
                        <label
                          htmlFor="join-specialty"
                          className="block text-sm text-gray-300"
                        >
                          {t.specialtyLabel}
                        </label>
                        <select
                          id="join-specialty"
                          value={specialty}
                          onChange={(e) => setSpecialty(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">{t.specialtyNone}</option>
                          {SPECIALTIES.map((s) => (
                            <option key={s} value={s}>
                              {
                                {
                                  tank: t.specialtyTank,
                                  dps: t.specialtyDps,
                                  support: t.specialtySupport,
                                  flex: t.specialtyFlex,
                                }[s]
                              }
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={join}
                      disabled={joining}
                      className="inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500 disabled:opacity-50"
                    >
                      {joining ? t.pending : t.join}
                    </button>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="text-sm text-gray-300">{t.loginRequired}</p>
                    <div className="mt-3 flex flex-wrap gap-3">
                      <Link
                        href={`/login?next=${encodeURIComponent(nextHref)}`}
                        className="inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500"
                      >
                        {t.loginCta}
                      </Link>
                      <Link
                        href={`/register?next=${encodeURIComponent(nextHref)}`}
                        className="inline-flex rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10"
                      >
                        {t.registerCta}
                      </Link>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/** Lien privé : hors sitemap, hors index. */
const joinSeo: SeoProps = {
  title: {
    fr: 'Rejoindre une équipe',
    en: 'Join a team',
  },
  description: {
    fr: 'Rejoins le roster d’une équipe via son lien d’invitation privé.',
    en: 'Join a team roster through its private invite link.',
  },
  noindex: true,
};

JoinByLinkPage.seo = joinSeo;

export default JoinByLinkPage;
