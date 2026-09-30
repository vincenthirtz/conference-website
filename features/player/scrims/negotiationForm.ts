// features/player/scrims/negotiationForm.ts — schéma du formulaire de
// contre-proposition d'un scrim en négociation (lot P13).
//
// Les valeurs sont celles du sélecteur (`ScrimSlotCalendarPicker`) : des
// chaînes `datetime-local` ('YYYY-MM-DDTHH:mm', heure locale du navigateur),
// dont des cases vides. Le schéma rend le corps envoyé : créneaux non vides,
// en ISO UTC — exactement la normalisation que le tableau de bord faisait à
// la main avant (`usePlayerDashboard`). Le serveur revalide contre la
// négociation EN COURS (`applyScrimRequestAction`).

import * as z from 'zod';

const isValidInstant = (s: string) => !Number.isNaN(new Date(s).getTime());

export function makeCounterProposalSchema(atLeastOneSlot: string) {
  return z.object({
    slots: z
      .array(z.string())
      .transform((list) => list.map((s) => s.trim()).filter(Boolean))
      .pipe(
        z
          .array(z.string())
          .min(1, atLeastOneSlot)
          .refine((list) => list.every(isValidInstant), atLeastOneSlot)
      )
      .transform((list) => list.map((s) => new Date(s).toISOString())),
  });
}

export type CounterProposalValues = { slots: string[] };
