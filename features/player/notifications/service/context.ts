// features/player/notifications/service/context.ts — contexte des services
// de notifications (lot P15).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';

export type NotificationsCtx = {
  db: AdminDb;
  /** Tenant du SUJET (inspection : tenant actif du staff). */
  tenantId: string;
  logger: Logger;
  /** Le sujet — l'appelante, ou la joueuse inspectée (compteurs seulement). */
  userId: string;
};
