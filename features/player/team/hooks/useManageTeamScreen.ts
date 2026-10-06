// features/player/team/hooks/useManageTeamScreen.ts — l'état et les gestes
// de « Gérer mon équipe » (lot P10), extraits de l'ancien écran monolithe
// (components/player/screens/PlayerManageTeamScreen.tsx, 2 220 lignes).
//
// L'écran ne garde que la composition des panneaux (features/player/team/ui).
// Ici : la tranche équipe (cache partagé `useManagedTeam`), les listes
// (invitations envoyées, demandes reçues) sur le cache joueuse, les droits
// PAR PERMISSION — la même liste que celle des routes — et les gestes.
//
// Deux prédicats, volontairement distincts :
//  - `can` = VISIBILITÉ. Pas de `readOnly` : en inspection staff l'écran reste
//    la photo fidèle de ce que la personne voit ;
//  - `canDo` = ACTION. Neutralisé en inspection (hors act-as).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { format, useT } from '@/lib/i18n/useT';
import nsManageTeam from '@/lib/i18n/locales/fr/manageTeam';
import nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import { makeTeamPermissionCheck } from '@/utils/teams/clientPermissions';
import { TEAM_PERMISSION_VALUES, type TeamPermission } from '@/utils/teamRoles';
import { BATTLE_TAG_REGEX, isNonPlayingTeamRole } from '@/utils/teams/roleKind';
import { isValidSkillRating } from '@/utils/overwatchRank';
import {
  useToggleJoinable,
  useToggleScrimOpen,
} from '@/features/player/teamSettings/hooks/useTeamSettings';
import { usePlayerErrorText } from '../../_shared/useErrorText';
import type {
  InvitationSentDto,
  InviteRoleChoice,
  ManagedTeamInfoDto,
  ManagedTeamMemberDto,
  SentInvitationDto,
  TeamIdentityField,
  TeamSpecialty,
} from '../schemas';
import {
  useCancelInvitation,
  useDecideJoinRequest,
  useInviteMember,
  useJoinRequests,
  usePatchTeamInfo,
  useRemoveMember,
  useResendInvitation,
  useSentInvitations,
  useTransferCaptain,
  useUpdateMember,
  useUpdateMemberRole,
  useUpdateMemberSpecialty,
} from './useTeamQueries';

export type ManageTeamTexts = typeof nsManageTeam.fr;

/**
 * Identité affichée d'un membre : BattleTag pour une joueuse, pseudo d'abord
 * pour l'encadrement (coach / manager n'ont pas l'obligation de BattleTag).
 */
export function memberLabelOf(
  m: Pick<ManagedTeamMemberDto, 'battle_tag' | 'display_name' | 'role'>,
  unknownLabel: string
): string {
  return (
    (isNonPlayingTeamRole(m.role)
      ? m.display_name || m.battle_tag
      : m.battle_tag || m.display_name) || unknownLabel
  );
}

/** Rôle brut (membre ou rôle souhaité) → libellé traduit. */
export function roleLabelOf(
  role: string | null | undefined,
  t: ManageTeamTexts
): string {
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
}

/** Ce que renvoie un geste « enregistré au blur » : garder la saisie ou non. */
export type CommitResult = 'kept' | 'reset';

/**
 * @param loginHref retour à cet écran après reconnexion (session absente au
 *   montage) — `?welcome=1` et l'équipe choisie compris.
 */
