// Champs anti-bot communs aux formulaires publics sans compte.

import { z } from 'zod';

export const antiBotFields = {
  honeypot: z
    .string()
    .optional()
    .meta({ description: 'Doit être vide (anti-bot).' }),
  captchaToken: z.string().optional(),
  captchaAnswer: z.string().optional(),
};
