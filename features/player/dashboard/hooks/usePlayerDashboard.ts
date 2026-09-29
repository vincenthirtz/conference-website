// features/player/dashboard/hooks/usePlayerDashboard.ts — l'état du tableau
// de bord joueuse (lot P12). Extrait TEL QUEL de PlayerDashboardScreen : un
// seul appel agrégé, sections défaussées une à une, gestes (annuler une
// demande, répondre à un scrim, quitter l'équipe, ouvrir aux scrims).
//
// État local (et non cache TanStack) : les gestes le modifient sur place
// (un scrim traité sort de la liste dès la confirmation serveur), comme avant.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import {
  useActiveTeam,
  type ActiveTeamOption,
} from '@/components/player/ActiveTeamContext';
import { useToast } from '@/components/Toast';
import type { useConfirmDialog } from '@/hooks/useConfirmDialog';
import type { TeamMemberLite } from '@/components/player/TeamCard';
import type {
  PendingScrim,
  ScrimAction,
  ScrimActionPayload,
} from '@/components/player/ScrimNegotiationCard';
import type { PlanningEntry } from '@/components/player/ScrimPlanningsDashboardCard';
import { useToggleScrimOpen } from '@/features/player/teamSettings/hooks/useTeamSettings';
import type nsPlayerIndex from '@/lib/i18n/locales/fr/playerIndex';
import { logger } from '@/utils/logger';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  makeTeamPermissionCheck,
  readTeamPermissions,
} from '@/utils/teams/clientPermissions';
import type { TeamPermission } from '@/utils/teamRoles';
import { dashboardClient } from '../client';
import { scrimsClient } from '@/features/player/scrims/client';
import type { ScrimRequestDecisionInput } from '@/features/player/scrims/schemas';
import type { NextMatchSection, TodoItem } from '../schemas';

export type DashboardTeam = {
  id: string;
  slug?: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  // Disponibilité aux scrims — état initial du toggle de ScrimsHubCard.
  open_for_scrim?: boolean;
} | null;

export type DashboardDemande = {
  id: string;
  type: 'captain_request' | 'join' | 'leave' | 'other';
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  created_at: string;
  updated_at?: string;
  processed_at?: string;
  comment?: string | null;
  staff_note?: string | null;
  payload?: {
    team_name?: string;
    existing_team_name?: string;
    message?: string;
  };
  team?: { id: string; name: string } | null;
};

/** Ce que l'écran lit de l'agrégat ; chaque section est défaussée à part. */
type DashboardResponse = {
  team?: DashboardTeam;
  members?: TeamMemberLite[];
  isCaptain?: boolean;
  isManager?: boolean;
  permissions?: TeamPermission[];
  demandesCaptain?: DashboardDemande[];
  demandesJoin?: DashboardDemande[];
  pendingScrims?: PendingScrim[];
  unreadMessages?: number;
  nextMatch?: NextMatchSection;
  todo?: TodoItem[];
  managedTeams?: ActiveTeamOption[];
};

type Confirm = ReturnType<typeof useConfirmDialog>['confirm'];

