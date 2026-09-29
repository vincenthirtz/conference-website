// utils/player/playerHttp.ts — requête authentifiée de l'espace joueuse, HORS
// composant (lot P5, docs/PLAN-industrialisation-joueur.md).
//
// Même cœur que `adminRequest` (`utils/http/authedRequest.ts`) : Bearer de la
// session, `Idempotency-Key` sur les mutations (`idempotent`), erreur typée
// `code` / `fields` / `requestId`. Deux différences propres à la joueuse :
//
//   - 401 → `/login?next=<page courante>` (`loginHrefFor`), comme les écrans
//     joueuse le font déjà : la reconnexion RAMÈNE sur l'écran. `loginPath`
//     ou `skipAuthRedirect` restent disponibles par appel ;
//   - PORTÉE AUTOMATIQUE. Un appel qui reçoit `scope` porte `?as=` (et
//     `&act=1` en act-as) puis `?teamId=` — exactement ce que faisaient à la
//     main `withTeam(withSubject(url))`. Le suffixe ne dépend plus de la
//     discipline de chaque écran : une carte qui oublie le sujet ne peut plus
//     lire les données du staff sous une page qui prétend en montrer une autre.

import Router from 'next/router';
import {
  ApiHttpError,
  authedRequest,
  errorMessageWithRef,
  type AuthedRequestInit,
} from '@/utils/http/authedRequest';
import { withSubjectParam } from '@/utils/subjectParam';
import { withTeamParam } from '@/utils/teamScopeParam';
import { loginHrefFor } from './sessionExpiry';

export class PlayerHttpError extends ApiHttpError {
  constructor(message: string, status: number, payload: unknown) {
    super(message, status, payload);
    this.name = 'PlayerHttpError';
  }
}

/**
 * Sur QUI et sur QUELLE équipe l'écran travaille. Construit par
 * `usePlayerScope()` à partir de `PlayerAreaContext` et `ActiveTeamContext`.
 */
export type PlayerScope = {
  /** Sujet inspecté par le staff ; null = l'appelante elle-même. */
  subjectId: string | null;
  /** Le staff agit à la place du sujet (`&act=1`). */
  actAs: boolean;
  /** Équipe active choisie ; null = le serveur décide (mono-équipe). */
  teamId: string | null;
};

export const SELF_SCOPE: PlayerScope = {
  subjectId: null,
  actAs: false,
  teamId: null,
};

/** `?as=` (+ `&act=1`) puis `?teamId=` — l'ordre historique des écrans. */
export function scopedUrl(url: string, scope: PlayerScope): string {
  return withTeamParam(
    withSubjectParam(url, scope.subjectId, scope.actAs),
    scope.teamId
  );
}

/** Chemin courant ; le singleton du routeur lève hors d'une app Next montée. */
function currentPath(): string | null {
  try {
    return Router.asPath ?? null;
  } catch {
    return null;
  }
}

export type PlayerRequestInit = AuthedRequestInit & {
  /** Portée sujet + équipe à suffixer (routes `subject: 'follow'`). */
  scope?: PlayerScope;
};

export function playerRequest<T>(
  url: string,
  init: PlayerRequestInit = {}
): Promise<T> {
  const { scope, ...rest } = init;
  return authedRequest<T>(scope ? scopedUrl(url, scope) : url, rest, {
    defaultLoginPath: () => loginHrefFor(currentPath()),
    makeError: (message, status, payload) =>
      new PlayerHttpError(message, status, payload),
  });
}

/**
 * Message de toast : libellé de l'écran + référence de la requête. Le libellé
 * traduit d'un `code` vient de `playerErrorMessage` (features/player/_shared/
 * errorMessage.ts, lot P4) ; ceci n'ajoute que la référence.
 */
export function playerErrorWithRef(err: unknown, fallback: string): string {
  return errorMessageWithRef(err, fallback);
}
