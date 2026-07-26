// utils/campaignSchema.ts
// Validation (zod) du formulaire de création / édition d'une campagne email.
// Partagé entre POST /api/admin/broadcast (créer) et PATCH /api/admin/broadcast/[id]
// (éditer). Le corps est un template structuré — pas de HTML libre.

import { z } from 'zod';

export const campaignInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Nom requis').max(120),
    subject: z.string().trim().min(1, 'Objet requis').max(200),
    description: z.string().trim().max(500).optional().default(''),
    audience: z
      .enum([
        'all-confirmed-users',
        'team-captains',
        'team-members',
        'staff',
        'adherents',
        'tournament-never-logged-in',
        'newsletter',
        'all-plus-newsletter',
        'adherents-plus-newsletter',
      ])
      .optional()
      .default('all-confirmed-users'),
    status: z.enum(['draft', 'active', 'archived']).optional().default('draft'),
    heading: z.string().trim().min(1, 'Titre requis').max(160),
    greetingEnabled: z.boolean().optional().default(true),
    bodyParagraphs: z
      .array(z.string().trim().min(1).max(4000))
      .min(1, 'Au moins un paragraphe')
      .max(20),
    ctaLabel: z.string().trim().max(60).nullish(),
    ctaUrl: z
      .string()
      .trim()
      .max(500)
      .regex(/^https?:\/\//i, 'URL doit commencer par http:// ou https://')
      .nullish(),
    footerNote: z.string().trim().max(300).nullish(),
  })
  .refine((d) => Boolean(d.ctaLabel) === Boolean(d.ctaUrl), {
    message: 'Le libellé et l’URL du bouton doivent être fournis ensemble.',
    path: ['ctaUrl'],
  });

export type CampaignInput = z.infer<typeof campaignInputSchema>;

/**
 * Slug stable (kebab-case, sans accents) dérivé du nom — sert d'id de campagne.
 * L'unicité est garantie côté endpoint (suffixe -2, -3… si collision).
 */
export function slugifyCampaignName(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // diacritiques combinants
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return base || 'campagne';
}
