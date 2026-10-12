// pages/api/public/tcg/live.ts
//
// GET — le TCG « en action » pour la page publique `/tcg` : derniers tirages
// rares, classement des collectionneuses, carte de la semaine
// (`utils/tcg/live.ts`, affichés par `components/tcg/live/`).
//
// POURQUOI UNE ROUTE ET PAS `getStaticProps`. Les blocs s'insèrent dans
// `/tcg` par un composant autonome (`<TcgLiveSections />`), sans toucher au
// chargement de la page ; et « derniers tirages » vieillit en minutes, là où
// la page est régénérée toutes les cinq. Une route en cache CDN court sert le
// même contenu à toutes les visiteuses sans relire la base à chaque vue.
//
// AUCUNE DONNÉE PERSONNELLE HORS CONSENTEMENT : un nom n'apparaît que pour une
// joueuse dont la vitrine est ACTIVE dans cet espace ; aucun identifiant de
// compte, aucun horodatage (âge en heures). Cf. l'en-tête de `utils/tcg/live.ts`.
//
// Le `Cache-Control` public n'est posé que sur un 200 : posé par le socle, il
// partirait aussi sur un 429, que le CDN servirait alors à tout le monde.

import {
  definePublicRoute,
  publicMethod,
} from '@/utils/player/definePublicRoute';
import { readTcgLive, type TcgLiveResponse } from '@/utils/tcg/live';

/** Cache CDN : court, les tirages bougent ; `swr` absorbe les pics. */
export const TCG_LIVE_CACHE_CONTROL =
  'public, s-maxage=120, stale-while-revalidate=600';

export default definePublicRoute({
  key: 'tcg-live',
  rateLimits: [{ max: 60, windowMs: 60_000, key: 'tcg-live' }],
  antiBot: false,
  GET: publicMethod({
    cache: false,
    handler: async ({ ctx, res }): Promise<TcgLiveResponse> => {
      const body = await readTcgLive(ctx.tenantId);
      res.setHeader('Cache-Control', TCG_LIVE_CACHE_CONTROL);
      return body;
    },
  }),
});
