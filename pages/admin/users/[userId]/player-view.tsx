// pages/admin/users/[userId]/player-view.tsx
//
// Admin "Vue player" — per-player COMMAND CENTER. Staff browse a snapshot of the
// user's profile / team / matches / notifications / demandes (organised as tabs
// mirroring the player navigation) AND can act on the account. Every action is
// audited. Snapshot comes from
//   GET /api/admin/users/[userId]/player-view
// and actions REUSE the existing per-user endpoints:
//   - PATCH /api/admin/users/manage        (display_name, role, battle_tag,
//                                            resend_credentials)
//   - POST  /api/admin/demandes            (approve/reject a pending demande)
//   - GET   /api/admin/teams               (team picker for transfers)
//   - POST  /api/admin/users/[userId]/actions  (assign_captain, transfer_team —
//                                            the only paths that have no existing
//                                            reusable endpoint)
// Page gated at `manager`; admin-only actions (role change) hidden below admin.

import { useCallback, useEffect, useMemo, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import {
  withStaffPage,
  STAFF_ROLES,
  STAFF_ROLE_RANK,
  hasAtLeastRole,
  type StaffRole,
} from '@/utils/staff';
import { useAdminFetch, AdminFetchError } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import Modal from '@/components/admin/Modal';
import type { AdminPlayerViewPayload } from '@/pages/api/admin/users/[userId]/player-view';

import { logger } from '../../../../utils/logger';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export const getServerSideProps = withStaffPage('manager');

/* ----------------------------------------------------------------------- */
/* Role helpers — mirror manage.tsx so the UI never offers a forbidden      */
/* change (the API enforces the same guards too).                           */
/* ----------------------------------------------------------------------- */

const ROLE_OPTIONS = [
  'member',
  'player',
  'caster',
  'manager',
  'admin',
  'owner',
];

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  manager: 'Manager',
  caster: 'Caster',
  player: 'Joueur',
  member: 'Membre',
};

function roleLabel(role: string | null): string {
  return ROLE_LABELS[role?.toLowerCase() ?? ''] ?? role ?? 'Membre';
}

function isTargetProtected(targetRole: string | null): boolean {
  const r = targetRole?.toLowerCase();
  return r === 'owner' || r === 'admin';
}

function canGrantRole(requesterRole: string | null, role: string): boolean {
  if (requesterRole === 'owner') return true;
  const isStaffRole = (STAFF_ROLES as readonly string[]).includes(role);
  if (!isStaffRole) return true; // member/player : révocation toujours permise
  const newRank = STAFF_ROLE_RANK[role as StaffRole];
  const requesterRank = requesterRole
    ? (STAFF_ROLE_RANK[requesterRole as StaffRole] ?? -1)
    : -1;
  return newRank < requesterRank;
}

type TeamLite = { id: string; name: string };

type TabKey = 'profil' | 'equipe' | 'matchs' | 'notifications' | 'demandes';

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'profil', label: 'Profil' },
  { key: 'equipe', label: 'Équipe' },
  { key: 'matchs', label: 'Mes matchs' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'demandes', label: 'Demandes' },
];

type PlayerMatch = AdminPlayerViewPayload['matches'][number];
type Demande = AdminPlayerViewPayload['demandes'][number];

/* ----------------------------------------------------------------------- */
/* Helpers (pure presentation, no actions)                                  */
/* ----------------------------------------------------------------------- */

function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return d;
  }
}

function formatScheduled(iso: string | null): string {
  if (!iso) return 'Date à venir';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return iso;
  }
}

function initials(name: string | null, email: string | null): string {
  const base = (name || email || '?').trim();
  const parts = base.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function matchLabel(match: PlayerMatch): string | null {
  if (match.format) return match.format.toUpperCase();
  if (match.bestOf) return `BO${match.bestOf}`;
  return null;
}

function isUpcoming(match: PlayerMatch): boolean {
  if (match.status === 'pending' || match.status === 'ongoing') return true;
  if (match.scheduledAt) {
    return new Date(match.scheduledAt).getTime() > Date.now();
  }
  return false;
}

function scheduledTime(match: PlayerMatch): number {
  return match.scheduledAt ? new Date(match.scheduledAt).getTime() : 0;
}

const DEMANDE_TYPE_LABELS: Record<string, string> = {
  captain_request: 'Demande de capitaine',
  join: 'Rejoindre une équipe',
  leave: "Quitter l'équipe",
  transfer: 'Transfert',
  scrim: 'Scrim',
  other: 'Demande',
};

const DEMANDE_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  approved: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/30',
  cancelled: 'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30',
};

