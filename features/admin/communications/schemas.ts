// features/admin/communications/schemas.ts — entrées des routes staff des
// campagnes email (`/api/admin/broadcast`, `/api/admin/broadcast/[campaignId]/**`).
//
// Corps et paramètres « historiques » : champs NOMMÉS pour la spec
// (`looseBody` / `looseQuery`), lus et validés par le service avec les
// messages d'origine (`name: Nom requis`, `waveSize doit être…`). Le schéma
// du formulaire reste `campaignInputSchema` (utils/campaignSchema.ts).
//
// zod seul, imports RELATIFS : référencés par la spec OpenAPI
// (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import { looseBody, looseQuery } from '../../../utils/admin/pathParams';

/** GET /api/admin/broadcast : pagination lue par le service (défaut 25). */
export const CampaignListQuery = looseQuery(['limit', 'offset']);

/** `/broadcast/[campaignId]/…` : id libre, une campagne inconnue = 404. */
export const CampaignIdQuery = looseQuery(['campaignId']);

/** GET …/preview : `label` personnalise la salutation (80 caractères). */
export const CampaignPreviewQuery = looseQuery(['campaignId', 'label']);

/** Création (POST /broadcast) et édition (PATCH /broadcast/[id]). */
export const CampaignInputDoc = looseBody([
  'name',
  'subject',
  'description',
  'audience',
  'status',
  'heading',
  'greetingEnabled',
  'bodyFormat',
  'bodyParagraphs',
  'bodyHtml',
  'ctaLabel',
  'ctaUrl',
  'footerNote',
]);

/** Envoi (POST /broadcast/[id]) : test, aperçu, diff, fenêtre. */
export const CampaignSendDoc = looseBody([
  'testTo',
  'testLabel',
  'dryRun',
  'onlyNew',
  'onlyUnsent',
  'acknowledgeUntraced',
  'limit',
  'offset',
]);

/** Programmation par vagues (POST …/schedule). */
export const CampaignScheduleDoc = looseBody(['waveSize']);

/* ---------------- Compte d'envoi, journal Brevo, email de test ---------------- */

/** POST /api/admin/test-email — destinataire, validé par le service. */
export const TestEmailDoc = looseBody(['to']);

/** GET /api/admin/email-logs — filtres relayés à Brevo. */
export const EmailLogsQuery = looseQuery([
  'limit',
  'offset',
  'email',
  'event',
  'startDate',
  'endDate',
]);

/** PUT /api/admin/email/credentials — clé Brevo + adresse d'expédition. */
export const EmailCredentialsDoc = looseBody([
  'apiKey',
  'fromEmail',
  'fromName',
]);

/* ------------------- Messages aux salons Discord des équipes ------------------ */

/** GET /api/admin/team-messages?tournamentId= (défaut : tournoi en cours). */
export const TeamMessagesQuery = looseQuery(['tournamentId']);

/** POST /api/admin/team-messages — validé par le service (400 + `details`). */
export const TeamMessagesDoc = looseBody([
  'preset',
  'template',
  'teamIds',
  'mention',
  'only',
  'tournamentId',
  'dryRun',
]);
