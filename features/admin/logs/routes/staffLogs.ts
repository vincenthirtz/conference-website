// features/admin/logs/routes/staffLogs.ts
// GET /api/admin/logs — journal d'audit staff (JSON paginé ou `format=csv`).

import {
  RESPONSE_SENT,
  defineAdminRoute,
  read,
} from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { StaffLogsQuery } from '../schemas';
import { readStaffLogs } from '../service';
import { sendCsv } from './sendCsv';

export default defineAdminRoute({
  key: 'admin-logs',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: StaffLogsQuery,
    handler: async ({ query, ctx, req, res }) => {
      const out = await readStaffLogs(
        ctx,
        query,
        parsePagination(req, { limit: 100 })
      );
      if (out.kind === 'json') return out.body;
      sendCsv(res, out.file);
      return RESPONSE_SENT;
    },
  }),
});
