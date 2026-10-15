// utils/siteSettingsCache.ts
//
// Cache en mémoire du processus de quelques réglages `site_settings`, par
// (tenant_id, key).
//
// POURQUOI. Trois réglages relus sans cesse pour une valeur qui ne bouge
// presque jamais (24 h mesurées) :
//   - `team_roles` (permissions des rôles d'équipe, à chaque action de
//     gestion d'équipe et chaque notification ciblée) : 268 GET/jour ;
//   - `bot_maintenance_mode` (chaque écriture du bot, cache de 30 s) :
//     102 GET/jour ;
//   - `seasonal_logos` (logo d'événement de la navbar) : 59 GET/jour.
// Chaque GET coûte une ligne de logs Supabase. Ici : une lecture par réglage
// et par espace au plus toutes les dix minutes.
//
// FRAÎCHEUR. Les écritures de ces clés passent toutes par ce processus et
// invalident aussitôt (`invalidateSiteSetting`) :
//   - utils/siteSettings.ts (`setSetting`, `deleteSetting`) ;
//   - features/admin/site-settings/repository.ts (écran des réglages : clés
//     libres — dont `bot_maintenance_mode` —, rôles d'équipe) ;
//   - la purge d'un espace (pages/api/cron/tenant-purge.ts).
// Le TTL ne couvre qu'une écriture faite hors du processus (SQL à la main).
//
// RÈGLE D'USAGE. Ne passer par ce cache QUE pour une clé dont tous les
// écrivains invalident. Les clés du miroir social (`bluesky_mirror_*`,
// `youtube_channel_id`, curseurs…) ont leur propre instantané
// (utils/social/feedMirror.ts) et n'y passent pas.
//
// CE QUI N'EST PAS MIS EN CACHE : une erreur de lecture (chaque appelant garde
// son repli et la tentative suivante relit). Une valeur ABSENTE, elle, se
// cache : c'est un état normal (le défaut du code s'applique), et l'écriture
// qui la crée invalide.
//
// COURSE. Une lecture partie avant une invalidation et revenue après n'entre
// pas dans le cache (compteur de génération) : elle pourrait rapporter la
// valeur d'avant l'écriture et la figer dix minutes.
//
// Module PUR (aucune dépendance serveur) : utils/teamRoles.ts, recopié côté
// site, s'en sert avec le client qu'on lui passe.

import { registerProcessCache } from './processCaches';

export const SITE_SETTING_CACHE_TTL_MS = 10 * 60_000;

export type SiteSettingLookup =
  | { ok: true; value: string | null }
  | { ok: false; error: unknown };

type Entry = { value: string | null; expiresAt: number };

/** tenant_id → (key → valeur). Deux niveaux : la purge d'un espace vide le sien. */
const cache = new Map<string, Map<string, Entry>>();
const inFlight = new Map<string, Map<string, Promise<SiteSettingLookup>>>();
let generation = 0;

function resetAll(): void {
  generation += 1;
  cache.clear();
  inFlight.clear();
}
registerProcessCache(resetAll);

/**
 * Oublie un réglage d'un espace, tous les réglages d'un espace, ou tout.
 * Instance courante seulement.
 */
export function invalidateSiteSetting(tenantId?: string, key?: string): void {
  if (!tenantId) {
    resetAll();
    return;
  }
  generation += 1;
  if (key) {
    cache.get(tenantId)?.delete(key);
    inFlight.get(tenantId)?.delete(key);
  } else {
    cache.delete(tenantId);
    inFlight.delete(tenantId);
  }
}

/**
 * Valeur d'un réglage, servie depuis le cache si fraîche, sinon lue une fois
 * par `load` (lecture partagée entre appels concurrents). `load` doit rendre
 * `{ ok: false }` sur une erreur de lecture, jamais `{ ok: true, value: null }`.
 */
export async function readSiteSettingCached(
  tenantId: string,
  key: string,
  load: () => Promise<SiteSettingLookup>
): Promise<SiteSettingLookup> {
  const hit = cache.get(tenantId)?.get(key);
  if (hit && hit.expiresAt > Date.now()) return { ok: true, value: hit.value };

  const pending = inFlight.get(tenantId)?.get(key);
  if (pending) return pending;

  const startedAt = generation;
  const p = load()
    .then((lookup) => {
      if (lookup.ok && generation === startedAt) {
        let byKey = cache.get(tenantId);
        if (!byKey) {
          byKey = new Map();
          cache.set(tenantId, byKey);
        }
        byKey.set(key, {
          value: lookup.value,
          expiresAt: Date.now() + SITE_SETTING_CACHE_TTL_MS,
        });
      }
      return lookup;
    })
    .finally(() => {
      const byKey = inFlight.get(tenantId);
      if (byKey?.get(key) === p) byKey.delete(key);
    });

  let pendingByKey = inFlight.get(tenantId);
  if (!pendingByKey) {
    pendingByKey = new Map();
    inFlight.set(tenantId, pendingByKey);
  }
  pendingByKey.set(key, p);
  return p;
}
