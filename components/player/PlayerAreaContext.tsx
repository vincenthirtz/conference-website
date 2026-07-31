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
// Inspection implies read-only: the API refuses `?as=` on writes anyway (403
// `subject_read_only`), so a visible action button could only ever produce an
// error. S4 will make `readOnly` independently controllable.

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
  /** Appends `?as=` to an API path when inspecting; identity otherwise. */
  withSubject: (url: string) => string;
};

const SELF: PlayerAreaValue = {
  subjectId: null,
  subjectName: null,
  isInspecting: false,
  readOnly: false,
  withSubject: (url) => url,
};

const PlayerAreaContext = createContext<PlayerAreaValue>(SELF);

export function PlayerAreaProvider({
  subjectId = null,
  subjectName = null,
  readOnly = false,
  children,
}: {
  subjectId?: string | null;
  subjectName?: string | null;
  readOnly?: boolean;
  children: ReactNode;
}) {
  const value = useMemo<PlayerAreaValue>(
    () => ({
      subjectId: subjectId || null,
      subjectName: subjectName || null,
      isInspecting: !!subjectId,
      readOnly: readOnly || !!subjectId,
      withSubject: (url: string) => withSubjectParam(url, subjectId),
    }),
    [subjectId, subjectName, readOnly]
  );

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
