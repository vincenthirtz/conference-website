// components/player/screens/PlayerManageTeamScreen.tsx
//
// Corps de « Gérer mon équipe » — extrait de pages/player/manage-team.tsx
// (S3 de docs/PLAN-espace-unifie.md).
//
// En inspection admin (`readOnly`), l'écran reste la source de vérité de ce que
// voit la capitaine — roster, invitations en attente, demandes de rejoindre —
// mais tout ce qui agit disparaît : toggles recrutement/scrims, formulaire
// d'invitation, changement de rôle ou de spécialité, promotion, exclusion,
// acceptation/refus des demandes, section joueuses libres.

import { useEffect, useState, useCallback, useRef, Fragment } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { PlayerPageSkeleton } from '@/components/player/Skeletons';
import CopyButton from '@/components/player/CopyButton';
import FreePlayersSection from '@/components/player/FreePlayersSection';
import BattlenetVerifyCard from '@/components/player/BattlenetVerifyCard';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import ActiveTeamSwitcher from '@/components/player/ActiveTeamSwitcher';
import Switch from '@/components/ui/Switch';
import { isNonPlayingTeamRole, splitTeamMembers } from '@/utils/teams/roleKind';
import nsManageTeam from '@/lib/i18n/locales/fr/manageTeam';

type Specialty = 'tank' | 'dps' | 'support' | 'flex' | null;

type Member = {
  id: string;
  user_id: string | null;
  role: string | null;
  /**
   * Pseudo affichable. L'encadrement (coach / manager) n'a pas d'obligation de
   * BattleTag : sans ce champ la ligne s'affichait « Inconnu ».
   */
  display_name?: string | null;
  battle_tag: string | null;
  is_substitute: boolean;
  is_captain?: boolean;
  specialty?: Specialty;
  // Exposé par l'API manage-team seulement une fois que la vérification
  // Battle.net est câblée côté back (cf. TODO API). Tant que la clé est
  // absente, le badge ne s'affiche pas ; `null` = non vérifié, string = vérifié.
  battle_tag_verified_at?: string | null;
};

type TeamInfo = {
  id: string;
  slug?: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country: string | null;
  description: string | null;
  is_joinable?: boolean;
  open_for_scrim?: boolean;
};

type JoinRequest = {
  id: string;
  user_id: string;
  status: string;
  comment: string | null;
  payload: {
    user_display_name?: string;
    user_battle_tag?: string;
    desired_role?: string;
  } | null;
  created_at: string;
  user: {
    id: string;
    email: string | null;
    display_name: string | null;
    battle_tag: string | null;
  } | null;
};

