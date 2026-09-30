// features/admin/diffusion/routes/mvpOverlay.ts —
// GET/PUT/POST /api/admin/diffusion/mvp-overlay : le sondage « coup de cœur
// du public » dans la source OBS `/overlay/regie`.
//   - GET : réglages + test en cours (la régie, casteuses comprises) ;
//   - PUT : réglages (durée par défaut, position, détail par plateforme) —
//     `manage_broadcast`, comme les réglages de la boîte d'alertes ;
//   - POST : lancer / arrêter le TEST (faux vote à l'écran, aucune voix
//     écrite) — la régie, comme l'ouverture d'un vrai vote.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { MvpOverlaySettingsBody, MvpOverlayTestBody } from '../schemas';
import {
  readMvpOverlay,
  runMvpOverlayTest,
  saveMvpOverlaySettings,
} from '../service/mvpOverlay';

export default defineAdminRoute({
  key: 'diffusion-mvp-overlay',
  guard: 'caster',
  GET: read({
    handler: ({ ctx }) => readMvpOverlay(ctx),
  }),
  PUT: mutate({
    guard: { permission: 'manage_broadcast' },
    body: MvpOverlaySettingsBody,
    rateLimit: { max: 30, windowMs: 60_000 },
    audit: 'update_mvp_overlay_settings',
    handler: ({ body, ctx }) => audited(ctx, saveMvpOverlaySettings(ctx, body)),
  }),
  POST: mutate({
    body: MvpOverlayTestBody,
    // Un clic répété relance le test : rien à tracer, rien à protéger au-delà.
    rateLimit: { max: 20, windowMs: 60_000 },
    audit: false,
    handler: ({ body, ctx }) => runMvpOverlayTest(ctx, body),
  }),
});
