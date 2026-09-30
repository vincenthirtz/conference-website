// features/admin/diffusion/service/regieLayout.ts — mise en page de la source
// OBS `/overlay/regie` (utils/overlay/regieLayout.ts), une ligne par espace.
// Absente = la mise en page d'origine (DEFAULT_REGIE_LAYOUT).

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import {
  normalizeRegieLayout,
  type RegieLayout,
} from '@/utils/overlay/regieLayout';
import type { Audited } from '../../_shared/audited';
import type { RegieLayoutBody } from '../schemas';

const serverError = () => new AdminError(500, 'internal', 'Server error.');

async function readRaw(ctx: ServiceContext): Promise<unknown> {
  const { data, error } = await ctx.db
    .from('regie_overlay_layouts')
    .select('layout')
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (error) {
    ctx.logger.error('[admin/regie-layout] read error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  return data?.layout ?? null;
}

export async function readRegieLayout(
  ctx: ServiceContext
): Promise<{ layout: RegieLayout }> {
  return { layout: normalizeRegieLayout(await readRaw(ctx)) };
}

export async function saveRegieLayout(
  ctx: ServiceContext,
  body: z.output<typeof RegieLayoutBody>
): Promise<Audited<{ layout: RegieLayout }>> {
  const before = normalizeRegieLayout(await readRaw(ctx));
  const layout = normalizeRegieLayout(body);
  const { error } = await ctx.db.from('regie_overlay_layouts').upsert(
    {
      tenant_id: ctx.tenantId,
      layout,
      updated_at: new Date().toISOString(),
      updated_by: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
    },
    { onConflict: 'tenant_id' }
  );
  if (error) {
    ctx.logger.error('[admin/regie-layout] save error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  return {
    result: { layout },
    audit: {
      entity_type: 'regie_overlay_layout',
      before: before as unknown as Record<string, unknown>,
      after: layout as unknown as Record<string, unknown>,
    },
  };
}
