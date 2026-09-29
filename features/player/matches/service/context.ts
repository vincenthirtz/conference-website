// features/player/matches/service/context.ts — ce que reçoit un service du
// module : la base, le tenant et le SUJET (appelante, ou membre inspecté).

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';

export type MatchesCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  userId: string;
};
