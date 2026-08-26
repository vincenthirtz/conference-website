// utils/campaignSchema.ts
// Validation (zod) du formulaire de création / édition d'une campagne email.
// Partagé entre POST /api/admin/broadcast (créer) et PATCH /api/admin/broadcast/[id]
// (éditer).
//
// Deux modes de rédaction du corps (`bodyFormat`) :
//   - 'structured' (défaut) : template assemblé depuis heading + paragraphes +
//     CTA + note de pied, chaque champ échappé au rendu ;
//   - 'html' : `bodyHtml` porte le corps de la carte. Il n'est PAS validé ici
//     balise par balise — c'est `sanitizeEmailHtml` (allowlist) qui tranche au
//     rendu. Zod se limite à exiger un contenu non vide et borné.
//
// `heading` reste requis dans les deux modes : il sert d'étiquette de la
// campagne dans l'admin et de titre de repli.

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
        'tournament-captains-incomplete-roster',
        'team-members-without-discord',
        'newsletter',
        'all-plus-newsletter',
        'adherents-plus-newsletter',
      ])
      .optional()
      .default('all-confirmed-users'),
    status: z.enum(['draft', 'active', 'archived']).optional().default('draft'),
    heading: z.string().trim().min(1, 'Titre requis').max(160),
    greetingEnabled: z.boolean().optional().default(true),
    bodyFormat: z.enum(['structured', 'html']).optional().default('structured'),
    bodyParagraphs: z
      .array(z.string().trim().min(1).max(4000))
      .max(20)
      .optional()
      .default([]),
    bodyHtml: z.string().trim().max(100_000).nullish(),
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
  })
  // Le corps requis dépend du mode : au moins un paragraphe en 'structured',
  // du HTML non vide en 'html'. Une campagne au corps vide partirait sinon à
  // toute une audience sous forme de carte blanche.
  .refine((d) => d.bodyFormat !== 'structured' || d.bodyParagraphs.length > 0, {
    message: 'Au moins un paragraphe',
    path: ['bodyParagraphs'],
  })
  .refine((d) => d.bodyFormat !== 'html' || Boolean(d.bodyHtml?.trim()), {
    message: 'Le corps HTML ne peut pas être vide.',
    path: ['bodyHtml'],
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
