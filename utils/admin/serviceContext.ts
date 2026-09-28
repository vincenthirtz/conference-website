// utils/admin/serviceContext.ts — ce qu'un service métier reçoit (lot L7,
// docs/PLAN-industrialisation-admin.md).
//
// Un service ne connaît NI `next` NI la requête HTTP : il reçoit la base, le
// tenant et l'acteur. C'est ce qui le rend appelable depuis une route admin,
// une route bot, un cron ou un test, sans mock HTTP.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database.generated';
import type { Logger } from '@/utils/logger';

export type ServiceActor =
  | { kind: 'staff'; staffId: string; userId: string }
  | { kind: 'bot' }
  | { kind: 'system' };

/**
 * Client typé par le schéma généré (lot L5) : un `.select('colonne')` sur une
 * colonne inexistante ne compile pas, et les lignes lues sont typées.
 */
export type AdminDb = SupabaseClient<Database>;

export type ServiceContext = {
  db: AdminDb;
  /** Tenant sur lequel TOUTE lecture/écriture est scopée. Jamais optionnel. */
  tenantId: string;
  actor: ServiceActor;
  logger: Logger;
};
