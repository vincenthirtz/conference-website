// features/admin/recycle-bin/routes/index.ts — /api/admin/recycle-bin
//   GET   : éléments soft-deleted (un type ou tous), paginés
//   PATCH : restaure `{ id, type }`
//   DELETE: efface DÉFINITIVEMENT `?id=&type=` — owner uniquement (garde
//           'owner' : second facteur exigé, cf. utils/staffMfa), types
//           purgeables seulement (schemas.ts), journalisé.

import {
  type AdminRouteContext,
  defineAdminRoute,
  mutate,
  read,
} from '@/utils/admin/defineAdminRoute';
import { parsePagination } from '@/utils/apiHelpers';
import { audited } from '../../_shared/audited';
import {
  RecycleBinPurgeQuery,
  RecycleBinQuery,
  RecycleBinRestoreDoc,
} from '../schemas';
import { isPlatformOwnerStaff } from '../../_shared/platformOwner';
import {
  listRecycleBin,
  purgeFromRecycleBin,
  type RecycleBinCaller,
  restoreFromRecycleBin,
} from '../service';

const callerOf = (ctx: AdminRouteContext): RecycleBinCaller => ({
  platform: isPlatformOwnerStaff(ctx.staff),
  staffId: ctx.staff.staff.id,
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
  DELETE: mutate({
    guard: 'owner',
    query: RecycleBinPurgeQuery,
    audit: 'purge_deleted_item',
    handler: ({ query, ctx }) =>
      audited(ctx, purgeFromRecycleBin(ctx, callerOf(ctx), query)),
  }),
});
