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
import TeamJoinLinkPanel from '@/components/player/TeamJoinLinkPanel';
import BattlenetVerifyCard from '@/components/player/BattlenetVerifyCard';
import RegistrationDeadlineBanner from '@/components/player/RegistrationDeadlineBanner';
import TeamRegistrationCard from '@/components/player/TeamRegistrationCard';
import {
  discordReadinessSummary,
  hasDiscordLinkInfo,
} from '@/utils/teams/rosterReadiness';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import ActiveTeamSwitcher from '@/components/player/ActiveTeamSwitcher';
import Switch from '@/components/ui/Switch';
import { isNonPlayingTeamRole, splitTeamMembers } from '@/utils/teams/roleKind';
import nsManageTeam from '@/lib/i18n/locales/fr/manageTeam';
import nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import SkillRatingBadge from '@/components/Team/SkillRatingBadge';
import {
  averageTeamSkillRating,
  isValidSkillRating,
} from '@/utils/overwatchRank';

/**
 * Le serveur a répondu « tu ne gères pas cette équipe » (403), ce qui est une
 * réponse légitime pour une joueuse simple — pas une erreur à afficher.
 */
function isNotManagerResponse(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 403;
}

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
  /** SR Overwatch déclaré par l'équipe (0-5000), `null` si non renseigné. */
  skill_rating?: number | null;
  // Exposé par l'API manage-team seulement une fois que la vérification
  // Battle.net est câblée côté back (cf. TODO API). Tant que la clé est
  // absente, le badge ne s'affiche pas ; `null` = non vérifié, string = vérifié.
  battle_tag_verified_at?: string | null;
  /**
   * Compte Discord lié. TRI-état : `true` / `false` / absent-ou-`null` quand
   * le serveur ne l'a pas communiqué — il ne le fait que pour un appelant qui
   * GÈRE l'équipe (cf. utils/teams/managedTeamSlice.ts). Ne jamais lire
   * l'absence comme « non lié » : cf. utils/teams/rosterReadiness.ts.
   */
  discord_linked?: boolean | null;
  /**
   * Présence constatée sur le serveur Discord, rapportée par le bot. Un compte
   * peut être LIÉ et la personne avoir quitté le serveur — le site la croyait
   * alors en règle. `null` = non constaté, jamais « absente ».
   */
  discord_in_guild?: boolean | null;
  /** Date (ISO) du constat ci-dessus. Le bot repasse toutes les 30 min. */
  discord_checked_at?: string | null;
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

/**
 * Invitation SORTANTE en attente (GET /api/teams/invitations).
 *
 * À ne pas confondre avec `JoinRequest`, qui va dans l'autre sens : une
 * personne demande à rejoindre l'équipe. La confusion entre les deux est
 * exactement ce qui a fait croire à une inscription perdue — le roster
 * n'affichait que les personnes ayant accepté, et la seule section « en
 * attente » de l'écran parlait des demandes entrantes.
 */
type SentInvitation = {
  id: string;
  email: string | null;
  role: string | null;
  battle_tag: string | null;
  set_captain: boolean;
  created_at: string;
  expires_at: string | null;
  expired: boolean;
  has_invite_link: boolean;
};