const DEMANDE_STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  approved: 'Approuvée',
  rejected: 'Refusée',
  cancelled: 'Annulée',
};

/* ----------------------------------------------------------------------- */
/* Small presentational atoms                                               */
/* ----------------------------------------------------------------------- */

function ResultBadge({ result }: { result: PlayerMatch['result'] }) {
  if (result === 'win') {
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-100">
        Victoire
      </span>
    );
  }
  if (result === 'loss') {
    return (
      <span className="inline-flex items-center rounded-full border border-rose-400/30 bg-rose-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-rose-100">
        Défaite
      </span>
    );
  }
  if (result === 'draw') {
    return (
      <span className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-200">
        Nul
      </span>
    );
  }
  return null;
}

/** Read-only check-in status rendered as plain text (NO button). */
function CheckinStatus({ match }: { match: PlayerMatch }) {
  const checkin = match.checkin;
  if (!checkin) return <span className="text-neutral-500">—</span>;
  if (checkin.alreadyCheckedIn) {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-300">
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 13l4 4L19 7" />
        </svg>
        Check-in validé
      </span>
    );
  }
  if (checkin.isOpen) {
    return <span className="text-amber-300">Fenêtre de check-in ouverte</span>;
  }
  if (checkin.isPassed) {
    return <span className="text-neutral-500">Check-in fermé (manqué)</span>;
  }
  return <span className="text-neutral-400">Check-in pas encore ouvert</span>;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-8 text-center text-neutral-400">
      {children}
    </div>
  );
}

function MatchRow({ match }: { match: PlayerMatch }) {
  const upcoming = isUpcoming(match);
  const label = matchLabel(match);
  const isLive = match.status === 'ongoing';

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-5">
      <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-emerald-200/70">
        {isLive && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-rose-100 text-[10px] font-semibold">
            En direct
          </span>
        )}
        {match.tournament && <span>{match.tournament.name}</span>}
        {match.roundName && <span>{match.roundName}</span>}
        {label && <span className="tabular-nums">{label}</span>}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg md:text-xl font-bold text-white leading-tight">
            <span className="text-white/50">vs</span>{' '}
            {match.opponent?.name ?? 'Adversaire à définir'}
          </h3>
          <p className="text-sm text-neutral-300 mt-1 capitalize">
            {formatScheduled(match.scheduledAt)}
          </p>
        </div>

        {!upcoming && match.score && (
          <div className="flex items-center gap-3">
            <span className="tabular-nums text-2xl font-bold text-white">
              {match.score.mine ?? '–'} <span className="text-white/40">–</span>{' '}
              {match.score.opponent ?? '–'}
            </span>
            <ResultBadge result={match.result} />
          </div>
        )}
      </div>

      {upcoming && (
        <div className="mt-3 text-sm">
          <span className="text-neutral-500">Check-in : </span>
          <CheckinStatus match={match} />
        </div>
      )}
    </div>
  );
}

function StatTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-5 ${
        highlight && value > 0
          ? 'border-emerald-500/40 bg-emerald-500/10'
          : 'border-neutral-700/50 bg-neutral-800/40'
      }`}
    >
      <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
      <div className="text-sm text-neutral-400 mt-1">{label}</div>
    </div>
  );
}

/* ----------------------------------------------------------------------- */
/* Page                                                                      */
/* ----------------------------------------------------------------------- */

function PlayerViewPage({ staff }: { staff: StaffShape }) {
  const router = useRouter();
  const rawUserId = router.query.userId;
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : rawUserId;

  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [data, setData] = useState<AdminPlayerViewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [tab, setTab] = useState<TabKey>('profil');

  // Per-action busy flags (keep buttons from double-submitting).
  const [busy, setBusy] = useState<string | null>(null);

  // Edit display name modal.
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');

  // Edit battle tag modal.
  const [editingTag, setEditingTag] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [tagError, setTagError] = useState<string | null>(null);

  // Transfer-to-team modal.
  const [transferOpen, setTransferOpen] = useState(false);
  const [teamOptions, setTeamOptions] = useState<TeamLite[]>([]);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [transferTeamId, setTransferTeamId] = useState('');

  const isAdmin = hasAtLeastRole(staff.role as StaffRole, 'admin');

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const json = await adminFetchJson<AdminPlayerViewPayload>(
        `/api/admin/users/${encodeURIComponent(userId)}/player-view`
      );
      setData(json);
    } catch (err) {
      logger.error('[admin/player-view] load error:', err);
      if (err instanceof AdminFetchError && err.status === 404) {
        setNotFound(true);
      } else {
        setError('Erreur lors du chargement de la vue player.');
      }
    } finally {
      setLoading(false);
    }
  }, [userId, adminFetchJson]);

  useEffect(() => {
    if (!router.isReady) return;
    load();
  }, [router.isReady, load]);

  const headerName =
    data?.user.displayName || data?.user.email || 'Utilisateur';

  /* --------------------------------------------------------------------- */
  /* Actions — each reuses an existing endpoint then refetches the snapshot */
  /* --------------------------------------------------------------------- */

  // PATCH /api/admin/users/manage — display_name.
  const saveName = useCallback(async () => {
    if (!userId) return;
    setBusy('name');
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({ userId, display_name: nameDraft.trim() }),
      });
      setEditingName(false);
      addToast('Nom affiché mis à jour', 'success');
      await load();
    } catch (err) {
      addToast(
        (err as Error)?.message || 'Erreur lors de la mise à jour.',
        'error'
      );
    } finally {
      setBusy(null);
    }
  }, [userId, nameDraft, adminFetchJson, addToast, load]);

  // PATCH /api/admin/users/manage — resend_credentials.
  const resendCredentials = useCallback(async () => {
    if (!userId || !data?.user.email) return;
    const ok = await confirm({
      title: 'Réinitialiser le mot de passe ?',
      subtitle: `Un nouveau mot de passe sera généré et envoyé à ${data.user.email}.`,
      variant: 'warning',
      confirmLabel: 'Envoyer',
    });
    if (!ok) return;
    setBusy('resend');
    try {
      const json = await adminFetchJson<{ warning?: string }>(
        '/api/admin/users/manage',
        {
          method: 'PATCH',
          body: JSON.stringify({ userId, action: 'resend_credentials' }),
        }
      );
      if (json.warning) addToast(json.warning, 'warning');
      else addToast(`Identifiants envoyés à ${data.user.email}`, 'success');
    } catch (err) {
      addToast((err as Error)?.message || "Erreur lors de l'envoi.", 'error');
    } finally {
      setBusy(null);
    }
  }, [userId, data?.user.email, confirm, adminFetchJson, addToast]);

  // PATCH /api/admin/users/manage — role.
  const changeRole = useCallback(
    async (role: string) => {
      if (!userId || !data) return;
      const previousRole = data.user.role ?? null;
      if (previousRole === role) return;

      if (isTargetProtected(previousRole) && staff.role !== 'owner') {
        addToast(
          'Seul un owner peut modifier un compte owner ou admin.',
          'error'
        );
        return;
      }
      if (!canGrantRole(staff.role, role)) {
        addToast(
          'Vous ne pouvez pas octroyer un rôle égal ou supérieur au vôtre.',
          'error'
        );
        return;
      }

      const ok = await confirm({
        title: `Changer le rôle vers « ${roleLabel(role)} » ?`,
        subtitle: `Cet utilisateur passera de « ${roleLabel(previousRole)} » à « ${roleLabel(role)} ». Action à privilège.`,
        variant: 'warning',
        confirmLabel: 'Changer le rôle',
      });
      if (!ok) return;

      setBusy('role');
      try {
        await adminFetchJson('/api/admin/users/manage', {
          method: 'PATCH',
          body: JSON.stringify({ userId, role }),
        });
        addToast('Rôle mis à jour', 'success');
        await load();
      } catch (err) {
        addToast(
          (err as Error)?.message || 'Erreur lors de la mise à jour du rôle.',
          'error'
        );
      } finally {
        setBusy(null);
      }
    },
    [userId, data, staff.role, confirm, adminFetchJson, addToast, load]
  );

  // PATCH /api/admin/users/manage — battle_tag (scoped to the player's team).
  const saveBattleTag = useCallback(async () => {
    if (!userId || !data?.team) return;
    setBusy('tag');
    setTagError(null);
    try {
      await adminFetchJson('/api/admin/users/manage', {
        method: 'PATCH',
        body: JSON.stringify({
          userId,
          teamId: data.team.id,
          battleTag: tagDraft.trim(),
        }),
      });
      setEditingTag(false);
      addToast('BattleTag mis à jour', 'success');
      await load();
    } catch (err) {
      setTagError((err as Error)?.message || 'Erreur inattendue');
    } finally {
      setBusy(null);
    }
  }, [userId, data?.team, tagDraft, adminFetchJson, addToast, load]);

  // POST /api/admin/users/[userId]/actions — assign_captain.
  const assignCaptain = useCallback(async () => {
    if (!userId || !data?.team) return;
    const ok = await confirm({
      title: 'Désigner ce joueur capitaine ?',
      subtitle: `${headerName} deviendra capitaine de « ${data.team.name} ».`,
      variant: 'warning',
      confirmLabel: 'Désigner capitaine',
    });
    if (!ok) return;
    setBusy('captain');
    try {
      await adminFetchJson(
        `/api/admin/users/${encodeURIComponent(userId)}/actions`,
        {
          method: 'POST',
          body: JSON.stringify({ action: 'assign_captain' }),
        }
      );
      addToast('Capitanat transféré', 'success');
      await load();
    } catch (err) {
      addToast(
        (err as Error)?.message || 'Erreur lors de la désignation.',
        'error'
      );
    } finally {
      setBusy(null);
    }
  }, [userId, data?.team, headerName, confirm, adminFetchJson, addToast, load]);

  // Open the transfer modal — lazy-load the teams list (GET /api/admin/teams).
  const openTransfer = useCallback(async () => {
    setTransferOpen(true);
    setTransferTeamId('');
    setTeamsLoading(true);
    try {
      const json = await adminFetchJson<{ teams: TeamLite[] }>(
        '/api/admin/teams?limit=500'
      );
      const list = (json.teams || [])
        .filter((t) => t.id !== data?.team?.id)
        .map((t) => ({ id: t.id, name: t.name }));
      setTeamOptions(list);
    } catch (err) {
      addToast(
        (err as Error)?.message || 'Erreur lors du chargement des équipes.',
        'error'
      );
    } finally {
      setTeamsLoading(false);
    }
  }, [adminFetchJson, addToast, data?.team?.id]);

  // POST /api/admin/users/[userId]/actions — transfer_team.
  const transferTeam = useCallback(async () => {
    if (!userId || !transferTeamId) return;
    const target = teamOptions.find((t) => t.id === transferTeamId);
    const ok = await confirm({
      title: 'Transférer ce joueur ?',
      subtitle: `${headerName} sera déplacé vers « ${target?.name ?? 'cette équipe'} ».`,
      variant: 'warning',
      confirmLabel: 'Transférer',
    });
    if (!ok) return;
    setBusy('transfer');
    try {
      await adminFetchJson(
        `/api/admin/users/${encodeURIComponent(userId)}/actions`,
        {
          method: 'POST',
          body: JSON.stringify({
            action: 'transfer_team',
            teamId: transferTeamId,
          }),
        }
      );
      setTransferOpen(false);
      addToast('Joueur transféré', 'success');
      await load();
    } catch (err) {
      addToast((err as Error)?.message || 'Erreur lors du transfert.', 'error');
    } finally {
      setBusy(null);
    }
  }, [
    userId,
    transferTeamId,
    teamOptions,
    headerName,
    confirm,
    adminFetchJson,
    addToast,
    load,
  ]);

  // POST /api/admin/demandes — approve / reject a pending demande.
  const processDemande = useCallback(
    async (demandeId: string, newStatus: 'approved' | 'rejected') => {
      const verb = newStatus === 'approved' ? 'Approuver' : 'Refuser';
      const ok = await confirm({
        title: `${verb} cette demande ?`,
        variant: newStatus === 'approved' ? 'info' : 'warning',
        confirmLabel: verb,
      });
      if (!ok) return;
      setBusy(`demande-${demandeId}`);
      try {
        await adminFetchJson('/api/admin/demandes', {
          method: 'POST',
          body: JSON.stringify({
            action: 'updateStatus',
            demandeIds: [demandeId],
            newStatus,
          }),
        });
        addToast(
          newStatus === 'approved' ? 'Demande approuvée' : 'Demande refusée',
          'success'
        );
        await load();
      } catch (err) {
        addToast(
          (err as Error)?.message || 'Erreur lors du traitement.',
          'error'
        );
      } finally {
        setBusy(null);
      }
    },
    [confirm, adminFetchJson, addToast, load]
  );

  const { upcoming, past } = useMemo(() => {
    const matches = data?.matches ?? [];
    return {
      upcoming: matches
        .filter(isUpcoming)
        .sort((a, b) => scheduledTime(a) - scheduledTime(b)),
      past: matches
        .filter((m) => !isUpcoming(m))
        .sort((a, b) => scheduledTime(b) - scheduledTime(a)),
    };
  }, [data]);

  return (
    <>
      {confirmDialog}
      <Head>
        <title>Vue player – {headerName}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Back link */}
          <Link
            href="/admin/users/manage"
            className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors mb-4"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Retour à la gestion des inscrits
          </Link>

          {/* Admin command-center banner */}
          <div
            role="status"
            className="mb-8 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 px-5 py-4"
          >
            <div className="flex items-start gap-3">
              <svg
                className="w-6 h-6 text-emerald-300 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <h1 className="text-lg md:text-xl font-bold text-emerald-100">
                  Espace joueur de {headerName}
                </h1>
                <p className="text-sm text-emerald-100/80 mt-1">
                  Outil d&apos;administration : les actions effectuées ici
                  (profil, équipe, demandes) sont appliquées au compte du joueur
                  et <strong>tracées</strong> dans les logs staff. Il ne
                  s&apos;agit pas d&apos;une usurpation — vous agissez en tant
                  que staff.
                </p>
              </div>
            </div>
          </div>

          {/* States */}
          {loading ? (
            <div className="space-y-4">
              <div className="h-12 rounded-xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
              <div className="h-40 rounded-2xl bg-neutral-800/60 animate-pulse" />
            </div>
          ) : notFound ? (
            <EmptyState>
              <p className="text-lg font-semibold text-white">
                Utilisateur introuvable
              </p>
              <p className="mt-2 text-sm">
                Ce compte n&apos;existe pas ou a été supprimé.
              </p>
            </EmptyState>
          ) : error ? (
            <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-5 py-4 text-sm text-red-100">
              {error}
            </div>
          ) : data ? (
            <>
              {/* Tabs */}
              <div
                role="tablist"
                aria-label="Sections de l'espace joueur"
                className="flex flex-wrap gap-2 mb-6 border-b border-neutral-700/50 pb-3"
              >
                {TABS.map((t) => {
                  const active = tab === t.key;
                  const badge =
                    t.key === 'notifications' && data.notifications.total > 0
                      ? data.notifications.total
                      : null;
                  return (
                    <button
                      key={t.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setTab(t.key)}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors flex items-center gap-2 ${
                        active
                          ? 'bg-emerald-600 text-white'
                          : 'bg-neutral-800/60 text-neutral-300 hover:bg-neutral-700/60'
                      }`}
                    >
                      {t.label}
                      {badge !== null && (
                        <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full bg-amber-500 text-[10px] font-bold text-neutral-900">
                          {badge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Profil */}
              {tab === 'profil' && (
                <section
                  role="tabpanel"
                  className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6"
                >
                  <div className="flex items-center gap-4">
                    {data.user.avatarUrl ? (
                      <Image
                        src={data.user.avatarUrl}
                        alt=""
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-2xl object-cover border border-neutral-700"
                        unoptimized
                      />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-xl font-bold text-emerald-200">
                        {initials(data.user.displayName, data.user.email)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-white truncate">
                        {data.user.displayName || 'Sans nom'}
                      </h2>
                      {data.user.battleTag && (
                        <p className="text-sm text-emerald-300 font-mono">
                          {data.user.battleTag}
                        </p>
                      )}
                    </div>
                  </div>

                  <dl className="mt-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Email
                      </dt>
                      <dd className="text-sm text-white break-all">
                        {data.user.email || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Rôle
                      </dt>
                      <dd className="text-sm text-white">
                        {data.user.role || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        BattleTag
                      </dt>
                      <dd className="text-sm text-white font-mono">
                        {data.user.battleTag || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Inscrit le
                      </dt>
                      <dd className="text-sm text-white">
                        {formatDate(data.user.createdAt)}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-neutral-500">
                        Identifiant
                      </dt>
                      <dd className="text-xs text-neutral-400 font-mono break-all">
                        {data.user.id}
                      </dd>
                    </div>
                  </dl>

                  {/* Profil actions */}
                  <div className="mt-6 pt-6 border-t border-neutral-700/50">
                    <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                      Actions
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setNameDraft(data.user.displayName || '');
                          setEditingName(true);
                        }}
                        className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                      >
                        Modifier le nom affiché
                      </button>

                      <button
                        type="button"
                        onClick={resendCredentials}
                        disabled={!data.user.email || busy === 'resend'}
                        className="px-3 py-2 rounded-xl bg-amber-600/80 hover:bg-amber-600 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {busy === 'resend'
                          ? 'Envoi…'
                          : 'Renvoyer les identifiants'}
                      </button>
                    </div>

                    {/* Role change — admin+ only, mirrors manage.tsx guards */}
                    {isAdmin && (
                      <div className="mt-4">
                        <label className="block text-xs uppercase tracking-wide text-neutral-500 mb-1">
                          Rôle
                        </label>
                        {(() => {
                          const targetLocked =
                            isTargetProtected(data.user.role) &&
                            staff.role !== 'owner';
                          return (
                            <select
                              aria-label="Rôle de l'utilisateur"
                              value={(data.user.role || 'member').toLowerCase()}
                              onChange={(e) => changeRole(e.target.value)}
                              disabled={busy === 'role' || targetLocked}
                              title={
                                targetLocked
                                  ? 'Seul un owner peut modifier un compte owner ou admin.'
                                  : undefined
                              }
                              className="px-3 py-2 rounded-xl bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {ROLE_OPTIONS.map((r) => {
                                const grantable =
                                  r ===
                                    (
                                      data.user.role || 'member'
                                    ).toLowerCase() ||
                                  canGrantRole(staff.role, r);
                                return (
                                  <option
                                    key={r}
                                    value={r}
                                    disabled={!grantable}
                                  >
                                    {roleLabel(r)}
                                  </option>
                                );
                              })}
                            </select>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Équipe */}
              {tab === 'equipe' && (
                <section role="tabpanel">
                  {!data.team ? (
                    <EmptyState>
                      <p className="text-lg font-semibold text-white">
                        Aucune équipe
                      </p>
                      <p className="mt-2 text-sm">
                        Cet utilisateur n&apos;appartient à aucune équipe.
                      </p>
                    </EmptyState>
                  ) : (
                    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 p-6">
                      <div className="flex items-center gap-4">
                        {data.team.logoUrl ? (
                          <Image
                            src={data.team.logoUrl}
                            alt=""
                            width={56}
                            height={56}
                            className="w-14 h-14 rounded-xl object-cover border border-neutral-700"
                            unoptimized
                          />
                        ) : (
                          <div className="w-14 h-14 rounded-xl bg-neutral-700/50 border border-neutral-700 flex items-center justify-center text-neutral-300 font-bold">
                            {initials(data.team.name, null)}
                          </div>
                        )}
                        <div>
                          <h2 className="text-xl font-bold text-white">
                            {data.team.name}
                          </h2>
                          <div className="mt-1 flex items-center gap-2">
                            {data.team.role && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-600/20 text-emerald-200 border border-emerald-500/30">
                                {data.team.role === 'captain'
                                  ? 'Capitaine'
                                  : 'Membre'}
                              </span>
                            )}
                            {data.team.isSubstitute && (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-200 border border-amber-500/30">
                                Remplaçant·e
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <h3 className="text-sm font-semibold text-neutral-300 mb-3">
                          Roster ({data.team.members.length})
                        </h3>
                        {data.team.members.length === 0 ? (
                          <p className="text-sm text-neutral-500">
                            Aucun membre.
                          </p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-neutral-700/50">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs uppercase tracking-wide text-neutral-500 border-b border-neutral-700/50">
                                  <th className="px-4 py-2 font-medium">
                                    Nom affiché
                                  </th>
                                  <th className="px-4 py-2 font-medium">
                                    BattleTag
                                  </th>
                                  <th className="px-4 py-2 font-medium">
                                    Rôle
                                  </th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-neutral-700/40">
                                {data.team.members.map((m) => (
                                  <tr key={m.id}>
                                    <td className="px-4 py-2.5 text-white">
                                      {m.displayName || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 font-mono text-emerald-300">
                                      {m.battleTag || '—'}
                                    </td>
                                    <td className="px-4 py-2.5 text-neutral-300">
                                      {m.role || 'Membre'}
                                      {m.isSubstitute && (
                                        <span className="ml-2 text-xs text-amber-300">
                                          (remplaçant·e)
                                        </span>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      {/* Équipe actions */}
                      <div className="mt-6 pt-6 border-t border-neutral-700/50">
                        <h3 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                          Actions
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setTagDraft(data.user.battleTag || '');
                              setTagError(null);
                              setEditingTag(true);
                            }}
                            className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
                          >
                            Modifier le BattleTag
                          </button>

                          {data.team.role !== 'captain' && (
                            <button
                              type="button"
                              onClick={assignCaptain}
                              disabled={busy === 'captain'}
                              className="px-3 py-2 rounded-xl bg-emerald-700/80 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {busy === 'captain'
                                ? 'Désignation…'
                                : 'Désigner capitaine'}
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={openTransfer}
                            className="px-3 py-2 rounded-xl bg-blue-700/80 hover:bg-blue-700 text-sm font-medium transition-colors"
                          >
                            Transférer vers une autre équipe
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* Mes matchs */}
              {tab === 'matchs' && (
                <section role="tabpanel" className="space-y-10">
                  {upcoming.length === 0 && past.length === 0 ? (
                    <EmptyState>
                      <p className="text-lg font-semibold text-white">
                        Aucun match
                      </p>
                      <p className="mt-2 text-sm">
                        Aucun match programmé ou joué pour cet utilisateur.
                      </p>
                    </EmptyState>
                  ) : (
                    <>
                      <div>
                        <h2 className="text-lg font-semibold mb-4 text-white">
                          À venir
                          <span className="ml-2 text-sm font-normal text-neutral-500">
                            ({upcoming.length})
                          </span>
                        </h2>
                        {upcoming.length === 0 ? (
                          <EmptyState>Aucun match à venir.</EmptyState>
                        ) : (
                          <div className="space-y-4">
                            {upcoming.map((m) => (
                              <MatchRow key={m.id} match={m} />
                            ))}
                          </div>
                        )}
                      </div>

                      <div>
                        <h2 className="text-lg font-semibold mb-4 text-white">
                          Résultats
                          <span className="ml-2 text-sm font-normal text-neutral-500">
                            ({past.length})
                          </span>
                        </h2>
                        {past.length === 0 ? (
                          <EmptyState>Aucun résultat.</EmptyState>
                        ) : (
                          <div className="space-y-4">
                            {past.map((m) => (
                              <MatchRow key={m.id} match={m} />
                            ))}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* Notifications */}
              {tab === 'notifications' && (
                <section
                  role="tabpanel"
                  className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
                >
                  <StatTile
                    label="Messages non lus"
                    value={data.notifications.unreadMessages}
                    highlight
                  />
                  <StatTile
                    label="Scrims en attente"
                    value={data.notifications.pendingScrims}
                    highlight
                  />
                  <StatTile
                    label="Demandes de join"
                    value={data.notifications.pendingJoinRequests}
                    highlight
                  />
                  <StatTile
                    label="Check-in en attente"
                    value={data.notifications.checkinPending}
                    highlight
                  />
                  <StatTile label="Total" value={data.notifications.total} />
                </section>
              )}

              {/* Demandes */}
              {tab === 'demandes' && (
                <section role="tabpanel">
                  {data.demandes.length === 0 ? (
                    <EmptyState>
                      <p className="text-lg font-semibold text-white">
                        Aucune demande
                      </p>
                      <p className="mt-2 text-sm">
                        Cet utilisateur n&apos;a soumis aucune demande.
                      </p>
                    </EmptyState>
                  ) : (
                    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/40 divide-y divide-neutral-700/40">
                      {data.demandes.map((d: Demande) => {
                        const teamName = d.team?.name || null;
                        return (
                          <div key={d.id} className="p-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                              <div className="min-w-0">
                                <span className="font-medium text-white">
                                  {DEMANDE_TYPE_LABELS[d.type] || d.type}
                                </span>
                                {teamName && (
                                  <span className="text-neutral-400 ml-2">
                                    ({teamName})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-semibold ${
                                    DEMANDE_STATUS_STYLES[d.status] ||
                                    'bg-neutral-500/20 text-neutral-300 border border-neutral-500/30'
                                  }`}
                                >
                                  {DEMANDE_STATUS_LABELS[d.status] || d.status}
                                </span>
                                <span className="text-xs text-neutral-500">
                                  {formatDate(d.created_at)}
                                </span>
                              </div>
                            </div>
                            {d.comment && (
                              <p className="mt-1.5 text-xs text-neutral-400 italic">
                                &ldquo;{d.comment}&rdquo;
                              </p>
                            )}
                            {d.status === 'pending' && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    processDemande(d.id, 'approved')
                                  }
                                  disabled={busy === `demande-${d.id}`}
                                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Approuver
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    processDemande(d.id, 'rejected')
                                  }
                                  disabled={busy === `demande-${d.id}`}
                                  className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Refuser
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              )}
            </>
          ) : null}
        </div>
      </div>

      {/* Edit display name modal */}
      <Modal
        open={editingName}
        onClose={() => setEditingName(false)}
        title="Modifier le nom affiché"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingName(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={saveName}
              disabled={busy === 'name'}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'name' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>
        }
      >
        <label className="block text-sm text-neutral-400 mb-1">
          Nom affiché
        </label>
        <input
          type="text"
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          placeholder="Nom affiché"
        />
      </Modal>

      {/* Edit battle tag modal */}
      <Modal
        open={editingTag}
        onClose={() => setEditingTag(false)}
        title="Modifier le BattleTag"
        footer={
          <>
            <button
              type="button"
              onClick={() => setEditingTag(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={saveBattleTag}
              disabled={busy === 'tag'}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'tag' ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </>
        }
      >
        <label className="block text-sm text-neutral-400 mb-1">BattleTag</label>
        <input
          type="text"
          value={tagDraft}
          onChange={(e) => setTagDraft(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          placeholder="Pseudo#1234"
        />
        <p className="text-xs text-neutral-500 mt-1">
          Format : Pseudo#0000 (alphanumérique + # + 3 à 6 chiffres)
        </p>
        {tagError && (
          <div className="mt-3 rounded-lg bg-red-900/40 border border-red-500/50 px-3 py-2 text-sm text-red-200">
            {tagError}
          </div>
        )}
      </Modal>

      {/* Transfer team modal */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transférer vers une autre équipe"
        footer={
          <>
            <button
              type="button"
              onClick={() => setTransferOpen(false)}
              className="px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={transferTeam}
              disabled={busy === 'transfer' || !transferTeamId}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {busy === 'transfer' ? 'Transfert…' : 'Transférer'}
            </button>
          </>
        }
      >
        <label className="block text-sm text-neutral-400 mb-1">
          Équipe de destination
        </label>
        {teamsLoading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-400 py-2">
            <div className="w-4 h-4 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            Chargement des équipes…
          </div>
        ) : teamOptions.length === 0 ? (
          <p className="text-sm text-neutral-500 py-2">
            Aucune autre équipe disponible.
          </p>
        ) : (
          <select
            aria-label="Équipe de destination"
            value={transferTeamId}
            onChange={(e) => setTransferTeamId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
          >
            <option value="">Sélectionner une équipe…</option>
            {teamOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
      </Modal>
    </>
  );
}

export default PlayerViewPage;
