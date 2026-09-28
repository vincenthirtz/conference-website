// features/admin/diffusion/routes/liveStatus.ts — GET /api/admin/diffusion/live-status
//
// POURQUOI UNE ROUTE À PART. `/api/caster/runs/current` exige une fiche
// casteuse ; `/api/events/current` résout l'espace par le chemin de l'URL —
// faux pour un staff qui travaille sur un autre espace ;
// `/api/admin/broadcast/state` est soumise au palier « régie vidéo ». Ici :
// tout le staff, l'espace DU staff, une ligne lue, deux champs rendus.

import { defineAdminRoute, read } from '@/utils/admin/defineAdminRoute';
import { getLiveStatus } from '../service';

export default defineAdminRoute({
  key: 'diffusion-live-status',
  guard: 'caster',
  GET: read({ handler: ({ ctx }) => getLiveStatus(ctx) }),
});