export default function PlayerManageTeamScreen() {
  const t = useT(nsManageTeam);
  const locale = useLocale();
  const router = useRouter();
  // `readOnly` = inspection staff : l'écran devient une photo fidèle, sans
  // aucun levier. Le roster et les demandes viennent du sujet via `?as=`.
  const { withSubject, readOnly, isInspecting } = usePlayerArea();
  // Équipe sur laquelle l'écran agit — pertinent seulement pour un manager
  // multi-équipes ; `withTeam` est l'identité dans tous les autres cas.
  const { withTeam } = useActiveTeam();

  // Onboarding post-création : le magic-link « accès espace équipe » atterrit ici
  // avec ?welcome=1. C'est le seul moment du parcours où la capitaine vient de
  // créer son compte ET est déjà connectée — donc le meilleur endroit pour
  // proposer la vérification Battle.net (le profil suppose qu'elle aille la
  // chercher). Refermable, et masquée d'office si elle est déjà vérifiée.
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const showWelcome =
    !isInspecting && router.query.welcome === '1' && !welcomeDismissed;
  const { loading: authLoading, ready } = usePlayerSession();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const {
    data: managedTeam,
    loading: teamLoading,
    error: teamError,
    reload: reloadTeam,
  } = useManagedTeam();
  const { confirm, dialog } = useConfirmDialog();
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(false);

  // Identité affichée d'un membre. Les joueuses sont identifiées par leur
  // BattleTag ; l'encadrement (coach / manager) n'en a pas l'obligation, donc
  // on retombe sur le pseudo avant « Inconnu ».
  const memberLabel = useCallback(
    (m: Pick<Member, 'battle_tag' | 'display_name' | 'role'>): string =>
      (isNonPlayingTeamRole(m.role)
        ? m.display_name || m.battle_tag
        : m.battle_tag || m.display_name) || t.unknown,
    [t]
  );

  // Map a raw member/desired role to a localized label.
  const roleLabel = useCallback(
    (role: string | null | undefined): string => {
      switch (role) {
        case 'substitute':
          return t.optionSubstitute;
        case 'coach':
          return t.optionCoach;
        case 'manager':
          return t.roleManager;
        default:
          return t.optionPlayer;
      }
    },
    [t]
  );

  // Team / roster / role flags are sourced from the shared useManagedTeam
  // cache. We mirror them into local state so the existing optimistic updates
  // (remove member, role change) keep working without an extra round-trip.
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invitation par email / lien privé (capitaine ↔ manager).
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<
    'player' | 'substitute' | 'coach' | 'manager' | 'captain'
  >('player');
  const [inviteResult, setInviteResult] = useState<{
    invite_url: string;
    email_sent: boolean;
  } | null>(null);

  const loading = authLoading || teamLoading || requestsLoading;

  // Une équipe créée « en tant que manager » naît sans capitaine : la capitaine
  // désignée doit d'abord accepter son invitation (ou être désignée ici).
  const hasCaptain = members.some((m) => m.is_captain);

  // Joueuses d'abord, encadrement (coach / manager) ensuite sous son intitulé.
  const { roster, subs, staff } = splitTeamMembers(members);
  const orderedMembers = [...roster, ...subs, ...staff];
  const firstStaffIndex = staff.length ? roster.length + subs.length : -1;
  const playingCount = roster.length + subs.length;

  // Sync local mirror whenever the shared team payload changes.
  useEffect(() => {
    if (!managedTeam) return;
    setTeam((managedTeam.team as TeamInfo) || null);
    setMembers((managedTeam.members as Member[]) || []);
    setIsCaptain(managedTeam.isCaptain);
    setIsManager(managedTeam.isManager);
  }, [managedTeam]);

  const loadJoinRequests = useCallback(async () => {
    // Let failures propagate so the effect can surface a real error state
    // (distinct from the "no pending requests" empty state).
    const requestsData = await adminFetchJson<{ demandes?: JoinRequest[] }>(
      withTeam(withSubject('/api/teams/join-requests'))
    );
    setJoinRequests(requestsData.demandes || []);
  }, [adminFetchJson, withSubject, withTeam]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setRequestsLoading(true);
    setRequestsError(false);
    loadJoinRequests()
      .catch(() => {
        if (!cancelled) setRequestsError(true);
      })
      .finally(() => {
        if (!cancelled) setRequestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, loadJoinRequests]);

  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3000);
  };

  useEffect(() => {
    return () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, []);

  // ── Invitation par email + lien privé ────────────────────────────────────
  // La capitaine peut confier un rôle de gestion (manager) ; le manager peut, à
  // l'inverse, désigner la capitaine tant que l'équipe n'en a pas. Le serveur
  // ré-applique ces deux règles (anti-escalade / capitanat déjà pris).
  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setActionLoading('invite');
    setError(null);
    setInviteResult(null);
    try {
      const asCaptain = inviteRole === 'captain';
      const data = await adminFetchJson<{
        invite_url: string;
        email_sent: boolean;
      }>(withTeam('/api/teams/invitations'), {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          role: asCaptain ? 'player' : inviteRole,
          set_captain: asCaptain,
        }),
      });
      setInviteResult(data);
      setInviteEmail('');
      showSuccess(data.email_sent ? t.inviteSentEmail : t.inviteCreated);
    } catch (err: unknown) {
      setError((err as Error).message || t.inviteError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleJoinable = async () => {
    setActionLoading('joinable');
    setError(null);
    try {
      const data = await adminFetchJson<{ is_joinable: boolean }>(
        withTeam('/api/teams/toggle-joinable'),
        {
          method: 'POST',
          body: JSON.stringify({ joinable: !team?.is_joinable }),
        }
      );
      setTeam((prev) =>
        prev ? { ...prev, is_joinable: data.is_joinable } : prev
      );
      void reloadTeam();
      showSuccess(data.is_joinable ? t.recruitmentOpen : t.recruitmentClosed);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleScrimOpen = async () => {
    setActionLoading('scrim-open');
    setError(null);
    try {
      const data = await adminFetchJson<{ open_for_scrim: boolean }>(
        withTeam('/api/teams/toggle-scrim-open'),
        {
          method: 'POST',
          body: JSON.stringify({ open: !team?.open_for_scrim }),
        }
      );
      setTeam((prev) =>
        prev ? { ...prev, open_for_scrim: data.open_for_scrim } : prev
      );
      void reloadTeam();
      showSuccess(data.open_for_scrim ? t.scrimOpenOn : t.scrimOpenOff);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!team) return;
    setActionLoading(`remove-${memberId}`);
    setError(null);
    try {
      await adminFetchJson(`/api/teams/${team.id}/members`, {
        method: 'DELETE',
        body: JSON.stringify({ memberId }),
      });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setPendingRemoval(null);
      // Keep the shared cache in sync for other player pages (silent).
      void reloadTeam();
      showSuccess(t.memberRemoved);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handleUpdateRole = async (memberId: string, role: string) => {
    setActionLoading(`role-${memberId}`);
    setError(null);
    try {
      const data = await adminFetchJson<{
        newRole: string | null;
        isSubstitute: boolean;
      }>(withTeam('/api/teams/update-member-role'), {
        method: 'PATCH',
        body: JSON.stringify({ memberId, role }),
      });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, role: data.newRole, is_substitute: data.isSubstitute }
            : m
        )
      );
      void reloadTeam();
      showSuccess(t.roleUpdated);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePromoteCaptain = async (member: Member) => {
    if (!member.user_id) return;
    setActionLoading(`promote-${member.id}`);
    setError(null);
    try {
      await adminFetchJson(withTeam('/api/teams/transfer-captain'), {
        method: 'PATCH',
        body: JSON.stringify({ newCaptainUserId: member.user_id }),
      });
      await reloadTeam();
      showSuccess(format(t.promoteSuccess, { name: memberLabel(member) }));
    } catch (err: unknown) {
      setError((err as Error).message || t.promoteError);
    } finally {
      setActionLoading(null);
    }
  };

  const confirmPromote = async (member: Member) => {
    if (!member.user_id) return;
    const ok = await confirm({
      // Sans capitaine en poste, il ne s'agit pas d'un transfert mais d'une
      // désignation (cas du manager qui amorce le capitanat).
      title: format(hasCaptain ? t.promoteConfirm : t.designateConfirm, {
        name: memberLabel(member),
      }),
      subtitle: hasCaptain
        ? t.promoteDialogSubtitle
        : t.designateDialogSubtitle,
      variant: 'warning',
      confirmLabel: t.promoteConfirmYes,
      cancelLabel: t.promoteCancel,
    });
    if (!ok) return;
    await handlePromoteCaptain(member);
  };

  const handleUpdateSpecialty = async (memberId: string, value: string) => {
    const specialty: Specialty = value
      ? (value as Exclude<Specialty, null>)
      : null;
    setActionLoading(`specialty-${memberId}`);
    setError(null);
    try {
      await adminFetchJson(withTeam('/api/teams/update-member-specialty'), {
        method: 'PATCH',
        body: JSON.stringify({ memberId, specialty }),
      });
      await reloadTeam();
      showSuccess(t.specialtyUpdated);
    } catch (err: unknown) {
      setError((err as Error).message || t.specialtyError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleJoinAction = async (
    demandeId: string,
    action: 'approve' | 'reject'
  ) => {
    setActionLoading(`join-${demandeId}`);
    setError(null);
    try {
      await adminFetchJson(withTeam('/api/teams/join-requests'), {
        method: 'POST',
        body: JSON.stringify({ demandeId, action }),
      });
      setJoinRequests((prev) => prev.filter((r) => r.id !== demandeId));
      if (action === 'approve') {
        await reloadTeam();
      }
      showSuccess(action === 'approve' ? t.playerAccepted : t.requestRejected);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || loading) {
    return <PlayerPageSkeleton rows={4} />;
  }

  // A network failure (team fetch OR join-requests fetch) must NOT masquerade
  // as "access denied" — offer a retry instead of ejecting the captain.
  if ((teamError && !team) || requestsError) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold mb-4">{t.errorTitle}</h1>
          <p className="text-gray-400 mb-6">{t.errorBody}</p>
          <button
            type="button"
            onClick={() => {
              setRequestsError(false);
              setRequestsLoading(true);
              void reloadTeam();
              loadJoinRequests()
                .catch(() => setRequestsError(true))
                .finally(() => setRequestsLoading(false));
            }}
            className="inline-block px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-semibold transition"
          >
            {t.retry}
          </button>
        </div>
      </div>
    );
  }

  if (!team || (!isCaptain && !isManager)) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white flex items-center justify-center px-4">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-4">{t.accessDeniedTitle}</h1>
          <p className="text-gray-400 mb-6">{t.accessDeniedBody}</p>
          <Link
            href="/player"
            className="inline-block px-6 py-3 rounded-xl bg-purple-600 hover:bg-purple-500 font-semibold transition"
          >
            {t.backToSpace}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      {dialog}
      <Head>
        <title>{format(t.tabTitle, { name: team.name })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-3xl mx-auto px-4 py-10 pt-24">
          <Link
            href="/player"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6"
          >
            &larr; {t.backToSpace}
          </Link>

          {showWelcome && (
            <BattlenetVerifyCard
              variant="onboarding"
              hideWhenVerified
              // On garde `welcome=1` dans le retour : sinon la carte n'est plus
              // montée au retour de Blizzard et le toast de confirmation (porté
              // par elle) ne partirait jamais.
              returnTo="/player/manage-team?welcome=1"
              onDismiss={() => setWelcomeDismissed(true)}
            />
          )}

          {/* Team header */}
          <div className="flex items-center gap-4 mb-8">
            {team.logo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={team.logo_url}
                alt={team.name}
                className="w-16 h-16 rounded-full object-cover border border-white/10"
              />
            )}
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{team.name}</h1>
              {team.short_name && (
                <div className="text-sm text-gray-400">{team.short_name}</div>
              )}
            </div>
            <Link
              href={`/team/${encodeURIComponent(team.slug || team.id)}`}
              className="text-sm text-purple-300 hover:text-purple-200"
            >
              {t.publicPage}
            </Link>
          </div>

          {/* Sélecteur d'équipe — rendu seulement si l'utilisateur en gère
              plusieurs (manager multi-équipes). Placé juste sous l'en-tête :
              tout ce qui suit porte sur l'équipe choisie. */}
          <ActiveTeamSwitcher className="mb-6" />

          {successMsg && (
            <div
              role="status"
              aria-live="polite"
              className="mb-6 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200"
            >
              {successMsg}
            </div>
          )}

          {error && (
            <div
              role="alert"
              aria-live="assertive"
              className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
            >
              {error}
            </div>
          )}

          {/* Recrutement toggle */}
          {!readOnly && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">{t.recruitment}</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {team.is_joinable
                      ? t.recruitmentOpenDesc
                      : t.recruitmentClosedDesc}
                  </p>
                </div>
                <Switch
                  checked={!!team.is_joinable}
                  onChange={handleToggleJoinable}
                  disabled={actionLoading === 'joinable'}
                  label={t.recruitment}
                  size="md"
                />
              </div>
            </div>
          )}

          {/* Scrims toggle */}
          {!readOnly && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{t.scrimOpenLabel}</h2>
                  <p className="text-sm text-gray-400 mt-1">
                    {t.scrimOpenHelp}
                  </p>
                </div>
                <Switch
                  checked={!!team.open_for_scrim}
                  onChange={handleToggleScrimOpen}
                  disabled={actionLoading === 'scrim-open'}
                  label={t.scrimOpenLabel}
                  size="md"
                />
              </div>
            </div>
          )}

          {/* Inviter par email / lien privé */}
          {!readOnly && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
              <h2 className="text-lg font-semibold">{t.inviteTitle}</h2>
              <p className="mt-1 text-sm text-gray-400">{t.inviteHelp}</p>

              <form
                onSubmit={handleInvite}
                className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
              >
                <div className="flex-1">
                  <label
                    htmlFor="invite-email"
                    className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2"
                  >
                    {t.inviteEmailLabel}
                  </label>
                  <input
                    id="invite-email"
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder={t.inviteEmailPlaceholder}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-400/70 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
                  />
                </div>
                <div className="sm:w-52">
                  <label
                    htmlFor="invite-role"
                    className="block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300 mb-2"
                  >
                    {t.inviteRoleLabel}
                  </label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={(e) =>
                      setInviteRole(e.target.value as typeof inviteRole)
                    }
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white focus:border-purple-400/70 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
                  >
                    <option value="player">{t.optionPlayer}</option>
                    <option value="substitute">{t.optionSubstitute}</option>
                    <option value="coach">{t.optionCoach}</option>
                    {/* Confier un rôle de gestion est réservé à la capitaine. */}
                    {isCaptain && (
                      <option value="manager">{t.roleManager}</option>
                    )}
                    {/* Le pendant : désigner la capitaine, seulement s'il n'y en a pas. */}
                    {!hasCaptain && (
                      <option value="captain">{t.captain}</option>
                    )}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={actionLoading === 'invite' || !inviteEmail.trim()}
                  className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500 disabled:opacity-50"
                >
                  {actionLoading === 'invite' ? t.invitePending : t.inviteCta}
                </button>
              </form>

              {inviteResult && (
                <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                  <p className="text-sm font-semibold text-emerald-100">
                    {inviteResult.email_sent
                      ? t.inviteSentEmail
                      : t.inviteEmailFailed}
                  </p>
                  <p className="mt-1 text-xs text-emerald-100/80">
                    {t.inviteLinkHint}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <code className="min-w-0 flex-1 break-all rounded-lg bg-black/50 px-3 py-2 text-[11px] text-gray-300">
                      {inviteResult.invite_url}
                    </code>
                    <CopyButton
                      value={inviteResult.invite_url}
                      label={t.inviteCopyLink}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Roster */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
            <h2 className="text-lg font-semibold mb-4">
              {/* « Roster » = joueuses : l'encadrement a son propre bloc et ne
                  compte pas dans l'effectif. */}
              {format(playingCount > 1 ? t.roster_other : t.roster_one, {
                count: playingCount,
              })}
            </h2>
            {/* Équipe créée par un manager : tant qu'aucune joueuse n'a accepté
                et pris le capitanat, on rappelle au manager qu'il peut désigner
                la capitaine (bouton « Promouvoir » sur chaque membre). */}
            {!hasCaptain && (
              <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                <p className="text-sm font-semibold text-amber-100">
                  {t.noCaptainTitle}
                </p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {members.length > 1 ? t.noCaptainBody : t.noCaptainBodyEmpty}
                </p>
              </div>
            )}
            {members.filter((m) => !m.is_captain).length === 0 ? (
              <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-5 text-center">
                <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-purple-500/20 flex items-center justify-center">
                  <svg
                    className="w-6 h-6 text-purple-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                    />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-purple-100 mb-1">
                  {t.onboardingTitle}
                </p>
                <p className="text-xs text-purple-200/80 mb-4">
                  {t.onboardingBody}
                </p>
                <Link
                  href={`/team/${encodeURIComponent(team.slug || team.id)}`}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-sm font-semibold transition"
                >
                  {t.onboardingCta}
                </Link>
              </div>
            ) : null}
            <div className="space-y-3">
              {orderedMembers.map((m, idx) => (
                <Fragment key={m.id}>
                  {/* Encadrement en fin de liste, sous son propre intitulé :
                      coach et manager ne sont pas des joueuses. */}
                  {idx === firstStaffIndex && (
                    <h3 className="pt-2 text-xs font-semibold uppercase tracking-wide text-sky-300/80">
                      {format(t.staffTitle, {
                        count: orderedMembers.length - firstStaffIndex,
                      })}
                    </h3>
                  )}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-black/60 border border-white/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs text-gray-500">
                          {memberLabel(m).slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate">
                            {memberLabel(m)}
                          </span>
                          {m.battle_tag && (
                            <CopyButton
                              value={m.battle_tag}
                              label={t.copyBattleTag}
                              className="h-5 w-5 shrink-0"
                            />
                          )}
                          {/* Badge de vérification Battle.net. Rendu uniquement
                            quand l'API expose battle_tag_verified_at par membre
                            (TODO API : l'ajouter au SELECT de /api/admin/teams/my). */}
                          {'battle_tag_verified_at' in m &&
                            (m.battle_tag_verified_at ? (
                              <span
                                title={t.verifiedBadgeTitle}
                                className="shrink-0 inline-flex items-center gap-0.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
                              >
                                <span aria-hidden="true">✓</span>
                                {t.verifiedBadge}
                              </span>
                            ) : (
                              <span
                                title={t.unverifiedBadgeTitle}
                                className="shrink-0 inline-flex items-center rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold text-gray-400"
                              >
                                {t.unverifiedBadge}
                              </span>
                            ))}
                        </div>
                        <div className="text-xs text-gray-500">
                          {m.is_captain ? (
                            <span className="text-purple-300">{t.captain}</span>
                          ) : (
                            roleLabel(m.role)
                          )}
                        </div>
                      </div>
                    </div>

                    {!m.is_captain && !readOnly && (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {pendingRemoval === m.id ? (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            <span className="text-xs text-red-200 basis-full sm:basis-auto">
                              {format(t.removeConfirm, {
                                name: memberLabel(m),
                              })}
                              <span className="block text-[11px] text-red-300/80 mt-0.5">
                                {t.removeConsequences}
                              </span>
                            </span>
                            <button
                              onClick={() => handleRemoveMember(m.id)}
                              disabled={actionLoading === `remove-${m.id}`}
                              className="px-2 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold transition disabled:opacity-50"
                            >
                              {t.confirmRemove}
                            </button>
                            <button
                              onClick={() => setPendingRemoval(null)}
                              disabled={actionLoading === `remove-${m.id}`}
                              className="px-2 py-1 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-xs transition disabled:opacity-50"
                            >
                              {t.cancelRemove}
                            </button>
                          </div>
                        ) : (
                          <>
                            <select
                              value={m.specialty || ''}
                              onChange={(e) =>
                                handleUpdateSpecialty(m.id, e.target.value)
                              }
                              disabled={!!actionLoading}
                              aria-label={t.specialtyLabel}
                              title={t.specialtyLabel}
                              className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                            >
                              <option value="">{t.specialtyNone}</option>
                              <option value="tank">{t.specialtyTank}</option>
                              <option value="dps">{t.specialtyDps}</option>
                              <option value="support">
                                {t.specialtySupport}
                              </option>
                              <option value="flex">{t.specialtyFlex}</option>
                            </select>
                            <select
                              value={m.role || 'player'}
                              onChange={(e) =>
                                handleUpdateRole(m.id, e.target.value)
                              }
                              disabled={!!actionLoading}
                              aria-label={t.roleSelectLabel}
                              title={t.roleSelectLabel}
                              className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                            >
                              <option value="player">{t.optionPlayer}</option>
                              <option value="substitute">
                                {t.optionSubstitute}
                              </option>
                              <option value="coach">{t.optionCoach}</option>
                            </select>
                            <button
                              onClick={() => confirmPromote(m)}
                              disabled={!!actionLoading || !m.user_id}
                              className="px-2 py-1 rounded-lg border border-purple-500/30 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 text-xs font-semibold transition disabled:opacity-50"
                              title={hasCaptain ? t.promote : t.designate}
                              aria-label={hasCaptain ? t.promote : t.designate}
                            >
                              {hasCaptain ? t.promote : t.designate}
                            </button>
                            <button
                              onClick={() => setPendingRemoval(m.id)}
                              disabled={!!actionLoading}
                              className="p-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-400 transition disabled:opacity-50"
                              title={t.removeTitle}
                              aria-label={t.removeTitle}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M6 18L18 6M6 6l12 12"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </Fragment>
              ))}
            </div>
          </div>

          {/* Demandes en attente */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h2 className="text-lg font-semibold mb-4">
              {t.pendingRequests}
              {joinRequests.length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                  {joinRequests.length}
                </span>
              )}
            </h2>

            {joinRequests.length === 0 ? (
              <p className="text-sm text-gray-500">{t.noPendingRequests}</p>
            ) : (
              <div className="space-y-3">
                {joinRequests.map((req) => {
                  const name =
                    req.user?.display_name ||
                    req.payload?.user_display_name ||
                    req.user?.email?.split('@')[0] ||
                    t.defaultPlayerName;
                  const btag =
                    req.user?.battle_tag || req.payload?.user_battle_tag;
                  const role = roleLabel(req.payload?.desired_role);

                  return (
                    <div
                      key={req.id}
                      className="p-4 rounded-xl bg-white/5 border border-white/5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-sm">
                            {name}
                            {btag && (
                              <span className="text-gray-400 font-mono ml-2 text-xs">
                                {btag}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {t.wantsToJoinAs}
                            <span className="text-gray-300">{role}</span>
                            {' · '}
                            {new Date(req.created_at).toLocaleDateString(
                              locale
                            )}
                          </div>
                          {req.comment && (
                            <div className="mt-2 text-xs text-gray-400 italic bg-white/5 rounded-lg px-3 py-2">
                              &ldquo;{req.comment}&rdquo;
                            </div>
                          )}
                        </div>
                        {!readOnly && (
                          <div className="flex gap-2 flex-shrink-0">
                            <button
                              onClick={() =>
                                handleJoinAction(req.id, 'approve')
                              }
                              disabled={actionLoading === `join-${req.id}`}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold transition disabled:opacity-50"
                            >
                              {t.accept}
                            </button>
                            <button
                              onClick={() => handleJoinAction(req.id, 'reject')}
                              disabled={actionLoading === `join-${req.id}`}
                              className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition disabled:opacity-50"
                            >
                              {t.reject}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Joueurs cherchant une equipe */}
          {!isInspecting && <FreePlayersSection teamId={team.id} />}
        </main>
      </div>
    </>
  );
}
