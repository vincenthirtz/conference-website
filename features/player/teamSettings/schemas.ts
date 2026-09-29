// features/player/teamSettings/schemas.ts — réglages d'ouverture d'une
// équipe gérée (recrutement, scrims). Zod seul : importé par la route, le
// registre OpenAPI (lib/apiContracts, chemins relatifs) et, demain, le client.

import { z } from 'zod';

/** `joinable` absent = bascule de l'état courant. */
export const ToggleJoinableBody = z.object({
  joinable: z.boolean().optional(),
});
export type ToggleJoinableInput = z.infer<typeof ToggleJoinableBody>;

/** `open` absent = bascule de l'état courant. */
export const ToggleScrimOpenBody = z.object({
  open: z.boolean().optional(),
});
export type ToggleScrimOpenInput = z.infer<typeof ToggleScrimOpenBody>;

export type ToggleJoinableResponse = {
  success: true;
  teamId: string;
  is_joinable: boolean;
  message: string;
};

export type ToggleScrimOpenResponse = {
  success: true;
  teamId: string;
  open_for_scrim: boolean;
  message: string;
};
