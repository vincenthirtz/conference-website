// features/admin/recycle-bin/routes/index.ts — /api/admin/recycle-bin
//   GET   : éléments soft-deleted (un type ou tous), paginés
//   PATCH : restaure `{ id, type }`

import {
  type AdminRouteContext,
  defineAdminRoute,
  mutate,
  read,
} from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import { RecycleBinQuery, RecycleBinRestoreDoc } from '../schemas';
import { isPlatformOwnerStaff } from '../../_shared/platformOwner';
import {
  listRecycleBin,
  type RecycleBinCaller,
  restoreFromRecycleBin,
} from '../service';

const callerOf = (ctx: AdminRouteContext): RecycleBinCaller => ({
  platform: isPlatformOwnerStaff(ctx.staff),
});

export default defineAdminRoute({
  key: 'recycle-bin',
  guard: { permission: 'manage_settings' },
  GET: read({
    query: RecycleBinQuery,
    handler: ({ query, ctx, req }) =>
      listRecycleBin(
        ctx,
        callerOf(ctx),
        query,
        parsePagination(req, { limit: 50 })
      ),
  }),
  PATCH: mutate({
    body: RecycleBinRestoreDoc,
    // Ex-`other` + `payload.action_label: 'restore_item'` (payload conservé).
    audit: 'restore_deleted_item',
    handler: ({ body, ctx }) =>
      audited(ctx, restoreFromRecycleBin(ctx, callerOf(ctx), body)),
  }),
});
