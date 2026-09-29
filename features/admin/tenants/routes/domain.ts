// features/admin/tenants/routes/domain.ts — /api/admin/tenants/[id]/domain
//   GET  : état du domaine propre + enregistrements DNS à créer.
//   POST : vérification maintenant (le TXT est la preuve).
// Garde `caster`, puis admin+ effectif ou staff rattaché (service).

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { IdQuery } from '../schemas';
import { staffScope } from '../service/scope';
import { getDomain, verifyDomain } from '../service/settings';

const LIMIT = { max: 20, windowMs: 60_000 };

export default defineAdminRoute({
  key: 'admin-tenant-domain',
  guard: 'caster',
  GET: read({
    query: IdQuery,
    rateLimit: LIMIT,
    handler: ({ ctx, req }) =>
      getDomain(ctx, staffScope(ctx.staff), req.query.id),
  }),
  POST: mutate({
    query: IdQuery,
    rateLimit: LIMIT,
    // Constat DNS à l'instant : un rejeu depuis le cache mentirait.
    idempotent: false,
    audit: 'verify_custom_domain',
    handler: ({ ctx, req }) =>
      audited(ctx, verifyDomain(ctx, staffScope(ctx.staff), req.query.id)),
  }),
});
