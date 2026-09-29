// features/admin/tenants/routes/helloassoCredentials.ts
// /api/admin/helloasso/credentials — compte d'encaissement HelloAsso de
// l'espace. GET état + URL de notification ; PUT relie (après vérification
// auprès de HelloAsso) ; DELETE délie.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { HelloAssoCredentialsDoc } from '../schemas';
import {
  getHelloAssoAccount,
  linkHelloAssoAccount,
  unlinkHelloAssoAccount,
} from '../service/helloasso';

const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-helloasso-creds',
  guard: { permission: 'manage_settings' },
  GET: read({
    rateLimit: LIMIT,
    handler: ({ ctx }) => getHelloAssoAccount(ctx),
  }),
  PUT: mutate({
    body: HelloAssoCredentialsDoc,
    rateLimit: LIMIT,
    // La réponse porte l'URL de notification, jeton compris : elle ne doit
    // pas rester dans le cache d'idempotence (stocké en base).
    idempotent: false,
    audit: 'store_social_credentials',
    handler: ({ body, ctx }) =>
      audited(ctx, linkHelloAssoAccount(ctx, body, ctx.staff.staff.id ?? null)),
  }),
  DELETE: mutate({
    rateLimit: LIMIT,
    audit: 'store_social_credentials',
    handler: ({ ctx }) => audited(ctx, unlinkHelloAssoAccount(ctx)),
  }),
});
