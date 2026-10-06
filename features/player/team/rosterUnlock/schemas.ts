// features/player/team/rosterUnlock/schemas.ts — corps de la demande de
// dérogation au verrou de roster (lot P7). Hors de schemas.ts, qui a atteint
// le plafond de taille de l'espace joueuse.

import * as z from 'zod';
import {
  ROSTER_UNLOCK_REASON_MAX,
  ROSTER_UNLOCK_REASON_MIN,
} from '../../../../utils/teams/rosterLockView';

/** Corps de POST /api/teams/roster-unlock-request. */
export const RosterUnlockRequestBody = z.object(
  {
    reason: z
      .string({ error: 'Motif requis.' })
      .trim()
      .min(
        ROSTER_UNLOCK_REASON_MIN,
        `Explique le changement (${ROSTER_UNLOCK_REASON_MIN} caractères minimum).`
      )
      .max(
        ROSTER_UNLOCK_REASON_MAX,
        `Motif trop long (${ROSTER_UNLOCK_REASON_MAX} caractères maximum).`
      ),
  },
  { error: 'Motif requis.' }
);
export type RosterUnlockRequestInput = z.infer<typeof RosterUnlockRequestBody>;
