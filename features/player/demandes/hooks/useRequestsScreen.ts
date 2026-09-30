// features/player/demandes/hooks/useRequestsScreen.ts — état et gestes de
// l'écran « Demandes » (/player/requests, lot P11) : transfert (pour soi ou
// proposé pour une coéquipière) et scrim.
//
// Deux formulaires sur schéma (`useSchemaForm`) : aucun `useState` de champ.
// La recherche d'équipe est un champ de chaque formulaire ; l'annuaire suit
// la recherche débouncée de l'onglet ouvert.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import * as z from 'zod';
import { useSchemaForm } from '@/hooks/forms/useSchemaForm';
import { useDebounce } from '@/hooks/useDebounce';
import { useManagedTeam } from '@/hooks/useManagedTeam';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import nsPlayerRequests from '@/lib/i18n/locales/fr/playerRequests';
import { makeTeamPermissionCheck } from '@/utils/teams/clientPermissions';
import { playerErrorWithRef } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { demandesClient, type RequestTargetTeam } from '../client';
import { TransferDemandeBody } from '../schemas';

export type RequestsTab = 'transfer' | 'scrim';
export type TransferMode = 'self' | 'propose';
export type DesiredRole = 'player' | 'substitute' | 'coach';

export type TransferTeamMember = {
  user_id: string;
  role: string;
  battle_tag: string | null;
  display_name?: string;
};

type Texts = typeof nsPlayerRequests.fr;
export type RequestsTexts = Texts;

function transferSchema(t: Texts) {
  return z
    .object({
      search: z.string(),
      mode: z.enum(['self', 'propose']),
      teamId: z.string(),
      playerId: z.string(),
      desiredRole: z.enum(['player', 'substitute', 'coach']),
      message: z.string(),
    })
    .superRefine((v, c) => {
      if (!v.teamId)
        c.addIssue({
          code: 'custom',
          path: ['teamId'],
          message: t.errSelectTargetTeam,
        });
      else if (v.mode === 'propose' && !v.playerId)
        c.addIssue({
          code: 'custom',
          path: ['playerId'],
          message: t.errSelectPlayer,
        });
    })
    .transform(
      (v): z.input<typeof TransferDemandeBody> => ({
        teamId: v.teamId,
        message: v.message.trim() || undefined,
        desiredRole: v.desiredRole,
        ...(v.mode === 'propose' ? { targetPlayerId: v.playerId } : {}),
      })
    )
    .pipe(TransferDemandeBody);
}

function scrimSchema(t: Texts) {
  return z
    .object({
      search: z.string(),
      teamId: z.string(),
      slots: z.array(z.string()),
      message: z.string(),
    })
    .superRefine((v, c) => {
      if (!v.teamId)
        c.addIssue({
          code: 'custom',
          path: ['teamId'],
          message: t.errSelectOpponent,
        });
      else if (!v.slots.some((s) => s.trim()))
        c.addIssue({
          code: 'custom',
          path: ['slots'],
          message: t.atLeastOneSlot,
        });
    })
    .transform((v) => ({
      teamId: v.teamId,
      message: v.message.trim() || undefined,
      // `datetime-local` → ISO ; les lignes vides sont ignorées.
      proposedSlots: v.slots
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => new Date(s).toISOString()),
    }));
}

const TRANSFER_INITIAL = {
  search: '',
  mode: 'self' as TransferMode,
  teamId: '',
  playerId: '',
  desiredRole: 'player' as DesiredRole,
  message: '',
};
const SCRIM_INITIAL = { search: '', teamId: '', slots: [''], message: '' };

/** Premier message de champ, affiché dans le bandeau d'erreur historique. */
function firstError(errors: Record<string, string>, formError: string | null) {
  return formError ?? Object.values(errors)[0] ?? null;
}

