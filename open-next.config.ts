// open-next.config.ts — build Cloudflare (OpenNext), docs/CLOUDFLARE.md.
//
// Cache des pages : R2, précédé d'un cache régional (Cache API) en mode
// « long-lived » pour servir les pages chaudes sans aller jusqu'à R2.
// Régénération ISR par une file sur Durable Object. Une page déjà en cache
// est servie sans démarrer Next.
//
// @opennextjs/cloudflare n'est installé que par la CI Cloudflare
// (.github/workflows/cloudflare.yml) : ce fichier est exclu du tsconfig.
import { defineCloudflareConfig } from '@opennextjs/cloudflare';
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache';
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache';
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue';

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: 'long-lived',
  }),
  queue: doQueue,
  enableCacheInterception: true,
});