export function usePlayerDashboard(args: {
  ready: boolean;
  token: string | null;
  t: typeof nsPlayerIndex.fr;
  confirm: Confirm;
}) {
  const { ready, token, t, confirm } = args;
  const { subjectId, isActingAs } = usePlayerArea();
  const { activeTeamId, publishManagedTeams } = useActiveTeam();
  const { addToast } = useToast();
  const scope = useMemo<PlayerScope>(
    () => ({ subjectId, actAs: isActingAs, teamId: activeTeamId }),
    [subjectId, isActingAs, activeTeamId]
  );

  const [loading, setLoading] = useState(true);
  const [team, setTeam] = useState<DashboardTeam>(null);
  const [members, setMembers] = useState<TeamMemberLite[]>([]);
  const [isCaptain, setIsCaptain] = useState(false);
  const [isManager, setIsManager] = useState(false);
  const [permissions, setPermissions] = useState<TeamPermission[]>([]);
  const [demandes, setDemandes] = useState<DashboardDemande[]>([]);
  const [pendingScrims, setPendingScrims] = useState<PendingScrim[]>([]);
  const [scrimActionId, setScrimActionId] = useState<string | null>(null);
  const [scrimError, setScrimError] = useState<string | null>(null);
  // Grilles de dispo : lues ICI une fois, partagées par le hub (compteur) et
  // ScrimPlanningsDashboardCard (entrées, sans second appel).
  const [scrimPlannings, setScrimPlannings] = useState<PlanningEntry[]>([]);
  const toggleScrimOpen = useToggleScrimOpen();
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [nextMatch, setNextMatch] = useState<NextMatchSection | null>(null);
  const [todo, setTodo] = useState<TodoItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  /** Prédicat de VISIBILITÉ (les gestes restent neutralisés par readOnly). */
  const can = useMemo(
    () => makeTeamPermissionCheck(permissions),
    [permissions]
  );

  // Un seul appel agrégé ; une section en échec côté serveur (vide / null)
  // ne vide jamais le reste du tableau de bord.
  const loadData = useCallback(async () => {
    const data = await dashboardClient
      .get<DashboardResponse>(scope)
      .catch(() => null);
    if (!data) throw new Error('dashboard fetch failed');

    setTeam(data.team || null);
    setMembers(Array.isArray(data.members) ? data.members : []);
    setIsCaptain(data.isCaptain || false);
    setIsManager(data.isManager || false);
    // Champ absent (serveur antérieur) = repli sur l'ancien comportement.
    setPermissions(
      readTeamPermissions({
        permissions: data.permissions,
        isCaptain: data.isCaptain,
        isManager: data.isManager,
      })
    );
    const all = [...(data.demandesCaptain || []), ...(data.demandesJoin || [])];
    all.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    setDemandes(all);
    setPendingScrims(
      Array.isArray(data.pendingScrims) ? data.pendingScrims : []
    );
    setUnreadMessages(
      typeof data.unreadMessages === 'number' ? data.unreadMessages : 0
    );
    setNextMatch(data.nextMatch ?? null);
    setTodo(Array.isArray(data.todo) ? data.todo : []);
    // Même réponse que l'équipe affichée : le sélecteur ne propose jamais une
    // équipe que l'écran ne saurait pas charger.
    publishManagedTeams(data.managedTeams ?? []);
  }, [scope, publishManagedTeams]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    loadData()
      .catch((err: unknown) => {
        logger.error('[player] load error:', err);
        if (!cancelled) setError(t.loadError);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, loadData, t]);

  const cancelDemande = async (demandeId: string) => {
    setError(null);
    try {
      await dashboardClient.cancelDemande(demandeId);
      await loadData();
    } catch (err) {
      logger.error('[player] cancel demande error:', err);
      setError(t.cancelError);
    }
  };

  // Négociation multi-créneaux : 'accept' + { slot }, 'counter' + { slots },
  // 'reject' (confirmé — destructif). La carte envoie un corps DÉJÀ validé
  // (créneau choisi ; contre-proposition sur schéma, en ISO) : ici, seulement
  // la confirmation et l'appel. Stable : les cartes mémoïsées ne se
  // re-rendent pas à chaque changement d'état du tableau de bord.
  const scrimAction = useCallback(
    async (
      demandeId: string,
      action: ScrimAction,
      payload?: ScrimActionPayload
    ) => {
      setScrimError(null);
      const body: ScrimRequestDecisionInput = { demandeId, action };
      if (action === 'accept') body.slot = payload?.slot;
      if (action === 'counter') body.slots = payload?.slots;
      if (action === 'reject') {
        const ok = await confirm({
          title: t.rejectConfirmTitle,
          subtitle: t.rejectConfirmBody,
          variant: 'warning',
          confirmLabel: t.rejectConfirmCta,
          cancelLabel: t.rejectConfirmCancel,
        });
        if (!ok) return;
      }
      setScrimActionId(demandeId);
      try {
        await scrimsClient.decideRequest(scope, body);
        // Accepter, refuser ou renvoyer la balle : la carte quitte MA liste.
        setPendingScrims((prev) => prev.filter((s) => s.id !== demandeId));
      } catch (err) {
        setScrimError((err as Error).message);
      } finally {
        setScrimActionId(null);
      }
    },
    [confirm, t, scope]
  );

  // Grilles de dispo : réservées à qui gère les scrims (seuls à voir le hub).
  const canManageScrims = can('manage_scrims');
  useEffect(() => {
    if (!ready || !token || !canManageScrims) return;
    let cancelled = false;
    scrimsClient
      .plannings(scope)
      .then((data) => {
        if (!cancelled && Array.isArray(data?.plannings)) {
          setScrimPlannings(data.plannings as PlanningEntry[]);
        }
      })
      .catch((err: unknown) => {
        logger.error('[player] scrim-plannings load error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, token, canManageScrims, scope]);

  // Disponibilité aux scrims : mise à jour optimiste + toast.
  const toggleScrims = useCallback(async () => {
    if (toggleScrimOpen.isPending) return;
    try {
      const data = await toggleScrimOpen.mutateAsync({
        open: !team?.open_for_scrim,
      });
      setTeam((prev) =>
        prev ? { ...prev, open_for_scrim: data.open_for_scrim } : prev
      );
      addToast(
        data.open_for_scrim ? t.scrimsHubToggleOn : t.scrimsHubToggleOff,
        'success'
      );
    } catch (err) {
      logger.error('[player] toggle scrim-open error:', err);
      addToast(t.scrimsHubToggleError, 'error');
    }
  }, [toggleScrimOpen, addToast, t, team?.open_for_scrim]);

  const leaveTeam = async () => {
    setError(null);
    try {
      await dashboardClient.leaveTeam(scope);
      // Réconcilié depuis le serveur (team/members/isCaptain) via loadData.
      await loadData();
    } catch (err) {
      logger.error('[player] leave team error:', err);
      setError(t.leaveError);
    }
  };

  return {
    scope,
    loading,
    error,
    team,
    members,
    isCaptain,
    isManager,
    can,
    canManageScrims,
    demandes,
    pendingScrims,
    scrimActionId,
    scrimError,
    scrimPlannings,
    scrimToggling: toggleScrimOpen.isPending,
    unreadMessages,
    nextMatch,
    todo,
    reload: loadData,
    cancelDemande,
    scrimAction,
    toggleScrims,
    leaveTeam,
  };
}
