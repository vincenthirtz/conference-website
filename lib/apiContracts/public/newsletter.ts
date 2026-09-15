// Contrat de POST /api/public/newsletter/subscribe.
// Source unique handler ↔ spec (`x-zod: public.newsletterSubscribe`).

import { z } from 'zod';
import { antiBotFields } from './antiBot';

export const newsletterSubscribeBodySchema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  source: z
    .string()
    .trim()
    .max(80)
    .optional()
    .meta({
      description:
        'Provenance libre (ex. `footer`, `landing`). Défaut `public`.',
    }),
  ...antiBotFields,
});
