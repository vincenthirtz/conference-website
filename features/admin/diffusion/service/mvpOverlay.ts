// features/admin/diffusion/service/mvpOverlay.ts — réglages du sondage
// « coup de cœur du public » dans la source OBS `/overlay/regie`, et son TEST.
//
// Une ligne par espace (`public_mvp_overlay_settings`), créée au premier
// enregistrement ; absente = défauts. Le TEST n'écrit que deux horodatages :
// le faux vote est calculé à l'affichage (utils/overlay/publicMvpDemo.ts),
// aucune voix n'est créée.

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { AdminError } from '@/utils/admin/errors';
import { DEMO_TOTAL_MS } from '@/utils/overlay/publicMvpDemo';
import { DEFAULT_PUBLIC_WINDOW_MINUTES } from '@/utils/mvp/publicVote';
import type { Audited } from '../../_shared/audited';
import type {
  MvpOverlaySettings,
  MvpOverlaySettingsBody,
  MvpOverlayState,
  MvpOverlayTestBody,
} from '../schemas';

export type { MvpOverlaySettings, MvpOverlayState } from '../schemas';

export const DEFAULT_MVP_OVERLAY_SETTINGS: MvpOverlaySettings = {
  window_minutes: DEFAULT_PUBLIC_WINDOW_MINUTES,
  position: 'top',
  show_sources: true,
};

const COLUMNS =
  'window_minutes, position, show_sources, demo_started_at, demo_until' as const;
const serverError = () => new AdminError(500, 'internal', 'Server error.');

function stateOf(
  row: {
    window_minutes: number;
    position: string;
    show_sources: boolean;
    demo_until: string | null;
  } | null,
  nowMs: number
): MvpOverlayState {
  const until = row?.demo_until ?? null;
  const position =
    row?.position === 'center' || row?.position === 'bottom'
      ? row.position
      : 'top';
  return {
    settings: row
      ? {
          window_minutes: row.window_minutes,
          position,
          show_sources: row.show_sources,
        }
      : DEFAULT_MVP_OVERLAY_SETTINGS,
    demo: {
      active: !!until && new Date(until).getTime() > nowMs,
      until,
    },
  };
}

async function readRow(ctx: ServiceContext) {
  const { data, error } = await ctx.db
    .from('public_mvp_overlay_settings')
    .select(COLUMNS)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (error) {
    ctx.logger.error('[admin/mvp-overlay] read error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  return data;
}

export async function readMvpOverlay(
  ctx: ServiceContext
): Promise<MvpOverlayState> {
  return stateOf(await readRow(ctx), Date.now());
}

export async function saveMvpOverlaySettings(
  ctx: ServiceContext,
  body: z.output<typeof MvpOverlaySettingsBody>
): Promise<Audited<MvpOverlayState>> {
  const before = await readRow(ctx);
  const { error } = await ctx.db.from('public_mvp_overlay_settings').upsert(
    {
      tenant_id: ctx.tenantId,
      ...body,
      updated_at: new Date().toISOString(),
      updated_by: ctx.actor.kind === 'staff' ? ctx.actor.staffId : null,
    },
    { onConflict: 'tenant_id' }
  );
  // Relu plutôt que `RETURNING` : une seule forme de lecture pour les trois
  // gestes, et la ligne telle que la base la garde (défauts compris).
  const data = error ? null : await readRow(ctx);
  if (error || !data) {
    ctx.logger.error('[admin/mvp-overlay] save error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  return {
    result: stateOf(data, Date.now()),
    audit: {
      entity_type: 'mvp_overlay_settings',
      before: before
        ? {
            window_minutes: before.window_minutes,
            position: before.position,
            show_sources: before.show_sources,
          }
        : null,
      after: body,
    },
  };
}

/**
 * Lance (pour DEMO_TOTAL_MS) ou arrête le TEST. Idempotent : relancer un test
 * en cours le reprend du début.
 */
export async function runMvpOverlayTest(
  ctx: ServiceContext,
  body: z.output<typeof MvpOverlayTestBody>
): Promise<MvpOverlayState> {
  const now = Date.now();
  const patch =
    body.action === 'test-start'
      ? {
          demo_started_at: new Date(now).toISOString(),
          demo_until: new Date(now + DEMO_TOTAL_MS).toISOString(),
        }
      : { demo_started_at: null, demo_until: null };
  const { error } = await ctx.db.from('public_mvp_overlay_settings').upsert(
    {
      tenant_id: ctx.tenantId,
      ...patch,
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: 'tenant_id' }
  );
  // Relu plutôt que `RETURNING` : une seule forme de lecture pour les trois
  // gestes, et la ligne telle que la base la garde (défauts compris).
  const data = error ? null : await readRow(ctx);
  if (error || !data) {
    ctx.logger.error('[admin/mvp-overlay] test error', null, {
      tenantId: ctx.tenantId,
    });
    throw serverError();
  }
  return stateOf(data, now);
}
