// features/admin/tenants/routes/openapiSpec.ts
// GET /api/admin/docs/openapi — la spec OpenAPI complète, en `text/yaml`
// (défaut) ou `application/json` (`?format=json`), lue par le point d'entrée
// unique `utils/openapi/loadSpec.ts` (mémorisée).

import { stringify as stringifyYaml } from 'yaml';
import {
  RESPONSE_SENT,
  defineAdminRoute,
  read,
} from '@/utils/admin/defineAdminRoute';
import { LegacyAdminError } from '@/utils/admin/errors';
import { loadFullSpec } from '@/utils/openapi/loadSpec';
import { OpenApiSpecQuery } from '../schemas';

export default defineAdminRoute({
  key: 'admin-docs-openapi',
  guard: { permission: 'manage_tenant' },
  GET: read({
    query: OpenApiSpecQuery,
    cache: 'private, max-age=0, must-revalidate',
    handler: ({ query, ctx, res }) => {
      let spec: ReturnType<typeof loadFullSpec>;
      let yaml: string | null = null;
      try {
        spec = loadFullSpec();
        if (query.format !== 'json') yaml = stringifyYaml(spec);
      } catch (err) {
        ctx.logger.error('GET /api/admin/docs/openapi failed', err);
        throw new LegacyAdminError(500, 'Failed to read OpenAPI spec');
      }
      if (yaml === null) return spec;
      res.setHeader('Content-Type', 'text/yaml; charset=utf-8');
      res.status(200).send(yaml);
      return RESPONSE_SENT;
    },
  }),
});
