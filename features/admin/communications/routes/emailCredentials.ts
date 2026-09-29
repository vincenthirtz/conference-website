// features/admin/communications/routes/emailCredentials.ts
// /api/admin/email/credentials — compte d'envoi Brevo DE L'ESPACE.
// GET dit si l'envoi est configuré (jamais la clé) ; PUT enregistre clé +
// adresse après vérification auprès de Brevo ; DELETE retire le compte.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { EmailCredentialsDoc } from '../schemas';
import {
  clearEmailCredentials,
  getEmailCredentials,
  storeEmailCredentials,
} from '../service/email';

const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-email-creds',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => getEmailCredentials(ctx),
  }),
  PUT: mutate({
    body: EmailCredentialsDoc,
    rateLimit: LIMIT,
    audit: 'store_social_credentials',
    handler: ({ body, ctx }) => audited(ctx, storeEmailCredentials(ctx, body)),
  }),
  DELETE: mutate({
    rateLimit: LIMIT,
    audit: 'store_social_credentials',
    handler: ({ ctx }) => audited(ctx, clearEmailCredentials(ctx)),
  }),
});
