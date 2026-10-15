// utils/social/mirrorCache.ts
//
// Caches EN MÉMOIRE DU PROCESSUS du miroir social (cron social-mirror, toutes
// les quinze minutes).
//
// POURQUOI. Chaque passage relisait, pour CHAQUE espace actif, la liste des
// espaces, ses réglages (`site_settings`), ses comptes connectés
// (`social_accounts`, une fois pour Instagram, une fois pour TikTok) et, pour
// chaque source, les publications déjà sur le mur (`social_feed_items`) — même
// quand rien n'avait bougé, et même pour un espace qui ne miroite rien. Les
// logs Supabase se facturent à la requête (~2,75 Ko chacune) : ~1 600 lectures
// par jour pour des valeurs que seul l'admin change, ou que ce cron écrit
// lui-même.
//
// FRAÎCHEUR. Toute écriture connue de ces valeurs passe par ce processus (une
// seule instance d'API en service, cf. deploy/compose.yml) et met le cache à
// jour aussitôt : invalidation (connexion OAuth, rafraîchissement de jeton,
// réglage enregistré dans l'admin) ou mise à jour en place (curseur avancé par
// le cron, jeton TikTok rafraîchi). Le TTL ne couvre donc que les écritures
// faites HORS du processus — SQL à la main, ou l'autre couleur pendant les
// quelques secondes d'un déploiement bleu/vert.
//
// UNE ERREUR NE SE MET JAMAIS EN CACHE : le passage suivant relit. Seul un
// résultat réussi est rangé — y compris un résultat VIDE (« rien de configuré »),
// qui est justement le cas qu'il fallait rendre gratuit.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { registerProcessCache } from '@/utils/processCaches';

/**
 * TTL des réglages et des comptes connectés du miroir.
 *
 * Trente minutes, soit deux passages du cron servis depuis la mémoire sur
 * trois environ. Le TTL ne protège que des écritures faites hors du processus :
 * toutes les autres invalident tout de suite.
 */
export const MIRROR_CONFIG_TTL_MS = 30 * 60_000;

export type CacheLoad<V> =
  | { ok: true; value: V }
  | { ok: false; error: unknown };

export type MirrorCache<V> = {
  /** Valeur fraîche, ou `undefined`. Ne lit jamais la base. */
  peek(key: string): V | undefined;
  /**
   * Valeur fraîche, sinon `fetch()`. Les appels concurrents d'une même clé
   * partagent la même requête ; un échec n'est pas rangé.
   */
  load(key: string, fetch: () => Promise<CacheLoad<V>>): Promise<CacheLoad<V>>;
  /**
   * Répercute une écriture faite par ce processus SANS relire la base. Sans
   * effet si l'entrée est absente ou périmée ; une lecture en vol est, elle,
   * abandonnée — elle pourrait ranger l'état d'avant l'écriture.
   */
  update(key: string, fn: (value: V) => V): void;
  /** Oublie une clé (ou toutes). Instance courante seulement. */
  invalidate(key?: string): void;
};

export function createMirrorCache<V>(ttlMs: number): MirrorCache<V> {
  const entries = new Map<string, { value: V; expiresAt: number }>();
  const inFlight = new Map<string, Promise<CacheLoad<V>>>();
  // Génération par clé : une lecture partie AVANT une invalidation ne doit pas
  // ranger, en revenant, l'état qu'on vient justement de déclarer périmé (un
  // compte déconnecté pendant la lecture resservirait son jeton 30 minutes).
  const generations = new Map<string, number>();
  let epoch = 0;
  const stamp = (key: string) => `${epoch}:${generations.get(key) ?? 0}`;

  const invalidate = (key?: string) => {
    if (key === undefined) {
      entries.clear();
      inFlight.clear();
      generations.clear();
      epoch += 1;
      return;
    }
    entries.delete(key);
    inFlight.delete(key);
    generations.set(key, (generations.get(key) ?? 0) + 1);
  };
  registerProcessCache(() => invalidate());

  const peek = (key: string): V | undefined => {
    const hit = entries.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt > Date.now()) return hit.value;
    entries.delete(key);
    return undefined;
  };

  return {
    peek,
    load(key, fetch) {
      const hit = peek(key);
      if (hit !== undefined) return Promise.resolve({ ok: true, value: hit });
      const pending = inFlight.get(key);
      if (pending) return pending;

      const startedAt = stamp(key);
      const p = fetch()
        // Une exception (réseau) se traite comme une erreur de lecture : rien
        // n'est rangé, et l'appelant garde son repli habituel.
        .catch((error: unknown): CacheLoad<V> => ({ ok: false, error }))
        .then((res) => {
          if (res.ok && stamp(key) === startedAt) {
            entries.set(key, {
              value: res.value,
              expiresAt: Date.now() + ttlMs,
            });
          }
          return res;
        })
        .finally(() => {
          if (inFlight.get(key) === p) inFlight.delete(key);
        });
      inFlight.set(key, p);
      return p;
    },
    update(key, fn) {
      if (inFlight.has(key)) {
        invalidate(key);
        return;
      }
      const hit = entries.get(key);
      if (!hit || hit.expiresAt <= Date.now()) return;
      entries.set(key, { value: fn(hit.value), expiresAt: hit.expiresAt });
    },
    invalidate,
  };
}

/* -------------------------------------------------------------------------- */
/* Espaces actifs                                                              */
/* -------------------------------------------------------------------------- */

/**
 * La liste des espaces actifs que le cron parcourt.
 *
 * Même TTL que les réglages. Dix minutes, comme ailleurs, ne servirait à rien
 * ici : le cron repasse toutes les quinze, chaque passage aurait relu. Un espace
 * créé il y a moins de trente minutes qui configure son miroir est rattrapé par
 * `noteMirrorConfigChange` ; un espace désactivé peut, lui, être encore visité
 * pendant au plus un TTL — ses réglages ne permettent rien de plus qu'avant.
 */
const ACTIVE_TENANTS_KEY = 'active';
const activeTenants = createMirrorCache<string[]>(MIRROR_CONFIG_TTL_MS);

export async function loadActiveMirrorTenants(): Promise<CacheLoad<string[]>> {
  return activeTenants.load(ACTIVE_TENANTS_KEY, async () => {
    if (!supabaseAdmin)
      return { ok: false, error: 'supabase_admin_unavailable' };
    const { data, error } = await supabaseAdmin
      .from('tenants')
      .select('id')
      .eq('is_active', true);
    if (error) {
      logger.error(
        '[mirrorCache] lecture des espaces actifs impossible',
        error
      );
      return { ok: false, error };
    }
    return {
      ok: true,
      value: ((data ?? []) as Array<{ id: string }>).map((t) => t.id),
    };
  });
}

/** Oublie la liste des espaces actifs. Instance courante seulement. */
export function invalidateActiveMirrorTenants(): void {
  activeTenants.invalidate();
}

/**
 * À appeler quand la configuration du miroir d'un espace change (réglage,
 * compte connecté). Si l'espace n'est pas dans la liste en cache — créé depuis
 * le dernier chargement —, la liste est relue au prochain passage : sans ça, un
 * salon tout juste configuré attendrait jusqu'à trente minutes.
 */
export function noteMirrorConfigChange(tenantId: string): void {
  const list = activeTenants.peek(ACTIVE_TENANTS_KEY);
  if (list && !list.includes(tenantId)) activeTenants.invalidate();
}
