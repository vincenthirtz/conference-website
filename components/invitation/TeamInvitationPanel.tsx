// components/invitation/TeamInvitationPanel.tsx
//
// L'invitation NOMINATIVE à rejoindre une équipe, telle que la voit l'invitée.
//
// WHY ce composant existe : cette UI vivait DANS `pages/invitation/[token].tsx`.
// Quand cette page a été réécrite pour une autre famille d'invitation, l'UI est
// partie avec elle et tous les liens d'équipe ont affiché « Invitation
// introuvable ». Sortie de la page, elle ne dépend plus de qui occupe la route.
//
// Le lien n'authentifie PAS (cf. utils/teams/inviteLinks.ts) : on décrit
// l'invitation à tout le monde, puis on exige une session dont l'identité
// correspond à la personne invitée.

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useSession } from '@/hooks/useSession';
import { supabaseClient } from '@/utils/supabase';
import { useT, format } from '@/lib/i18n/useT';
import nsInvitationLink from '@/lib/i18n/locales/fr/invitationLink';

export type TeamInvitationInfo = {
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

/**
 * Même masque que le serveur (`maskEmail` dans utils/teams/inviteByToken.ts) :
 * le GET ne renvoie que l'adresse invitée MASQUÉE, on masque donc l'adresse de
 * session pour pouvoir les comparer sans jamais demander l'adresse en clair.
 *
 * Heuristique volontairement prudente : deux adresses différentes qui partagent
 * initiale et domaine se ressemblent une fois masquées, et on n'avertit pas.
 * C'est le serveur qui tranche à l'acceptation — l'avertissement n'est là que
 * pour éviter le clic perdu, pas pour autoriser quoi que ce soit.
 */
function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 1) || '*'}***@${domain}`;
}

export default function TeamInvitationPanel({
  token,
  info,
}: {
  token: string;
  info: TeamInvitationInfo;
}) {
  const t = useT(nsInvitationLink);
  const router = useRouter();
  const { user, token: authToken, loading: authLoading } = useSession();
  const sessionEmail = user?.email ?? null;

  const [actionLoading, setActionLoading] = useState<
    'accept' | 'reject' | null
  >(null);
  const [done, setDone] = useState<'accept' | 'reject' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promotedToCaptain, setPromotedToCaptain] = useState(false);

  const act = useCallback(
    async (action: 'accept' | 'reject') => {
      if (!token) return;
      setActionLoading(action);
      setActionError(null);
      try {
        const res = await fetch(
          `/api/invitations/${encodeURIComponent(token)}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              // La route accepte cookie OU Bearer : on envoie le Bearer quand
              // `useSession` en a un, le cookie prend le relais sinon.
              ...(authToken
                ? { Authorization: `Bearer ${authToken}` }
                : undefined),
            },
            body: JSON.stringify({ action }),
          }
        );
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          // 403 « pas la destinataire » : on recompose le message côté client
          // pour l'avoir traduit, et surtout pour NOMMER les deux adresses.
          // « Cette invitation ne t'est pas destinée » seul laissait la personne
          // relire son propre mail et conclure que le site se trompait.
          if (json?.code === 'NOT_INVITEE' && json?.invited_email) {
            setActionError(
              format(t.mismatchBody, {
                invited: json.invited_email,
                current: json.session_email || sessionEmail || '—',
              })
            );
            return;
          }
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
    [token, authToken, sessionEmail, t]
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

  const loginHref = `/login?next=${encodeURIComponent(`/invitation/${token}`)}`;

  // Compte connecté ≠ compte invité : le cas réel le plus fréquent (connexion
  // via Discord, dont l'adresse n'est pas celle saisie par la capitaine). On
  // prévient AVANT le clic ; les boutons restent actifs, car le masque peut se
  // tromper dans les deux sens et c'est le serveur qui décide.
  const emailMismatch =
    !!info.invited_email &&
    !!sessionEmail &&
    maskEmail(sessionEmail.toLowerCase()) !== info.invited_email.toLowerCase();

  const switchAccount = useCallback(async () => {
    try {
      await supabaseClient.auth.signOut();
    } catch {
      // Peu importe : ce qui compte est d'arriver sur /login, qui refera une
      // session propre par-dessus.
    }
    router.push(loginHref);
  }, [router, loginHref]);

  if (done) {
    return (
      <>
        <h1 className="text-xl font-bold">
          {done === 'accept' ? t.acceptedTitle : t.rejectedTitle}
        </h1>
        <p className="mt-2 text-sm text-gray-300">
          {done === 'accept'
            ? promotedToCaptain
              ? format(t.acceptedCaptainBody, { team: info.team_name ?? '' })
              : format(t.acceptedBody, { team: info.team_name ?? '' })
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
    );
  }

  return (
    <>
      <p className="text-[11px] uppercase tracking-[0.14em] text-gray-400">
        {t.eyebrow}
      </p>
      <h1 className="mt-1 text-2xl font-black">
        {format(t.heading, { team: info.team_name ?? '' })}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-gray-300">
        {format(t.body, {
          team: info.team_name ?? '',
          role: roleLabel(info.role, info.as_captain),
        })}
      </p>
      {info.as_captain && (
        <p className="mt-3 rounded-xl border border-[var(--color-yellow)]/30 bg-[var(--color-yellow)]/10 px-4 py-3 text-xs text-[var(--color-yellow)]">
          {t.captainNote}
        </p>
      )}
      {info.invited_email && (
        <p className="mt-3 text-xs text-gray-500">
          {format(t.sentTo, { email: info.invited_email })}
        </p>
      )}

      {actionError && (
        <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {actionError}
        </p>
      )}

      {!authLoading && user && emailMismatch && (
        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-sm font-semibold text-amber-100">
            {t.mismatchTitle}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-100/80">
            {format(t.mismatchBody, {
              invited: info.invited_email ?? '',
              current: sessionEmail ?? '',
            })}
          </p>
        </div>
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
            data-testid="accept-invitation"
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
          {/* Sortie de secours : sans elle, la personne connectée au mauvais
              compte n'a AUCUN moyen évident de changer — le header de la page
              publique n'a pas de déconnexion. */}
          <button
            type="button"
            onClick={switchAccount}
            disabled={!!actionLoading}
            className="inline-flex rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
          >
            {t.switchAccount}
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-sm text-gray-300">{t.loginRequired}</p>
          <p className="mt-2 text-xs leading-relaxed text-amber-200/80">
            {t.loginDiscordWarning}
          </p>
          <Link
            href={loginHref}
            className="mt-3 inline-flex rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500"
          >
            {t.loginCta}
          </Link>
        </div>
      )}
      {!authLoading && user && sessionEmail && (
        <p className="mt-3 text-xs text-gray-500">
          {format(t.connectedAs, { email: sessionEmail })}
        </p>
      )}
    </>
  );
}
