// pages/invitation/[token].tsx
//
// La page qu'on ouvre depuis l'email d'invitation.
//
// Elle montre d'abord CE QU'ON PROPOSE — quel espace, quel rôle, jusqu'à quand
// — avant de demander quoi que ce soit. Un lien qui exige une connexion sans
// dire à quoi elle sert se referme aussi vite qu'il s'ouvre.
//
// Trois refus possibles, tous dits en clair plutôt qu'en code : invitation
// expirée, annulée, ou envoyée à une autre adresse que celle du compte
// connecté. Le dernier cas est le plus fréquent (deux comptes, deux adresses) —
// d'où l'indice d'adresse affiché, tronqué.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';

type Invitation = {
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  tenantName: string;
  role: string;
  emailHint: string;
  expiresAt: string;
};

const ROLE_LABELS: Record<string, string> = {
  owner: 'propriétaire',
  admin: 'administration',
  caster: 'cast et régie',
};

export default function InvitationPage() {
  const router = useRouter();
  const token = typeof router.query.token === 'string' ? router.query.token : '';

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/invitations/${encodeURIComponent(token)}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Invitation introuvable.');
        return;
      }
      setInvitation(json as Invitation);
    } catch {
      setError('Invitation indisponible pour le moment.');
    }
  }, [token]);

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
        setError(json.error || "L'acceptation a échoué.");
        return;
      }
      setDone(true);
    } catch {
      setError("L'acceptation a échoué.");
    } finally {
      setBusy(false);
    }
  };

  const body = () => {
    if (error && !invitation) {
      return <p className="text-sm text-red-300">{error}</p>;
    }
    if (!invitation) {
      return <p className="text-sm text-neutral-400">Chargement…</p>;
    }
    if (done || invitation.status === 'accepted') {
      return (
        <>
          <p className="text-sm text-neutral-300">
            C&apos;est fait : vous avez accès à{' '}
            <strong className="text-white">{invitation.tenantName}</strong>.
          </p>
          <Link
            href="/admin"
            className="mt-5 inline-block rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
          >
            Ouvrir l&apos;administration
          </Link>
        </>
      );
    }
    if (invitation.status === 'revoked' || invitation.status === 'expired') {
      return (
        <p className="text-sm text-neutral-300">
          {invitation.status === 'revoked'
            ? 'Cette invitation a été annulée.'
            : 'Cette invitation a expiré.'}{' '}
          Demandez-en une nouvelle à la personne qui vous a invité·e.
        </p>
      );
    }
    return (
      <>
        <p className="text-sm text-neutral-300">
          On vous propose un accès{' '}
          <strong className="text-white">
            {ROLE_LABELS[invitation.role] ?? invitation.role}
          </strong>{' '}
          à l&apos;espace{' '}
          <strong className="text-white">{invitation.tenantName}</strong>.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Invitation envoyée à {invitation.emailHint} — connectez-vous avec
          cette adresse pour l&apos;accepter.
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
          {busy ? 'Acceptation…' : "Accepter l'invitation"}
        </button>
      </>
    );
  };

  return (
    <>
      <Head>
        <title>Invitation</title>
        {/* Un lien d'invitation ne doit jamais finir dans un index. */}
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="min-h-screen bg-neutral-950 px-4 py-24 text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-neutral-800 bg-neutral-900/60 p-8">
          <h1 className="text-xl font-bold tracking-tight">Invitation</h1>
          <div className="mt-4">{body()}</div>
        </div>
      </main>
    </>
  );
}
