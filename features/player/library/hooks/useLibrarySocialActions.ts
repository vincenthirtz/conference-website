// features/player/library/hooks/useLibrarySocialActions.ts — les gestes de
// sécurité d'une salle de la Women's Library : bloquer, lever un blocage,
// signaler, expulser de chez soi (lot 5 de docs/PLAN-womens-library.md).
//
// TOUT PASSE PAR L'API (`librarySocialClient`), qui identifie l'appelante par
// sa session et vérifie la cible en base. La cible est un avatar VÉRIFIÉ : son
// `userId` ET son jeton de présence (`ticket`, lot 14a), que l'API revérifie
// (cf. realtime/presenceVerifier.ts). Rien ne change à l'écran AVANT la
// réponse :
//   - bloquer : une fois CONFIRMÉ, `room.hideLocally(userId)` la retire tout
//     de suite (le `hide` du serveur suit, pour mes autres onglets) ;
//   - lever un blocage : RIEN en local. Le serveur n'envoie `unhide` que si
//     l'autre ne m'a pas bloquée de son côté ; la révéler ici montrerait une
//     personne qui, elle, m'a bloquée ;
//   - expulser : RIEN en local. Le `kicked` du canal serveur de la salle la
//     retire chez toutes, moi comprise.
//
// CHAQUE GESTE REND UNE ISSUE (`{ ok, data }` ou `{ ok: false, error, code }`,
// `code` = clé de `playerLibrarySocial.codes`), comme `useLibraryActions`.
// UN GESTE À LA FOIS par sorte : un double clic rend `null` au second (deux
// clics = deux `Idempotency-Key`, l'API ne les dédoublonnerait pas).

import { useCallback, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  librarySocialClient,
  type LibrarySocialClient,
} from '../realtime/socialClient';
import type {
  LibraryBlockInput,
  LibraryKickInput,
  LibraryReportInput,
} from '../socialSchemas';
import { type SocialActionResult, socialErrorKey } from '../socialModel';

export type LibrarySocialActionsClient = Pick<
  LibrarySocialClient,
  'block' | 'unblock' | 'report' | 'kick'
>;

/** La cible d'un geste : un avatar dont le jeton de présence est vérifié. */
export type SocialActionTarget = { userId: string; ticket: string };

export type UseLibrarySocialActionsOptions = {
  /** La salle en cours (`useLibraryRoomChannel`) : masquer après un blocage. */
  room?: { hideLocally: (userId: string) => void } | null;
  /** Le client HTTP (tests, page de développement) ; défaut : l'API. */
  client?: LibrarySocialActionsClient;
};

async function settle<T>(
  run: () => Promise<T>
): Promise<SocialActionResult<T>> {
  try {
    return { ok: true, data: await run() };
  } catch (error) {
    return { ok: false, error, code: socialErrorKey(error) };
  }
}

/** Un verrou par sorte de geste : le second appel concurrent rend `null`. */
function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(
    async <T>(
      run: () => Promise<SocialActionResult<T>>
    ): Promise<SocialActionResult<T> | null> => {
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

export function useLibrarySocialActions(
  options: UseLibrarySocialActionsOptions = {}
) {
  const client = options.client ?? librarySocialClient;
  const roomRef = useRef(options.room);
  roomRef.current = options.room;

  const blockM = useMutation({
    mutationFn: (input: LibraryBlockInput) => client.block(input),
  });
  const unblockM = useMutation({
    mutationFn: (userId: string) => client.unblock(userId),
  });
  const reportM = useMutation({
    mutationFn: (input: LibraryReportInput) => client.report(input),
  });
  const kickM = useMutation({
    mutationFn: (input: LibraryKickInput) => client.kick(input),
  });

  const blockFlight = useSingleFlight();
  const unblockFlight = useSingleFlight();
  const reportFlight = useSingleFlight();
  const kickFlight = useSingleFlight();

  const { mutateAsync: blockAsync } = blockM;
  const { mutateAsync: unblockAsync } = unblockM;
  const { mutateAsync: reportAsync } = reportM;
  const { mutateAsync: kickAsync } = kickM;

  const block = useCallback(
    (target: SocialActionTarget) =>
      blockFlight(async () => {
        const { userId, ticket } = target;
        const result = await settle(() =>
          blockAsync({ userId, targetTicket: ticket })
        );
        // Confirmé par l'API : on ne la voit plus, sans attendre le `hide`.
        if (result.ok) roomRef.current?.hideLocally(userId);
        return result;
      }),
    [blockFlight, blockAsync]
  );

  const unblock = useCallback(
    (userId: string) => unblockFlight(() => settle(() => unblockAsync(userId))),
    [unblockFlight, unblockAsync]
  );

  const report = useCallback(
    (input: LibraryReportInput) =>
      reportFlight(() => settle(() => reportAsync(input))),
    [reportFlight, reportAsync]
  );

  const kick = useCallback(
    (target: SocialActionTarget, minutes?: number) =>
      kickFlight(() => {
        const base = { userId: target.userId, targetTicket: target.ticket };
        return settle(() =>
          kickAsync(minutes === undefined ? base : { ...base, minutes })
        );
      }),
    [kickFlight, kickAsync]
  );

  return {
    block,
    /** La personne en cours de blocage, ou null. */
    blockingId: blockM.isPending ? (blockM.variables?.userId ?? null) : null,
    unblock,
    unblockingId: unblockM.isPending ? (unblockM.variables ?? null) : null,
    report,
    reporting: reportM.isPending,
    kick,
    kickingId: kickM.isPending ? (kickM.variables?.userId ?? null) : null,
  };
}
