// components/player/InvitationsSection.tsx
// Espace joueur — "Invitations reçues".
// Liste les invitations d'équipe en attente (GET /api/player/invitations) et
// permet de les accepter (rejoindre l'équipe) ou de les décliner
// (POST /api/player/invitations/{id}). Suppression optimiste de la carte au
// succès + feedback toast. Mappe les statuts d'erreur (403/404/409/410) vers
// des messages clairs.
//
// Convention du fichier : si aucune invitation, le composant ne rend rien
// (section masquée) — l'appelant peut le placer inconditionnellement.
//
// `onJoined` est appelé après une acceptation réussie. La vérification
// Battle.net est strictement PERSONNELLE (chaque joueuse relie SON compte
// Blizzard ; la capitaine ne peut pas le faire à sa place), donc l'acceptation
// d'invitation est LE moment de la proposer à une joueuse non-capitaine : elle
// vient d'entrer sur un roster et elle est connectée. La carte est rendue par
// l'appelant, parce que cette section se démonte dès qu'il n'y a plus
// d'invitation en attente.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { logger } from '../../utils/logger';

export type PlayerInvitation = {
  id: string;
  teamId: string;
  teamName: string;
  role: string;
  specialty: string | null;
  battleTag: string | null;
  expiresAt: string | null;
  createdAt: string;
};

type InvitationsResponse = { invitations: PlayerInvitation[] };

type Props = {
  /** Appelé après une acceptation réussie (invitation → membre du roster). */
  onJoined?: (teamName: string) => void;
};

export default function InvitationsSection({ onJoined }: Props = {}) {
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const t = useT('playerNotifications');
  const locale = useLocale();

  const [invites, setInvites] = useState<PlayerInvitation[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Map a raw invite role to a localized label.
  const roleLabelFor = useCallback(
    (role: string): string => {
      switch (role) {
        case 'substitute':
          return t.inviteRoleSubstitute;
        case 'coach':
          return t.inviteRoleCoach;
        case 'manager':
          return t.inviteRoleManager;
        default:
          return t.inviteRolePlayer;
      }
    },
    [t]
  );

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<InvitationsResponse>(
        '/api/player/invitations',
        { skipAuthRedirect: true }
      );
      setInvites(data.invitations ?? []);
    } catch (err) {
      // Silencieux : l'inbox d'invitations est secondaire sur cette page.
      // On loggue mais on ne casse pas le reste des notifications.
      logger.error('[player/invitations] load error:', err);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const mapError = useCallback(
    (err: unknown): string => {
      if (err instanceof AdminFetchError) {
        switch (err.status) {
          case 409:
            return t.alreadyInTeam;
          case 410:
            return t.inviteExpired;
          case 404:
            return t.inviteNotFound;
          case 403:
            return t.inviteForbidden;
          default:
            return t.inviteError;
        }
      }
      return t.inviteError;
    },
    [t]
  );

  const handleAction = useCallback(
    async (invite: PlayerInvitation, action: 'accept' | 'reject') => {
      if (pendingId) return;
      // Accepting joins the team (and leaves any current one) — confirm first.
      if (action === 'accept') {
        const ok = await confirm({
          title: format(t.inviteConfirmTitle, { team: invite.teamName }),
          subtitle: t.inviteConfirmSubtitle,
          variant: 'warning',
          confirmLabel: t.inviteConfirmYes,
          cancelLabel: t.inviteConfirmNo,
        });
        if (!ok) return;
      }
      setPendingId(invite.id);
      try {
        await adminFetchJson(`/api/player/invitations/${invite.id}`, {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
        // Succès : retrait optimiste de la carte.
        setInvites((prev) => prev.filter((i) => i.id !== invite.id));
        if (action === 'accept') onJoined?.(invite.teamName);
        addToast(
          action === 'accept'
            ? format(t.inviteAccepted, { team: invite.teamName })
            : t.inviteDeclined,
          'success'
        );
      } catch (err) {
        logger.error('[player/invitations] action error:', err);
        const message = mapError(err);
        addToast(message, 'error');
        // Si l'invitation n'existe plus / a expiré, on la retire de la liste
        // pour éviter un nouveau clic voué à échouer.
        if (
          err instanceof AdminFetchError &&
          (err.status === 404 || err.status === 410 || err.status === 403)
        ) {
          setInvites((prev) => prev.filter((i) => i.id !== invite.id));
        }
      } finally {
        setPendingId(null);
      }
    },
    [pendingId, adminFetchJson, addToast, confirm, t, mapError, onJoined]
  );

  // Empty state : on ne rend rien quand il n'y a pas d'invitation.
  if (invites.length === 0) return null;

  return (
    <section>
      {dialog}
      <h2 className="text-lg font-semibold mb-1 text-white">
        {t.invitesTitle}
      </h2>
      <p className="text-sm text-gray-400 mb-4">{t.invitesIntro}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {invites.map((invite) => {
          const busy = pendingId === invite.id;
          const roleLabel = invite.specialty
            ? format(t.inviteRoleWithSpecialty, {
                role: roleLabelFor(invite.role),
                specialty: invite.specialty,
              })
            : format(t.inviteRole, { role: roleLabelFor(invite.role) });
          const expiryLabel = invite.expiresAt
            ? format(t.inviteExpires, {
                date: new Date(invite.expiresAt).toLocaleDateString(locale, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                }),
              })
            : t.inviteNoExpiry;

          return (
            <div
              key={invite.id}
              className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-5 flex flex-col gap-3"
            >
              <div className="min-w-0">
                <p className="text-base font-semibold text-white truncate">
                  {invite.teamName}
                </p>
                <p className="mt-1 text-sm text-gray-200">{roleLabel}</p>
                <p className="mt-0.5 text-xs text-gray-400">{expiryLabel}</p>
              </div>

              <div className="flex flex-wrap gap-2 mt-1">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAction(invite, 'accept')}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60"
                >
                  {t.acceptInvite}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleAction(invite, 'reject')}
                  className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  {t.declineInvite}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