export function useManageTeamScreen(loginHref: string) {
  const t = useT(nsManageTeam);
  const tRank = useT(nsOverwatchRank);
  const errorText = usePlayerErrorText();
  const { readOnly, subjectId } = usePlayerArea();
  const {
    user: sessionUser,
    loading: authLoading,
    ready,
  } = usePlayerSession({ redirectTo: loginHref });

  const {
    data: managedTeam,
    loading: teamLoading,
    error: teamError,
    reload: reloadTeam,
  } = useManagedTeam();
  const { confirm, dialog } = useConfirmDialog();

  const invitationsQuery = useSentInvitations(ready);
  const joinRequestsQuery = useJoinRequests(ready);

  const toggleJoinable = useToggleJoinable();
  const toggleScrimOpen = useToggleScrimOpen();
  const inviteMember = useInviteMember();
  const resendInvitation = useResendInvitation();
  const cancelInvitation = useCancelInvitation();
  const decideJoinRequest = useDecideJoinRequest();
  const removeMember = useRemoveMember();
  const updateMemberRole = useUpdateMemberRole();
  const updateMemberSpecialty = useUpdateMemberSpecialty();
  const updateMember = useUpdateMember();
  const transferCaptain = useTransferCaptain();
  const patchTeamInfo = usePatchTeamInfo();

  // Miroir local de la tranche partagée : les retouches optimistes (retrait,
  // changement de rôle, bascules) s'y appliquent sans aller-retour.
  const [team, setTeam] = useState<ManagedTeamInfoDto | null>(null);
  const [members, setMembers] = useState<ManagedTeamMemberDto[]>([]);
  useEffect(() => {
    if (!managedTeam) return;
    setTeam((managedTeam.team as ManagedTeamInfoDto) || null);
    setMembers((managedTeam.members as ManagedTeamMemberDto[]) || []);
  }, [managedTeam]);

  const isCaptain = managedTeam?.isCaptain ?? false;
  const isManager = managedTeam?.isManager ?? false;
  const permissions: TeamPermission[] = managedTeam?.permissions ?? [];

  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  /** Membre dont le panneau de droits est ouvert (un seul à la fois). */
  const [rightsFor, setRightsFor] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InvitationSentDto | null>(
    null
  );
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (successTimer.current) clearTimeout(successTimer.current);
    },
    []
  );

  const showSuccess = useCallback((msg: string) => {
    setSuccessMsg(msg);
    if (successTimer.current) clearTimeout(successTimer.current);
    successTimer.current = setTimeout(() => setSuccessMsg(null), 3000);
  }, []);

  const memberLabel = useCallback(
    (m: Pick<ManagedTeamMemberDto, 'battle_tag' | 'display_name' | 'role'>) =>
      memberLabelOf(m, t.unknown),
    [t]
  );
  const roleLabel = useCallback(
    (role: string | null | undefined) => roleLabelOf(role, t),
    [t]
  );

  const can = useMemo(
    () => makeTeamPermissionCheck(permissions),
    [permissions]
  );
  const canDo = useMemo(
    () => makeTeamPermissionCheck(permissions, { readOnly }),
    [permissions, readOnly]
  );

  // Gérer son équipe et VOIR son équipe sont deux choses : une membre sans
  // droits voit son roster, sans leviers.
  const canManage = isCaptain || isManager;
  // En inspection, le périmètre décrit est celui de la personne INSPECTÉE.
  const viewerId = subjectId ?? sessionUser?.id ?? null;
  const viewerRole =
    members.find((m) => m.user_id && m.user_id === viewerId)?.role ?? null;
  const showRoleScope =
    canManage &&
    !isCaptain &&
    permissions.length < TEAM_PERMISSION_VALUES.length;
  // Une équipe créée « en tant que manager » naît sans capitaine.
  const hasCaptain = members.some((m) => m.is_captain);

  /**
   * Miroir client de l'anti-escalade serveur : dégrader ou retirer un membre
   * PRIVILÉGIÉ reste réservé à la capitaine. Approximation assumée : seul
   * `manager` est privilégié par défaut ; le serveur reste la garde.
   */
  const isRoleLockedFor = useCallback(
    (m: ManagedTeamMemberDto) =>
      !isCaptain && (m.role ?? '').trim().toLowerCase() === 'manager',
    [isCaptain]
  );

  /** Exécute un geste : état « en cours », erreur traduite, succès. */
  const run = useCallback(
    async (key: string, fallback: string, action: () => Promise<void>) => {
      setActionLoading(key);
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(errorText(err, fallback));
      } finally {
        setActionLoading(null);
      }
    },
    [errorText]
  );

  // ── Invitations ─────────────────────────────────────────────────────────
  /** `true` si l'invitation est partie (le formulaire se vide alors). */
  const invite = async (body: {
    email: string;
    role: InviteRoleChoice;
  }): Promise<boolean> => {
    setInviteResult(null);
    let sent = false;
    await run('invite', t.inviteError, async () => {
      const data = await inviteMember.mutateAsync(body);
      setInviteResult(data);
      sent = true;
      showSuccess(data.email_sent ? t.inviteSentEmail : t.inviteCreated);
    });
    return sent;
  };

  const resend = (invitation: SentInvitationDto) =>
    run(`invite-resend-${invitation.id}`, t.resendInvitationError, async () => {
      const data = await resendInvitation.mutateAsync(invitation.id);
      setInviteResult({
        invite_url: data.invite_url,
        email_sent: data.email_sent,
      });
      showSuccess(
        data.email_sent ? t.resendInvitationDone : t.resendInvitationDoneNoEmail
      );
    });

  const cancel = async (invitation: SentInvitationDto) => {
    const label =
      invitation.email || invitation.battle_tag || t.defaultPlayerName;
    const ok = await confirm({
      title: format(t.cancelInvitationConfirm, { name: label }),
      variant: 'warning',
      confirmLabel: t.cancelInvitation,
      cancelLabel: t.promoteCancel,
    });
    if (!ok) return;
    await run(
      `invite-cancel-${invitation.id}`,
      t.cancelInvitationError,
      async () => {
        await cancelInvitation.mutateAsync(invitation.id);
        showSuccess(t.cancelInvitationDone);
      }
    );
  };

  // ── Ouverture (recrutement, scrims) ─────────────────────────────────────
  const toggleRecruitment = () =>
    run('joinable', t.teamInfoError, async () => {
      const data = await toggleJoinable.mutateAsync({
        joinable: !team?.is_joinable,
      });
      setTeam((prev) =>
        prev ? { ...prev, is_joinable: data.is_joinable } : prev
      );
      void reloadTeam();
      showSuccess(data.is_joinable ? t.recruitmentOpen : t.recruitmentClosed);
    });

  const toggleScrims = () =>
    run('scrim-open', t.teamInfoError, async () => {
      const data = await toggleScrimOpen.mutateAsync({
        open: !team?.open_for_scrim,
      });
      setTeam((prev) =>
        prev ? { ...prev, open_for_scrim: data.open_for_scrim } : prev
      );
      void reloadTeam();
      showSuccess(data.open_for_scrim ? t.scrimOpenOn : t.scrimOpenOff);
    });

  // ── Roster ──────────────────────────────────────────────────────────────
  const remove = (memberId: string) => {
    if (!team) return;
    return run(`remove-${memberId}`, t.teamInfoError, async () => {
      await removeMember.mutateAsync({ teamId: team.id, memberId });
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
      setPendingRemoval(null);
      void reloadTeam();
      showSuccess(t.memberRemoved);
    });
  };

  const changeRole = (memberId: string, role: string) =>
    run(`role-${memberId}`, t.teamInfoError, async () => {
      const data = await updateMemberRole.mutateAsync({ memberId, role });
      setMembers((prev) =>
        prev.map((m) =>
          m.id === memberId
            ? { ...m, role: data.newRole, is_substitute: data.isSubstitute }
            : m
        )
      );
      void reloadTeam();
      showSuccess(t.roleUpdated);
    });

  const promote = async (member: ManagedTeamMemberDto) => {
    const userId = member.user_id;
    if (!userId) return;
    const ok = await confirm({
      // Sans capitaine en poste, c'est une désignation, pas un transfert.
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
    await run(`promote-${member.id}`, t.promoteError, async () => {
      await transferCaptain.mutateAsync(userId);
      await reloadTeam();
      showSuccess(format(t.promoteSuccess, { name: memberLabel(member) }));
    });
  };

  const changeSpecialty = (memberId: string, value: string) =>
    run(`specialty-${memberId}`, t.specialtyError, async () => {
      const specialty = (value || null) as TeamSpecialty;
      await updateMemberSpecialty.mutateAsync({ memberId, specialty });
      await reloadTeam();
      showSuccess(t.specialtyUpdated);
    });

  /** BattleTag saisi au blur / Entrée. `reset` = afficher la valeur serveur. */
  const commitBattleTag = async (
    member: ManagedTeamMemberDto,
    raw: string
  ): Promise<CommitResult> => {
    const trimmed = raw.trim();
    if (trimmed === (member.battle_tag ?? '')) return 'reset';
    if (!trimmed) {
      // Vider n'est légitime que pour l'encadrement.
      if (!isNonPlayingTeamRole(member.role)) {
        setError(t.battleTagRequiredForRole);
        return 'kept';
      }
    } else if (!BATTLE_TAG_REGEX.test(trimmed)) {
      setError(t.battleTagInvalid);
      return 'kept';
    }
    let saved = false;
    await run(`battle-tag-${member.id}`, t.battleTagError, async () => {
      await updateMember.mutateAsync({
        memberId: member.id,
        battle_tag: trimmed || null,
      });
      saved = true;
      await reloadTeam();
      showSuccess(t.battleTagUpdated);
    });
    return saved ? 'reset' : 'kept';
  };

  /** SR d'une fiche (0-5000), au blur / Entrée. */
  const commitSkillRating = async (
    member: ManagedTeamMemberDto,
    raw: string
  ): Promise<CommitResult> => {
    const trimmed = raw.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next === (member.skill_rating ?? null)) return 'reset';
    if (next !== null && !isValidSkillRating(next)) {
      setError(tRank.fieldInvalid);
      return 'kept';
    }
    let saved = false;
    await run(`skill-rating-${member.id}`, t.skillRatingError, async () => {
      await updateMember.mutateAsync({
        memberId: member.id,
        skill_rating: next,
      });
      saved = true;
      await reloadTeam();
      showSuccess(t.skillRatingUpdated);
    });
    return saved ? 'reset' : 'kept';
  };

  /** SR d'ENSEMBLE déclaré : court-circuite la moyenne des fiches. */
  const commitTeamSkillRating = async (raw: string): Promise<CommitResult> => {
    if (!team) return 'reset';
    const trimmed = raw.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next === (team.skill_rating ?? null)) return 'reset';
    if (next !== null && !isValidSkillRating(next)) {
      setError(tRank.fieldInvalid);
      return 'kept';
    }
    let saved = false;
    await run('team-skill-rating', t.skillRatingError, async () => {
      await patchTeamInfo.mutateAsync({ teamId: team.id, skill_rating: next });
      saved = true;
      await reloadTeam();
      showSuccess(t.skillRatingUpdated);
    });
    return saved ? 'reset' : 'kept';
  };

  /** Identité : nom, sigle, pays — mêmes bornes que le serveur. */
  const commitTeamIdentity = async (
    field: TeamIdentityField,
    raw: string
  ): Promise<CommitResult> => {
    if (!team) return 'reset';
    const trimmed = raw.trim();
    if (trimmed === ((team[field] ?? '') as string).trim()) return 'reset';
    if (field === 'name' && (trimmed.length < 2 || trimmed.length > 100)) {
      setError(t.teamNameInvalid);
      return 'kept';
    }
    if (field === 'short_name' && trimmed.length > 16) {
      setError(t.teamShortNameInvalid);
      return 'kept';
    }
    if (field === 'country' && trimmed.length > 56) {
      setError(t.teamCountryInvalid);
      return 'kept';
    }
    let saved = false;
    await run(`team-${field}`, t.teamInfoError, async () => {
      // Le nom ne se vide pas (2 caractères) ; sigle et pays, si.
      await patchTeamInfo.mutateAsync({
        teamId: team.id,
        [field]: trimmed || null,
      });
      saved = true;
      await reloadTeam();
      showSuccess(t.teamInfoUpdated);
    });
    return saved ? 'reset' : 'kept';
  };

  // ── Demandes reçues ─────────────────────────────────────────────────────
  const decideJoin = (
    demandeId: string,
    action: 'approve' | 'reject',
    battleTag?: string,
    reason?: string
  ) =>
    run(`join-${demandeId}`, t.teamInfoError, async () => {
      await decideJoinRequest.mutateAsync({
        demandeId,
        action,
        // Rattrapage d'une demande déposée sans BattleTag.
        battleTag: battleTag?.trim() || undefined,
        // Motif de refus facultatif, montré à la candidate.
        reason: action === 'reject' ? reason?.trim() || undefined : undefined,
      });
      if (action === 'approve') await reloadTeam();
      showSuccess(action === 'approve' ? t.playerAccepted : t.requestRejected);
    });

  const retry = () => {
    void reloadTeam();
    void joinRequestsQuery.refetch();
  };

  return {
    t,
    tRank,
    dialog,
    sessionUserId: sessionUser?.id ?? null,
    // Comme avant : squelette jusqu'aux demandes reçues (elles décident de
    // l'état d'erreur de l'écran) ; les invitations chargent à côté.
    loading: authLoading || teamLoading || joinRequestsQuery.isPending,
    failed: (Boolean(teamError) && !team) || joinRequestsQuery.isError,
    retry,
    team,
    members,
    isCaptain,
    permissions,
    can,
    canDo,
    canManage,
    showRoleScope,
    viewerRole,
    hasCaptain,
    memberLabel,
    roleLabel,
    isRoleLockedFor,
    error,
    successMsg,
    actionLoading,
    pendingRemoval,
    setPendingRemoval,
    rightsFor,
    toggleRights: (userId: string) =>
      setRightsFor((cur) => (cur === userId ? null : userId)),
    inviteResult,
    sentInvitations: invitationsQuery.data ?? [],
    invitationsError: invitationsQuery.isError,
    joinRequests: joinRequestsQuery.data ?? [],
    actions: {
      invite,
      resend,
      cancel,
      toggleRecruitment,
      toggleScrims,
      remove,
      changeRole,
      promote,
      changeSpecialty,
      commitBattleTag,
      commitSkillRating,
      commitTeamSkillRating,
      commitTeamIdentity,
      decideJoin,
    },
  };
}

export type ManageTeamScreenState = ReturnType<typeof useManageTeamScreen>;
