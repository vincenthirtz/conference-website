// features/admin/logs/client.ts — journaux staff, Discord et e-mails (L10).
//
// Les listes paginées restent sur `useAdminResource` (URL ci-dessous). Les
// exports CSV sont des téléchargements (blob), pas du JSON : l'écran les lit
// avec `adminFetch` sur l'URL donnée par `logsPaths.csv`.

import { adminRequest } from '@/utils/admin/adminHttp';

export const logsPaths = {
  staff: '/api/admin/logs',
  discord: '/api/admin/discord-logs',
  email: '/api/admin/email-logs',
  /** Export CSV d'un journal avec les filtres affichés. */
  csv: (base: string, filters: Record<string, string>) => {
    const params = new URLSearchParams();
    params.set('format', 'csv');
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return `${base}?${params.toString()}`;
  },
} as const;

export type TestEmailResponse = {
  success?: boolean;
  id?: string;
  error?: string;
};

export const logsClient = {
  sendTestEmail: (to: string) =>
    adminRequest<TestEmailResponse>('/api/admin/test-email', {
      method: 'POST',
      json: { to },
      idempotent: true,
    }),
};
