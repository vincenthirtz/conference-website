// features/player/library/teamHq/useTeamHq.ts — les lectures et les gestes des
// QG d'équipe sur le cache joueuse (lot 9 de docs/PLAN-womens-library.md) :
//   - `useTeamHqList`    : les QG de mes équipes (la porte « QG de mon équipe ») ;
//   - `useTeamHqOpen`    : ouvrir un QG (créé à la première visite) ;
//   - `useTeamHqSummary` : le panneau d'un QG ;
//   - `useTeamHqActions` : prêter, déplacer, reprendre / rendre un meuble.
//
// CHAQUE GESTE REND UNE ISSUE (`{ ok, data }` ou `{ ok: false, code }`, `code`
// = clé de `playerLibraryTeamHq.codes`) : un refus n'est jamais avalé. UN
// GESTE À LA FOIS : un double clic rend `null` au second. Après un geste,
// réussi ou non, le panneau et la liste sont RELUS : un prêt dont la réponse
// s'est perdue apparaît quand même.

import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import type { LibraryTeamHqLendInput } from '../teamHqSchemas';
import { useTeamHqClient } from './clientContext';
import { settleTeamHq, type TeamHqResult } from './model';

// Deux branches distinctes : relire la liste ne relit pas un panneau.
export const teamHqKeys = {
  list: (scope: PlayerScope) => playerKey(scope, 'library', 'team-hq', 'list'),
  summary: (scope: PlayerScope, roomId: string) =>
    playerKey(scope, 'library', 'team-hq', 'room', roomId),
};

/** Les QG de mes équipes ; `enabled` = la porte de la Library est franchie. */
export function useTeamHqList(enabled = true) {
  const scope = usePlayerScope();
  const client = useTeamHqClient();
  return useQuery({
    queryKey: teamHqKeys.list(scope),
    queryFn: () => client.list(),
    enabled,
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Le panneau d'un QG (`null` = pas de QG à lire). */
export function useTeamHqSummary(roomId: string | null) {
  const scope = usePlayerScope();
  const client = useTeamHqClient();
  return useQuery({
    queryKey: teamHqKeys.summary(scope, roomId ?? ''),
    queryFn: () => client.summary(roomId as string),
    enabled: roomId !== null,
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Un verrou : le second appel concurrent rend `null`. */
function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(
    async <T>(
      run: () => Promise<TeamHqResult<T>>
    ): Promise<TeamHqResult<T> | null> => {
      if (busy.current) return null;
      busy.current = true;
      try {
        return await run();
      } finally {
        busy.current = false;
      }
    },
    []
  );
}

/** Ouvrir le QG d'une équipe : rend la salle (créée au besoin). */
export function useTeamHqOpen() {
  const qc = useQueryClient();
  const scope = usePlayerScope();
  const client = useTeamHqClient();
  const flight = useSingleFlight();
  const [openingTeamId, setOpeningTeamId] = useState<string | null>(null);
  const open = useCallback(
    (teamId: string) =>
      flight(async () => {
        setOpeningTeamId(teamId);
        try {
          return await settleTeamHq(() => client.open(teamId));
        } finally {
          setOpeningTeamId(null);
          void qc.invalidateQueries({ queryKey: teamHqKeys.list(scope) });
        }
      }),
    [flight, client, qc, scope]
  );
  return { open, openingTeamId };
}

/** Le geste en cours : sa sorte et le meuble visé. */
export type TeamHqPending = {
  kind: 'lend' | 'giveBack';
  inventoryId: string;
} | null;

export function useTeamHqActions(roomId: string) {
  const qc = useQueryClient();
  const scope = usePlayerScope();
  const client = useTeamHqClient();
  const flight = useSingleFlight();
  const [pending, setPending] = useState<TeamHqPending>(null);

  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: teamHqKeys.summary(scope, roomId) });
    void qc.invalidateQueries({ queryKey: teamHqKeys.list(scope) });
  }, [qc, scope, roomId]);

  const lendM = useMutation({
    mutationFn: (input: LibraryTeamHqLendInput) => client.lend(roomId, input),
    onSettled: refresh,
  });
  const giveBackM = useMutation({
    mutationFn: (inventoryId: string) => client.giveBack(roomId, inventoryId),
    onSettled: refresh,
  });
  const { mutateAsync: lendAsync } = lendM;
  const { mutateAsync: giveBackAsync } = giveBackM;

  /** Prêter (sans position : la première place libre) ou déplacer. */
  const lend = useCallback(
    (input: LibraryTeamHqLendInput) =>
      flight(async () => {
        setPending({ kind: 'lend', inventoryId: input.inventoryId });
        try {
          return await settleTeamHq(() => lendAsync(input));
        } finally {
          setPending(null);
        }
      }),
    [flight, lendAsync]
  );

  /** Reprendre son meuble, ou le rendre à sa propriétaire (capitaine, manager). */
  const giveBack = useCallback(
    (inventoryId: string) =>
      flight(async () => {
        setPending({ kind: 'giveBack', inventoryId });
        try {
          return await settleTeamHq(() => giveBackAsync(inventoryId));
        } finally {
          setPending(null);
        }
      }),
    [flight, giveBackAsync]
  );

  return { lend, giveBack, pending };
}