export default function PlayerManageTeamScreen() {
  const t = useT(nsManageTeam);
  const tRank = useT(nsOverwatchRank);
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
  const { user: sessionUser, loading: authLoading, ready } = usePlayerSession();
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
  const [sentInvitations, setSentInvitations] = useState<SentInvitation[]>([]);
  const [invitationsError, setInvitationsError] = useState(false);

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

  // Gérer son équipe et VOIR son équipe sont deux choses. Le serveur l'a
  // toujours su — `loadManagedTeamSlice` retombe sur la simple appartenance
  // pour une joueuse sans droits, et renvoie roster compris. L'écran, lui,
  // renvoyait tout le monde sauf capitaines et managers sur un mur « accès
  // refusé » : 43 membres ne pouvaient pas voir leur propre équipe.
  const canManage = isCaptain || isManager;
  /** Peut AGIR : gère l'équipe, et n'est pas une inspection staff en lecture. */
  const canEdit = !readOnly && canManage;

  // Une équipe créée « en tant que manager » naît sans capitaine : la capitaine
  // désignée doit d'abord accepter son invitation (ou être désignée ici).
  const hasCaptain = members.some((m) => m.is_captain);

  // Joueuses d'abord, encadrement (coach / manager) ensuite sous son intitulé.
  const { roster, subs, staff } = splitTeamMembers(members);

  // Moyenne de niveau de l'équipe. Calculée à partir de `members`, donc elle
  // suit chaque enregistrement sans qu'on ait à la recalculer à la main.
  const skillAverage = averageTeamSkillRating(members);
  const orderedMembers = [...roster, ...subs, ...staff];
  const firstStaffIndex = staff.length ? roster.length + subs.length : -1;
  const playingCount = roster.length + subs.length;

  // Combien de membres ne sont pas joignables sur Discord. Porte sur le roster
  // ENTIER, encadrement compris : un coach absent du serveur est aussi
  // invalidable qu'une joueuse. `known` peut valoir 0 — le serveur ne
  // communique l'état qu'à qui gère l'équipe.
  const discordKnown = hasDiscordLinkInfo(members);
  const discordGaps = discordReadinessSummary(members);
  // Date du dernier constat du bot. Le badge « a quitté le Discord » ne vaut
  // que jusqu'au cycle suivant (30 min) : quelqu'un qui vient de rejoindre le
  // serveur y reste affiché comme parti. Sans cette date, la capitaine part
  // réinviter une personne déjà revenue.
  const discordCheckedAt = members.reduce<string | null>((latest, m) => {
    const at = m.discord_checked_at ?? null;
    if (!at) return latest;
    return !latest || at > latest ? at : latest;
  }, null);
  const discordCheckedLabel = discordCheckedAt
    ? new Date(discordCheckedAt).toLocaleString(locale, {
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : null;

  // Sync local mirror whenever the shared team payload changes.
  useEffect(() => {
    if (!managedTeam) return;
    setTeam((managedTeam.team as TeamInfo) || null);
    setMembers((managedTeam.members as Member[]) || []);
    setIsCaptain(managedTeam.isCaptain);
    setIsManager(managedTeam.isManager);
  }, [managedTeam]);

  /**
   * Invitations en attente émises par l'équipe. Échec TOLÉRÉ : la section
   * affiche son erreur, mais le reste de l'écran (roster, demandes) reste
   * utilisable — contrairement aux demandes de join, dont l'échec bascule
   * l'écran entier en état d'erreur.
   */
  const loadSentInvitations = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ invitations?: SentInvitation[] }>(
        withTeam(withSubject('/api/teams/invitations'))
      );
      setSentInvitations(data.invitations || []);
      setInvitationsError(false);
    } catch (err) {
      // Un 403 n'est pas une panne : c'est la réponse correcte à « je ne gère
      // pas cette équipe ». Cf. loadJoinRequests juste en dessous.
      setInvitationsError(!isNotManagerResponse(err));
    }
  }, [adminFetchJson, withSubject, withTeam]);

  const loadJoinRequests = useCallback(async () => {
    // Let failures propagate so the effect can surface a real error state
    // (distinct from the "no pending requests" empty state).
    try {
      const requestsData = await adminFetchJson<{ demandes?: JoinRequest[] }>(
        withTeam(withSubject('/api/teams/join-requests'))
      );
      setJoinRequests(requestsData.demandes || []);
    } catch (err) {
      // 403 = « tu ne gères pas cette équipe ». C'est une RÉPONSE, pas un
      // échec — et la traiter comme une panne réseau faisait basculer TOUT
      // l'écran en « Impossible de charger l'équipe » pour n'importe quelle
      // joueuse simple, alors que son équipe se chargeait très bien. L'écran
      // doit continuer jusqu'à la garde `!isCaptain && !isManager`, qui sait
      // dire les choses correctement.
      if (isNotManagerResponse(err)) {
        setJoinRequests([]);
        return;
      }
      throw err;
    }
  }, [adminFetchJson, withSubject, withTeam]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setRequestsLoading(true);
    setRequestsError(false);
    void loadSentInvitations();
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
  }, [ready, loadJoinRequests, loadSentInvitations]);

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
      // La nouvelle invitation doit apparaître tout de suite dans la liste
      // ci-dessous, sinon on recrée le doute qu'on vient de lever.
      void loadSentInvitations();
    } catch (err: unknown) {
      setError((err as Error).message || t.inviteError);
    } finally {
      setActionLoading(null);
    }
  };

  // ── Relancer / annuler une invitation en attente ─────────────────────────
  // La relance invalide l'ancien lien privé et repousse l'expiration : c'est
  // la sortie de secours quand l'email d'origine s'est perdu (spam, adresse
  // mal saisie) et que l'invitation allait expirer sans réponse.
  const handleResendInvitation = async (invitation: SentInvitation) => {
    setActionLoading(`invite-resend-${invitation.id}`);
    setError(null);
    try {
      const data = await adminFetchJson<{
        invite_url: string;
        email_sent: boolean;
        expires_at: string | null;
      }>(withTeam(`/api/teams/invitations/${invitation.id}`), {
        method: 'POST',
      });
      setInviteResult({
        invite_url: data.invite_url,
        email_sent: data.email_sent,
      });
      showSuccess(
        data.email_sent ? t.resendInvitationDone : t.resendInvitationDoneNoEmail
      );
      await loadSentInvitations();
    } catch (err: unknown) {
      setError((err as Error).message || t.resendInvitationError);
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelInvitation = async (invitation: SentInvitation) => {
    const label =
      invitation.email || invitation.battle_tag || t.defaultPlayerName;
    const ok = await confirm({
      title: format(t.cancelInvitationConfirm, { name: label }),
      variant: 'warning',
      confirmLabel: t.cancelInvitation,
      cancelLabel: t.promoteCancel,
    });
    if (!ok) return;
    setActionLoading(`invite-cancel-${invitation.id}`);
    setError(null);
    try {
      await adminFetchJson(
        withTeam(`/api/teams/invitations/${invitation.id}`),
        {
          method: 'DELETE',
        }
      );
      setSentInvitations((prev) => prev.filter((i) => i.id !== invitation.id));
      showSuccess(t.cancelInvitationDone);
    } catch (err: unknown) {
      setError((err as Error).message || t.cancelInvitationError);
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

  /**
   * Miroir client de l'anti-escalation serveur : dégrader ou retirer un membre
   * PRIVILÉGIÉ reste réservé à la capitaine, pour que deux managers ne puissent
   * pas se destituer l'un l'autre (update-member-role.ts et
   * DELETE /api/teams/[teamId]/members).
   *
   * On désactive le sélecteur plutôt que de laisser proposer un geste qui
   * finira en 403 : une option qui échoue toujours se lit comme un bug.
   *
   * Approximation assumée : le catalogue des rôles privilégiés est dynamique
   * (`site_settings.team_roles`) et le client ne le charge pas ici. On couvre
   * `manager`, le seul privilégié par défaut ; si la config en ajoute un autre,
   * le serveur reste la garde — l'écran affichera son message d'erreur.
   */
  const isRoleLockedFor = (m: Member): boolean =>
    !isCaptain && (m.role ?? '').trim().toLowerCase() === 'manager';

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

  // Brouillons de SR : le champ est libre (0-5000), donc on ne peut pas
  // enregistrer a chaque frappe comme le fait un <select>. La valeur part au
  // blur ou a Entree, et le brouillon est oublie ensuite pour que la ligne
  // reparte de ce que le serveur a reellement retenu.
  const [skillRatingDrafts, setSkillRatingDrafts] = useState<
    Record<string, string>
  >({});

  const handleUpdateSkillRating = async (member: Member, raw: string) => {
    const trimmed = raw.trim();
    const current = member.skill_rating ?? null;
    const next = trimmed === '' ? null : Number(trimmed);

    // Rien saisi de neuf : on referme le brouillon sans deranger le serveur.
    if (next === current) {
      setSkillRatingDrafts((prev) => {
        const { [member.id]: _drop, ...rest } = prev;
        return rest;
      });
      return;
    }

    if (next !== null && !isValidSkillRating(next)) {
      setError(tRank.fieldInvalid);
      return;
    }

    setActionLoading(`skill-rating-${member.id}`);
    setError(null);
    try {
      await adminFetchJson(withTeam('/api/teams/update-member'), {
        method: 'PATCH',
        body: JSON.stringify({ memberId: member.id, skill_rating: next }),
      });
      setSkillRatingDrafts((prev) => {
        const { [member.id]: _drop, ...rest } = prev;
        return rest;
      });
      await reloadTeam();
      showSuccess(t.skillRatingUpdated);
    } catch (err: unknown) {
      setError((err as Error).message || t.skillRatingError);
    } finally {
      setActionLoading(null);
    }
  };

  // BattleTags saisis a la volee pour les demandes qui n'en portent pas.
  const [joinBattleTags, setJoinBattleTags] = useState<Record<string, string>>(
    {}
  );

  const handleJoinAction = async (
    demandeId: string,
    action: 'approve' | 'reject'
  ) => {
    setActionLoading(`join-${demandeId}`);
    setError(null);
    try {
      await adminFetchJson(withTeam('/api/teams/join-requests'), {
        method: 'POST',
        body: JSON.stringify({
          demandeId,
          action,
          // Rattrapage : une demande deposee sans BattleTag creerait une fiche
          // de roster vide. Envoye seulement quand la capitaine en a saisi un.
          battleTag: joinBattleTags[demandeId]?.trim() || undefined,
        }),
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

  // Plus de mur pour une membre : si le serveur a renvoyé une équipe, elle a le
  // droit de la voir. Seule l'absence totale d'équipe reste un refus.
  if (!team) {
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
        <title>
          {format(canManage ? t.tabTitle : t.tabTitleMember, {
            name: team.name,
          })}
        </title>
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

          {/* Même rappel de date butoir que le dashboard, et pour la même
              raison : c'est ici que se compose un roster, donc ici qu'on
              découvre qu'il manque quelqu'un. La coche porte sur le compte de
              la personne connectée — capitaine, coach ou manager compris : la
              validation ne fait pas d'exception pour l'encadrement. */}
          {!isInspecting && sessionUser?.id && (
            <RegistrationDeadlineBanner userId={sessionUser.id} />
          )}

          {/* Sélecteur d'équipe — rendu seulement si l'utilisateur en gère
              plusieurs (manager multi-équipes). Placé juste sous l'en-tête :
              tout ce qui suit porte sur l'équipe choisie. */}
          <ActiveTeamSwitcher className="mb-6" />

          {/* Inscription au tournoi — le geste de rattrapage quand l'inscription
              automatique de la création d'équipe n'a pas abouti. Placée haut :
              c'est ce qui décide si l'équipe joue, tout le reste vient après. */}
          <TeamRegistrationCard />

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

          {/* Recrutement. Le bloc reste visible pour TOUTE membre : savoir que
              son equipe recrute est une information, pas une commande. Seul
              l'interrupteur demande des droits. */}
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
              {canEdit && (
                <Switch
                  checked={!!team.is_joinable}
                  onChange={handleToggleJoinable}
                  disabled={actionLoading === 'joinable'}
                  label={t.recruitment}
                  size="md"
                />
              )}
            </div>
          </div>

          {/* Scrims : idem, l'etat se lit, le reglage se merite. */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6 mb-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">{t.scrimOpenLabel}</h2>
                <p className="text-sm text-gray-400 mt-1">{t.scrimOpenHelp}</p>
              </div>
              {canEdit && (
                <Switch
                  checked={!!team.open_for_scrim}
                  onChange={handleToggleScrimOpen}
                  disabled={actionLoading === 'scrim-open'}
                  label={t.scrimOpenLabel}
                  size="md"
                />
              )}
            </div>
          </div>

          {/* Inviter par email / lien privé */}
          {canEdit && (
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
                    {/* Confier un rôle de gestion est ouvert à qui gère
                        l'équipe (2026-08-20). La réserve « capitaine
                        seulement » qui vivait ici ne protégeait rien :
                        /api/teams/add-member laissait déjà un manager ajouter
                        un membre AVEC le rôle manager — elle imposait juste le
                        détour. Retirer ou dégrader un pair reste, lui,
                        réservé à la capitaine. */}
                    <option value="manager">{t.roleManager}</option>
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

          {/* Lien d'invitation : le pendant sans email du bloc ci-dessus.
              Rendu juste après, parce que c'est la même question posée
              autrement — « comment je fais entrer quelqu'un ? ». */}
          {canEdit && (
            <TeamJoinLinkPanel
              scopeUrl={(url) => withTeam(withSubject(url))}
              isCaptain={isCaptain}
            />
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
            {/* Qui n'est pas joignable sur Discord. La « santé d'équipe » du
                dashboard donne déjà le COMPTE ; ici on donne les NOMS, via le
                badge sur chaque ligne — un capitaine qui lit « 3 comptes non
                liés » sans savoir lesquels ne peut rien en faire. Rendu
                seulement si le serveur a communiqué l'état (il ne le fait que
                pour qui gère l'équipe) et s'il manque quelqu'un. */}
            {discordKnown &&
              (discordGaps.unlinked > 0 || discordGaps.left > 0) && (
                <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                  {discordGaps.unlinked > 0 && (
                    <p className="text-sm font-semibold text-amber-100">
                      {format(
                        discordGaps.unlinked > 1
                          ? t.discordGapTitle_other
                          : t.discordGapTitle_one,
                        {
                          count: discordGaps.unlinked,
                          total: discordGaps.known,
                        }
                      )}
                    </p>
                  )}
                  {/* Parties du serveur : un manque D'UNE AUTRE NATURE. Le
                      compte est lié — le site les croyait en règle — mais le
                      bot ne les trouve plus sur le Discord. Elles ne peuvent
                      pas régler ça depuis leur espace joueur : il faut les
                      réinviter. */}
                  {discordGaps.left > 0 && (
                    <p className="text-sm font-semibold text-amber-100">
                      {format(
                        discordGaps.left > 1
                          ? t.discordLeftTitle_other
                          : t.discordLeftTitle_one,
                        { count: discordGaps.left, total: discordGaps.known }
                      )}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-amber-100/80">
                    {discordGaps.unlinked > 0 && discordGaps.left > 0
                      ? t.discordGapBodyBoth
                      : discordGaps.left > 0
                        ? t.discordLeftBody
                        : t.discordGapBody}
                  </p>
                  {discordGaps.left > 0 && discordCheckedLabel && (
                    <p className="mt-1 text-xs text-amber-100/60">
                      {format(t.discordCheckedAt, {
                        date: discordCheckedLabel,
                      })}
                    </p>
                  )}
                </div>
              )}
            {/* Niveau moyen. Affiché seulement quand au moins une fiche est
                renseignée : une carte « aucune donnée » sur chaque équipe qui
                n'utilise pas la fonctionnalité serait du bruit permanent. */}
            {skillAverage && (
              <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
                <span className="text-xs font-medium uppercase tracking-[0.12em] text-gray-400">
                  {tRank.teamAverageLabel}
                </span>
                <SkillRatingBadge
                  skillRating={skillAverage.average}
                  size="md"
                />
                <span className="text-xs text-gray-500">
                  {format(
                    skillAverage.count === skillAverage.eligible
                      ? tRank.teamAverageComplete
                      : tRank.teamAverageBasis,
                    {
                      count: String(skillAverage.count),
                      eligible: String(skillAverage.eligible),
                    }
                  )}
                </span>
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
                          {/* Niveau déclaré. Le composant ne rend rien quand
                              il n'y en a pas : « non déclaré » n'a pas à
                              occuper une pastille sur chaque ligne. */}
                          <SkillRatingBadge
                            skillRating={m.skill_rating}
                            className="shrink-0"
                          />
                          {/* Badge de vérification Battle.net. Rendu
                            uniquement quand l'API expose
                            battle_tag_verified_at par membre. */}
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
                          {/* Discord non lié — seulement le MANQUE : un badge
                              « lié » sur les autres lignes ferait du bruit sans
                              rien appeler à faire. `=== false` et pas
                              `!m.discord_linked` : l'absence d'information
                              n'est pas un manque constaté. */}
                          {m.discord_linked === false && (
                            <span
                              title={t.discordUnlinkedBadgeTitle}
                              className="shrink-0 inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300"
                            >
                              {t.discordUnlinkedBadge}
                            </span>
                          )}
                          {/* A quitté le serveur : compte lié, mais le bot ne
                              la trouve plus dans le guild. Exclusif du badge
                              précédent (`discord_linked === true` requis), donc
                              jamais deux badges Discord sur la même ligne. */}
                          {m.discord_linked === true &&
                            m.discord_in_guild === false && (
                              <span
                                title={
                                  m.discord_checked_at
                                    ? `${t.discordLeftBadgeTitle} ${format(
                                        t.discordCheckedAt,
                                        {
                                          date: new Date(
                                            m.discord_checked_at
                                          ).toLocaleString(locale, {
                                            dateStyle: 'short',
                                            timeStyle: 'short',
                                          }),
                                        }
                                      )}`
                                    : t.discordLeftBadgeTitle
                                }
                                className="shrink-0 inline-flex items-center rounded-full border border-red-500/40 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-red-300"
                              >
                                {t.discordLeftBadge}
                              </span>
                            )}
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

                    {!m.is_captain && canEdit && (
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
                            {/* SR : seulement pour les rôles JOUANTS — le
                                niveau d'une coach n'entre pas dans la moyenne,
                                lui offrir le champ ferait croire l'inverse. */}
                            {!isNonPlayingTeamRole(m.role) && (
                              <input
                                type="number"
                                inputMode="numeric"
                                min={0}
                                max={5000}
                                step={50}
                                value={
                                  skillRatingDrafts[m.id] ??
                                  (m.skill_rating != null
                                    ? String(m.skill_rating)
                                    : '')
                                }
                                onChange={(e) =>
                                  setSkillRatingDrafts((prev) => ({
                                    ...prev,
                                    [m.id]: e.target.value,
                                  }))
                                }
                                onBlur={(e) =>
                                  handleUpdateSkillRating(m, e.target.value)
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    e.currentTarget.blur();
                                  }
                                }}
                                disabled={!!actionLoading}
                                aria-label={tRank.fieldLabel}
                                title={tRank.fieldLabel}
                                placeholder={tRank.fieldPlaceholder}
                                className="w-20 bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                              />
                            )}
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
                              disabled={!!actionLoading || isRoleLockedFor(m)}
                              aria-label={t.roleSelectLabel}
                              title={
                                isRoleLockedFor(m)
                                  ? t.roleLockedPrivileged
                                  : t.roleSelectLabel
                              }
                              className="bg-black/60 border border-white/10 rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-purple-400 disabled:opacity-50"
                            >
                              <option value="player">{t.optionPlayer}</option>
                              <option value="substitute">
                                {t.optionSubstitute}
                              </option>
                              <option value="coach">{t.optionCoach}</option>
                              {/* `manager` manquait ici : l'API l'accepte
                                  (assertTeamPermission `manage_roster`), mais
                                  aucun écran ne l'offrait — promouvoir un
                                  membre déjà présent était donc impossible,
                                  même pour la capitaine. */}
                              <option value="manager">{t.roleManager}</option>
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

          {/* Invitations envoyées, en attente de réponse.
              Placée AVANT les demandes entrantes : c'est la section qui
              répond à « où sont passées les joueuses que je viens de saisir ? ».
              Réservée à qui gère : le serveur refuse ces données à une membre
              simple (403), et afficher une section vide lui laisserait croire
              qu'elle pourrait agir. */}
          {canManage && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold">
                {t.sentInvitations}
                {sentInvitations.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-500/20 text-violet-300 text-xs font-bold">
                    {sentInvitations.length}
                  </span>
                )}
              </h2>
              <p className="mt-1 mb-4 text-sm text-gray-400">
                {t.sentInvitationsHelp}
              </p>

              {invitationsError ? (
                <p className="text-sm text-red-300">{t.invitationsError}</p>
              ) : sentInvitations.length === 0 ? (
                <p className="text-sm text-gray-500">{t.noSentInvitations}</p>
              ) : (
                <div className="space-y-3">
                  {sentInvitations.map((invitation) => {
                    const label =
                      invitation.email ||
                      invitation.battle_tag ||
                      t.defaultPlayerName;
                    const role = invitation.set_captain
                      ? t.invitedAsCaptain
                      : roleLabel(invitation.role ?? undefined);
                    const busy =
                      actionLoading === `invite-resend-${invitation.id}` ||
                      actionLoading === `invite-cancel-${invitation.id}`;

                    return (
                      <div
                        key={invitation.id}
                        className="p-4 rounded-xl bg-white/5 border border-white/5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="font-medium text-sm break-all">
                              {label}
                              {invitation.expired && (
                                <span className="ml-2 inline-block rounded-full bg-red-500/20 px-2 py-0.5 text-[11px] font-semibold text-red-300 align-middle">
                                  {t.invitationExpired}
                                </span>
                              )}
                            </div>
                            {invitation.battle_tag && invitation.email && (
                              <div className="text-xs text-gray-400 font-mono mt-0.5">
                                {invitation.battle_tag}
                              </div>
                            )}
                            <div className="text-xs text-gray-500 mt-1">
                              {t.invitedAs}
                              <span className="text-gray-300">{role}</span>
                              {' · '}
                              {format(t.invitationSentOn, {
                                date: new Date(
                                  invitation.created_at
                                ).toLocaleDateString(locale),
                              })}
                              {invitation.expires_at && !invitation.expired && (
                                <>
                                  {' · '}
                                  {format(t.invitationExpiresOn, {
                                    date: new Date(
                                      invitation.expires_at
                                    ).toLocaleDateString(locale),
                                  })}
                                </>
                              )}
                            </div>
                            {!invitation.email && (
                              <div className="text-xs text-amber-300/80 mt-1">
                                {t.invitationNoEmail}
                              </div>
                            )}
                          </div>
                          {canEdit && (
                            <div className="flex gap-2 flex-shrink-0">
                              {invitation.email && (
                                <button
                                  onClick={() =>
                                    handleResendInvitation(invitation)
                                  }
                                  disabled={busy}
                                  title={t.resendInvitationTitle}
                                  className="px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 hover:bg-violet-500/20 text-violet-200 text-xs font-semibold transition disabled:opacity-50"
                                >
                                  {t.resendInvitation}
                                </button>
                              )}
                              <button
                                onClick={() =>
                                  handleCancelInvitation(invitation)
                                }
                                disabled={busy}
                                className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition disabled:opacity-50"
                              >
                                {t.cancelInvitation}
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
          )}

          {/* Demandes en attente. Même raison : donnée de gestion, refusée par
              le serveur à une membre simple. */}
          {canManage && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
              <h2 className="text-lg font-semibold">
                {t.pendingRequests}
                {joinRequests.length > 0 && (
                  <span className="ml-2 inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold">
                    {joinRequests.length}
                  </span>
                )}
              </h2>
              <p className="mt-1 mb-4 text-sm text-gray-400">
                {t.pendingRequestsHelp}
              </p>

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
                          {canEdit && (
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
                                onClick={() =>
                                  handleJoinAction(req.id, 'reject')
                                }
                                disabled={actionLoading === `join-${req.id}`}
                                className="px-3 py-1.5 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs font-semibold transition disabled:opacity-50"
                              >
                                {t.reject}
                              </button>
                            </div>
                          )}
                        </div>
                        {canEdit && !btag && (
                          <div className="w-full sm:w-64">
                            <label
                              htmlFor={`join-btag-${req.id}`}
                              className="block text-[11px] uppercase tracking-[0.12em] text-amber-300/90 mb-1"
                            >
                              {t.joinMissingBattleTagLabel}
                            </label>
                            <input
                              id={`join-btag-${req.id}`}
                              type="text"
                              value={joinBattleTags[req.id] || ''}
                              onChange={(e) =>
                                setJoinBattleTags((prev) => ({
                                  ...prev,
                                  [req.id]: e.target.value,
                                }))
                              }
                              placeholder="Pseudo#1234"
                              maxLength={64}
                              aria-describedby={`join-btag-hint-${req.id}`}
                              className="w-full rounded-lg border border-amber-400/30 bg-black/60 px-3 py-2 text-xs text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-400/70"
                            />
                            <p
                              id={`join-btag-hint-${req.id}`}
                              className="mt-1 text-[11px] text-gray-400"
                            >
                              {t.joinMissingBattleTagHint}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Joueuses cherchant une équipe : c'est un outil de recrutement.
              Réservé à qui recrute. */}
          {!isInspecting && canManage && (
            <FreePlayersSection teamId={team.id} />
          )}
        </main>
      </div>
    </>
  );
}
