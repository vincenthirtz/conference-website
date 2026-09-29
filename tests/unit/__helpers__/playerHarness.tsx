// tests/unit/__helpers__/playerHarness.tsx — harnais des tests de composants
// joueuse (lot P6, docs/PLAN-industrialisation-joueur.md).
//
// Rend un écran/une carte joueuse dans le même contexte que l'app : toasts,
// équipe active, et la PORTÉE — soi, inspection staff (`subjectId`), act-as
// (`actAs`). Le fichier de test appelant doit être en `@vitest-environment
// happy-dom`, faire `afterEach(cleanup)` et mocker `@/utils/supabaseBrowser`
// (session) + `next/router` s'il déclenche des requêtes (cf. `mockPlayerSession`).
//
//   renderPlayer(<MaCarte />, { subjectId: SUBJECT });          // inspection
//   renderPlayer(<MaCarte />, { subjectId: SUBJECT, actAs: true }); // act-as

import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ToastProvider, useToasts } from '../../../components/Toast';
import { PlayerAreaProvider } from '../../../components/player/PlayerAreaContext';
import { ActiveTeamProvider } from '../../../components/player/ActiveTeamContext';

export type PlayerHarnessScope = {
  /** Sujet inspecté par le staff ; absent = la joueuse elle-même. */
  subjectId?: string | null;
  subjectName?: string | null;
  /** Le staff agit à la place du sujet (`&act=1`, actions visibles). */
  actAs?: boolean;
  readOnly?: boolean;
};

/** Rend les toasts en texte simple : un test peut les lire par rôle/texte. */
function ToastsOutlet() {
  const toasts = useToasts();
  return (
    <ul data-testid="toasts">
      {toasts.map((t) => (
        <li key={t.id} data-variant={t.variant}>
          {t.message}
        </li>
      ))}
    </ul>
  );
}

export function renderPlayer(
  ui: ReactElement,
  scope: PlayerHarnessScope = {}
): RenderResult {
  return render(
    <ToastProvider>
      <ActiveTeamProvider>
        <PlayerAreaProvider
          subjectId={scope.subjectId ?? null}
          subjectName={scope.subjectName ?? null}
          actAs={scope.actAs ?? false}
          readOnly={scope.readOnly ?? false}
        >
          {ui}
        </PlayerAreaProvider>
      </ActiveTeamProvider>
      <ToastsOutlet />
    </ToastProvider>
  );
}
