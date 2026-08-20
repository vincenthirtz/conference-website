// components/player/PlayerAreaContext.tsx
//
// "Whose player area am I rendering?" — the client-side twin of
// utils/subject.ts (S2 of docs/PLAN-espace-unifie.md).
//
// The player screens are rendered in two situations:
//   1. a signed-in player looking at their own area (default: no subject, no
//      restriction) ;
//   2. a staff member INSPECTING someone else's area from /admin — same
//      components, same endpoints, `?as=<userId>` appended and every mutation
//      hidden.
//
// A context rather than props because the dashboard composes ~10 cards that
// each fetch their own slice (NextMatchCard, TeamHealthCard, MyScrimsCard…).
// Threading `subjectId` through every one of them would be noise, and any card
// forgotten in the chain would silently fetch the STAFF's data while sitting in
// a page that claims to show someone else's — the exact class of bug this
// migration exists to kill.
//
// Inspection implique lecture seule PAR DÉFAUT : l'API refuse `?as=` sur les
// écritures (403 `subject_read_only`), donc un bouton d'action visible ne
// pourrait produire qu'une erreur.
//
// S4 lève ce défaut à la demande : `actAs` rend l'écran de nouveau actionnable
// et fait suffixer `&act=1` aux URLs, ce que le serveur exige EN PLUS de son
// propre opt-in par route (`allowActAs`). Deux clés indépendantes : une case
// cochée côté admin ne peut pas ouvrir une route qui ne s'est pas déclarée.

import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { withSubjectParam } from '@/utils/subjectParam';

export type PlayerAreaValue = {
  /** Inspected user id, or null when rendering the caller's own area. */
  subjectId: string | null;
  /** Display name of the inspected user, when the host knows it. */
  subjectName: string | null;
  /** true ⇔ subjectId is set. */
  isInspecting: boolean;
  /** true ⇔ every mutation must be hidden or disabled. */
  readOnly: boolean;
  /** true ⇔ le staff a explicitement demandé à AGIR à la place du sujet. */
  isActingAs: boolean;
  /**
   * Appends `?as=` (et `&act=1` en mode act-as) to an API path when
   * inspecting; identity otherwise.
   */
  withSubject: (url: string) => string;
};

const SELF: PlayerAreaValue = {
  subjectId: null,
  subjectName: null,
  isInspecting: false,
  readOnly: false,
  isActingAs: false,
  withSubject: (url) => url,
};

const PlayerAreaContext = createContext<PlayerAreaValue>(SELF);

export function PlayerAreaProvider({
  subjectId = null,
  subjectName = null,
  readOnly = false,
  actAs = false,
  children,
}: {
  subjectId?: string | null;
  subjectName?: string | null;
  readOnly?: boolean;
  /**
   * Le staff agit à la place du sujet : les actions redeviennent visibles et
   * les URLs portent `&act=1`. Sans sujet, l'option n'a aucun effet.
   */
  actAs?: boolean;
  children: ReactNode;
}) {
  const value = useMemo<PlayerAreaValue>(() => {
    const inspecting = !!subjectId;
    const acting = inspecting && actAs;
    return {
      subjectId: subjectId || null,
      subjectName: subjectName || null,
      isInspecting: inspecting,
      // En act-as l'écran redevient actionnable ; `readOnly` explicite reste
      // prioritaire (un appelant peut vouloir figer l'écran quoi qu'il arrive).
      readOnly: readOnly || (inspecting && !acting),
      isActingAs: acting,
      withSubject: (url: string) => withSubjectParam(url, subjectId, acting),
    };
  }, [subjectId, subjectName, readOnly, actAs]);

  // NB : l'équipe active (`ActiveTeamContext`) est un contexte SÉPARÉ, monté
  // une seule fois dans `_app` — la cloche de la Navbar en a besoin, et elle
  // vit hors de tout écran joueuse. Ne pas le remonter ici : deux providers
  // imbriqués = deux états, donc un sélecteur qui ne pilote plus rien.
  return (
    <PlayerAreaContext.Provider value={value}>
      {children}
    </PlayerAreaContext.Provider>
  );
}

/**
 * Read the current player-area scope.
 *
 * Safe to call from any player component: outside a provider it returns the
 * "self, writable" default, which is what a plain /player/* page wants.
 */
export function usePlayerArea(): PlayerAreaValue {
  return useContext(PlayerAreaContext);
}
