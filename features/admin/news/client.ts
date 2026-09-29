// features/admin/news/client.ts — appels typés des fiches actualité
// (création, édition ; lot L10). Les URLs de l'API vivent ICI.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { NewsPayload } from './schemas';
import type { createNews, getNews, updateNews } from './service';

const BASE = '/api/admin/news';

export type NewsItem = Awaited<ReturnType<typeof getNews>>;
export type NewsCreated = Awaited<ReturnType<typeof createNews>>;
export type NewsUpdated = Awaited<ReturnType<typeof updateNews>>['row'];

const byId = (id: string) => `${BASE}/${encodeURIComponent(id)}`;

export const newsClient = {
  get: (id: string) => adminRequest<NewsItem>(byId(id)),
  create: (body: NewsPayload) =>
    adminRequest<NewsCreated>(BASE, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  /** Remplacement complet (PUT), comme l'écran l'a toujours envoyé. */
  update: (id: string, body: NewsPayload) =>
    adminRequest<NewsUpdated>(byId(id), {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
};
