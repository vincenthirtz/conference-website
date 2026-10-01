// features/admin/diffusion/routes/overlayPresence.ts
// GET /api/admin/diffusion/overlay-presence — `{ sources, now }`, lu par
// Diffusion › Overlays (« affichée · vue il y a 12 s »).

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getOverlayPresence } from '../service';

export default defineAdminRoute({
  key: 'diffusion-overlay-presence',
  guard: 'caster',
  GET: read({ handler: ({ ctx }) => getOverlayPresence(ctx) }),
});