export function useRequestsScreen(userId: string | null) {
  const router = useRouter();
  const t = useT(nsPlayerRequests);
  const { addToast } = useToast();
  const scope = usePlayerScope();
  const {
    data: managedTeam,
    loading: teamLoading,
    error: teamError,
  } = useManagedTeam();
  const [tab, setTab] = useState<RequestsTab>('transfer');
  const [success, setSuccess] = useState<string | null>(null);

  const hasTeam = !!managedTeam?.team;
  const isCaptain = managedTeam?.isCaptain ?? false;
  const myTeamId = managedTeam?.team?.id ?? null;
  // Permissions EFFECTIVES (et non « est manager ») : une coach ne se voit
  // pas proposer un geste que la route refuserait.
  const can = makeTeamPermissionCheck(managedTeam?.permissions ?? []);
  const canProposeTransfer = can('manage_roster');
  const canManageScrims = can('manage_scrims');

  // Coéquipières proposables (hors soi), si le rôle couvre `manage_roster`.
  const teamMembers = useMemo<TransferTeamMember[]>(() => {
    if (!userId || !managedTeam?.team || !canProposeTransfer) return [];
    return managedTeam.members
      .filter((m) => m.user_id && m.user_id !== userId)
      .map((m) => ({
        user_id: m.user_id as string,
        role: m.role ?? 'player',
        battle_tag: m.battle_tag,
      }));
  }, [userId, managedTeam, canProposeTransfer]);

  const transferFormSchema = useMemo(() => transferSchema(t), [t]);
  const scrimFormSchema = useMemo(() => scrimSchema(t), [t]);
  const describeError = useCallback(
    (err: unknown, fallback: string) => playerErrorWithRef(err, fallback),
    []
  );

  // Les deux formulaires ont besoin de la liste d'équipes (nom → message de
  // succès) : elle est lue après leur déclaration, via cette référence.
  const teamsRef = useRef<RequestTargetTeam[]>([]);
  const nameOf = (id: string) =>
    teamsRef.current.find((tm) => tm.id === id)?.name || t.fallbackTeam;

  const announce = (msg: string) => {
    setSuccess(msg);
    addToast(msg, 'success');
  };

  const transferForm = useSchemaForm({
    schema: transferFormSchema,
    initialValues: TRANSFER_INITIAL,
    errorFallback: t.errCreateRequest,
    describeError,
    onSubmit: async (body) => {
      await demandesClient.transfer(body, scope);
      const teamName = nameOf(body.teamId);
      if (body.targetPlayerId) {
        const player = teamMembers.find(
          (m) => m.user_id === body.targetPlayerId
        );
        announce(
          format(t.successProposeTransfer, {
            playerName:
              player?.display_name || player?.battle_tag || t.fallbackPlayer,
            teamName,
          })
        );
      } else {
        announce(format(t.successSelfTransfer, { teamName }));
      }
      // Réinitialisé sur place : la capitaine peut enchaîner une demande.
      transferForm.reset({
        ...transferForm.values,
        teamId: '',
        playerId: '',
        message: '',
      });
    },
  });

  const scrimForm = useSchemaForm({
    schema: scrimFormSchema,
    initialValues: SCRIM_INITIAL,
    errorFallback: t.errCreateRequest,
    describeError,
    onSubmit: async (body) => {
      await demandesClient.scrim(body, scope);
      announce(format(t.successScrim, { teamName: nameOf(body.teamId) }));
      scrimForm.reset({
        ...scrimForm.values,
        teamId: '',
        message: '',
        slots: [''],
      });
    },
  });

  const activeSearch =
    tab === 'transfer' ? transferForm.values.search : scrimForm.values.search;
  const debouncedSearch = useDebounce(activeSearch, 300);
  const teamsQuery = useQuery({
    queryKey: playerKey(scope, 'demandes', 'target-teams', debouncedSearch),
    queryFn: () => demandesClient.targetTeams(debouncedSearch),
    enabled: !!userId,
    ...PLAYER_QUERY_OPTIONS,
  });
  const teams = teamsQuery.data ?? [];
  teamsRef.current = teams;

  // Onglet scrim et adversaire pré-choisis depuis l'URL (`?tab=scrim&team=`) :
  // on arrive ici DEPUIS un contexte (fiche d'équipe, hub scrims).
  useEffect(() => {
    if (router.query.tab === 'scrim') setTab('scrim');
  }, [router.query.tab]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: seule la cible de l'URL déclenche
  useEffect(() => {
    const target = router.query.team;
    if (typeof target === 'string' && target && target !== myTeamId) {
      transferForm.setValue('teamId', target);
      scrimForm.setValue('teamId', target);
    }
  }, [router.query.team, myTeamId]);

  const changeTab = (next: RequestsTab) => {
    setTab(next);
    transferForm.reset(TRANSFER_INITIAL);
    scrimForm.reset(SCRIM_INITIAL);
    setSuccess(null);
    // L'onglet reste dans l'URL : partageable, survit au rechargement.
    router.replace(
      { pathname: router.pathname, query: { tab: next } },
      undefined,
      { shallow: true }
    );
  };

  const switchTransferMode = (mode: TransferMode) =>
    transferForm.reset({
      ...transferForm.values,
      mode,
      teamId: '',
      playerId: '',
    });

  // Hors soi ; le transfert ne montre que les équipes qui recrutent, le scrim
  // fait remonter celles qui se déclarent disponibles.
  const otherTeams = teams.filter((tm) => tm.id !== myTeamId);
  const transferTeams = otherTeams.filter((tm) => tm.is_joinable);
  const scrimTeams = [...otherTeams].sort((a, b) => {
    const av = a.open_for_scrim ? 0 : 1;
    const bv = b.open_for_scrim ? 0 : 1;
    return av !== bv ? av - bv : a.name.localeCompare(b.name);
  });

  return {
    t,
    tab,
    changeTab,
    success,
    loading: teamLoading,
    connectionError: teamError ? t.connectionError : null,
    hasTeam,
    isCaptain,
    canProposeTransfer,
    canManageScrims,
    teamMembers,
    teamsLoading: teamsQuery.isFetching,
    transfer: {
      form: transferForm,
      teams: transferTeams,
      error: firstError(transferForm.errors, transferForm.formError),
      switchMode: switchTransferMode,
    },
    scrim: {
      form: scrimForm,
      teams: scrimTeams,
      error: firstError(scrimForm.errors, scrimForm.formError),
    },
  };
}

export type RequestsScreen = ReturnType<typeof useRequestsScreen>;
