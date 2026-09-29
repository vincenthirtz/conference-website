// features/player/tcg/service/context.ts — ce que reçoit un service TCG
// joueuse : la base, le tenant du sujet, la joueuse. Pas de HTTP.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';

export type TcgServiceContext = {
  db: AdminDb;
  tenantId: string;
  /** La joueuse dont on lit (ou modifie) le TCG — le sujet de la requête. */
  userId: string;
  logger: Logger;
};
