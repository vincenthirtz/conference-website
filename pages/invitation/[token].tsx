// pages/invitation/[token].tsx
//
// Page publique du « lien privé » d'invitation d'équipe.
//
// Le lien n'authentifie PAS (cf. utils/teams/inviteLinks.ts) : il décrit
// l'invitation à tout le monde (équipe, rôle proposé, adresse masquée), puis
// exige une session pour accepter ou refuser. Un visiteur anonyme est envoyé
// vers /login?next=/invitation/<token> et revient ici une fois connecté.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from '@/hooks/useSession';
import { useT, format } from '@/lib/i18n/useT';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import nsInvitationLink from '@/lib/i18n/locales/fr/invitationLink';

type InvitationInfo = {
  team_name: string | null;
  team_slug: string | null;
  team_logo_url: string | null;
  role: string;
  as_captain: boolean;
  battle_tag: string | null;
  specialty: string | null;
  invited_email: string | null;
  expires_at: string | null;
};

function InvitationByTokenPage() {
  const t = useT(nsInvitationLink);
  const router = useRouter();
  const { user, token: authToken, loading: authLoading } = useSession();

  const token =
    typeof router.query.token === 'string' ? router.query.token : null;

  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<
    'accept' | 'reject' | null
  >(null);
  const [done, setDone] = useState<'accept' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promotedToCaptain, setPromotedToCaptain] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setLoading(false);
      setLoadError(t.errorNotFound);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/teams/invitations/by-token?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok) {
          setLoadError(json?.error || t.errorNotFound);
          return;
        }
        setInfo(json?.invitation ?? null);
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

  const act = useCallback(
    async (action: 'accept' | 'reject') => {
      if (!token || !authToken) return;
      setActionLoading(action);
      setActionError(null);
      try {
        const res = await fetch('/api/teams/invitations/by-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({ token, action }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setActionError(json?.error || t.errorAction);
          return;
        }
        setDone(action);
        setPromotedToCaptain(!!json?.promotedToCaptain);
      } catch {
        setActionError(t.errorNetwork);
      } finally {
        setActionLoading(null);
      }
    },
    [token, authToken, t]
  );

  const roleLabel = (role: string, asCaptain: boolean): string => {
    if (asCaptain) return t.roleCaptain;
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

  const loginHref = `/login?next=${encodeURIComponent(
    `/invitation/${token ?? ''}`
  )}`;

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
                  {done === 'accept' ? t.acceptedTitle : t.rejectedTitle}
                </h1>
                <p className="mt-2 text-sm text-gray-300">
                  {done === 'accept'
                    ? promotedToCaptain
                      ? format(t.acceptedCaptainBody, {
                          team: info?.team_name ?? '',
                        })
                      : format(t.acceptedBody, { team: info?.team_name ?? '' })
                    : t.rejectedBody}
                </p>
                {done === 'accept' && (
                  <Link
                    href="/player/manage-team"
                    className="mt-6 inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500"
                  >
                    {t.goToTeamSpace}
                  </Link>
                )}
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
                  {t.eyebrow}
                </p>
                <h1 className="mt-1 text-2xl font-black">
                  {format(t.heading, { team: info?.team_name ?? '' })}
                </h1>
                <p className="mt-3 text-sm leading-relaxed text-gray-300">
                  {format(t.body, {
                    team: info?.team_name ?? '',
                    role: roleLabel(info?.role ?? 'player', !!info?.as_captain),
                  })}
                </p>
                {info?.as_captain && (
                  <p className="mt-3 rounded-xl border border-[var(--color-yellow)]/30 bg-[var(--color-yellow)]/10 px-4 py-3 text-xs text-[var(--color-yellow)]">
                    {t.captainNote}
                  </p>
                )}
                {info?.invited_email && (
                  <p className="mt-3 text-xs text-gray-500">
                    {format(t.sentTo, { email: info.invited_email })}
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
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => act('accept')}
                      disabled={!!actionLoading}
                      className="inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500 disabled:opacity-50"
                    >
                      {actionLoading === 'accept' ? t.pending : t.accept}
                    </button>
                    <button
                      type="button"
                      onClick={() => act('reject')}
                      disabled={!!actionLoading}
                      className="inline-flex rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
                    >
                      {actionLoading === 'reject' ? t.pending : t.reject}
                    </button>
                  </div>
                ) : (
                  <div className="mt-6">
                    <p className="text-sm text-gray-300">{t.loginRequired}</p>
                    <Link
                      href={loginHref}
                      className="mt-3 inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500"
                    >
                      {t.loginCta}
                    </Link>
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
const invitationSeo: SeoProps = {
  title: {
    fr: 'Invitation à rejoindre une équipe',
    en: 'Team invitation',
  },
  description: {
    fr: 'Accepte ou refuse une invitation à rejoindre une équipe.',
    en: 'Accept or decline an invitation to join a team.',
  },
  noindex: true,
};

InvitationByTokenPage.seo = invitationSeo;

export default InvitationByTokenPage;
