// features/admin/simulator/hooks/simulatorHookTypes.ts — types communs des
// hooks du simulateur de tournoi : ils reçoivent l'état, les setters et les
// outils de la page (qui reste propriétaire de tous les useState).

import type { Dispatch, SetStateAction } from 'react';
import type { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type { useToast } from '@/components/Toast';
import type nsAdminTournamentSimulator from '@/lib/i18n/locales/admin-fr/adminTournamentSimulator';
import type { SimStage } from '@/utils/simulator';

export type Setter<T> = Dispatch<SetStateAction<T>>;
export type SimMutate = ReturnType<typeof useIdempotentMutation>['mutate'];
export type AddToast = ReturnType<typeof useToast>['addToast'];
export type SimulatorDict = typeof nsAdminTournamentSimulator.fr;

/** Onglets de résultats du simulateur. */
export type SimulatorTab =
  | 'bracket'
  | 'teams'
  | 'maps'
  | 'stats'
  | 'timeline'
  | 'compare'
  | 'monte-carlo'
  | 'history';

/** Mutation des phases de l'occurrence active (empile l'annulation). */
export type SetStages = (updater: (prev: SimStage[]) => SimStage[]) => void;
