// pages/invitation/[token].tsx
//
// La page qu'on ouvre depuis un lien d'invitation — d'ESPACE ou d'ÉQUIPE.
//
// Elle montre d'abord CE QU'ON PROPOSE — quoi, quel rôle, jusqu'à quand — avant
// de demander quoi que ce soit. Un lien qui exige une connexion sans dire à quoi
// elle sert se referme aussi vite qu'il s'ouvre.
//
// WHY elle sert DEUX familles : les deux émettent la même URL
// `/invitation/<token>` (utils/teams/inviteLinks.ts et
// utils/tenants/invitationEmail.ts). Quand la page n'en connaissait qu'une,
// l'autre famille recevait « Invitation introuvable » sur des liens valides.
// C'est désormais l'API qui identifie la famille (`kind`) et la page qui rend
// le panneau correspondant — la route ne décide plus de rien.
//
// Un lien d'équipe PARTAGEABLE (`/rejoindre/<token>`) collé ici est redirigé
// plutôt que refusé.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useT, format } from '@/lib/i18n/useT';
import nsInvitationPage from '@/lib/i18n/locales/fr/invitationPage';
import TeamInvitationPanel, {
  type TeamInvitationInfo,
} from '@/components/invitation/TeamInvitationPanel';

type TenantInvitation = {
  kind: 'tenant';
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  tenantName: string;
  role: string;
  emailHint: string;
  expiresAt: string;
};

type TeamInvitation = {
  kind: 'team';
  invitation: TeamInvitationInfo;
};

type Loaded = TenantInvitation | TeamInvitation;

export default function InvitationPage() {
  const t = useT(nsInvitationPage);
  const router = useRouter();
  const roleLabel = (role: string) =>
    role === 'owner'
      ? t.roleOwner
      : role === 'admin'
        ? t.roleAdmin
        : role === 'caster'
          ? t.roleCaster
          : role;
  const token =
    typeof router.query.token === 'string' ? router.query.token : '';

  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t.notFound);
        return;
      }
      // Lien d'équipe partageable : sa page sait le servir, pas celle-ci.
      if (json.kind === 'join-link' && json.redirectTo) {
        void router.replace(json.redirectTo);
        return;
      }
      setLoaded(json as Loaded);
    } catch {
      setError(t.unavailable);
    }
  }, [token, t, router]);

  useEffect(() => {
    void load();
  }, [load]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t.acceptFailed);
        return;
      }
      setDone(true);
    } catch {
      setError(t.acceptFailed);
    } finally {
      setBusy(false);
    }
  };

  const body = () => {
    if (error && !loaded) {
      return <p className="text-sm text-red-300">{error}</p>;
    }
    if (!loaded) {
      return <p className="text-sm text-neutral-400">{t.loading}</p>;
    }

    // L'invitation d'équipe a son propre panneau : rôles, capitanat, refus
    // possible, bascule de compte. Rien de tout cela n'a de sens pour un espace.
    if (loaded.kind === 'team') {
      return <TeamInvitationPanel token={token} info={loaded.invitation} />;
    }

    const invitation = loaded;
    if (done || invitation.status === 'accepted') {
      return (
        <>
          <p className="text-sm text-neutral-300">
            {format(t.doneTitle, { tenant: invitation.tenantName })}
          </p>
          <Link
            href="/admin"
            className="mt-5 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            {t.openAdmin}
          </Link>
        </>
      );
    }
    if (invitation.status === 'revoked' || invitation.status === 'expired') {
      return (
        <p className="text-sm text-neutral-300">
          {invitation.status === 'revoked' ? t.revoked : t.expired} {t.askAgain}
        </p>
      );
    }
    return (
      <>
        <p className="text-sm text-neutral-300">
          {format(t.offer, {
            role: roleLabel(invitation.role),
            tenant: invitation.tenantName,
          })}
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          {format(t.emailHint, { email: invitation.emailHint })}
        </p>
        {error && (
          <p className="mt-3 text-sm text-red-300" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          onClick={accept}
          disabled={busy}
          className="mt-5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
          data-testid="accept-invitation"
        >
          {busy ? t.accepting : t.accept}
        </button>
      </>
    );
  };

  return (
    <>
      <Head>
        <title>{t.title}</title>
        {/* Un lien d'invitation ne doit jamais finir dans un index. */}
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="min-h-screen bg-neutral-950 px-4 py-24 text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8">
          {/* Le panneau d'équipe nomme lui-même l'équipe dans son propre h1 :
              en ajouter un générique au-dessus ferait deux titres de niveau 1
              sur la page, et le moins informatif des deux en premier. */}
          {loaded?.kind !== 'team' && (
            <h1 className="text-xl font-bold tracking-tight">{t.title}</h1>
          )}
          <div className={loaded?.kind === 'team' ? '' : 'mt-4'}>{body()}</div>
        </div>
      </main>
    </>
  );
}
