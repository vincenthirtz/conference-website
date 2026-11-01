// utils/processCaches.ts
//
// Registre des caches EN MÉMOIRE DU PROCESSUS (clés d'API du bot, ligne
// « gate » d'un tenant, chaînes Twitch, secrets d'intégration, réglages du
// miroir social…).
//
// POURQUOI. Un exemplaire du Worker vit un moment, et le lieu fixe des tâches
// (worker/cronHost.ts) bien plus : une valeur lue une fois peut y servir des
// minutes. Ces caches divisent le trafic vers
// Supabase (et donc ses logs facturés), à condition que chaque écriture
// connue invalide la sienne — c'est à chaque module de le faire.
//
// CE REGISTRE ne sert qu'aux tests : chaque module y inscrit sa remise à
// zéro, et `tests/unit/__helpers__/testSetup.ts` les appelle toutes avant
// chaque cas. Sans ça, un cas hériterait de ce qu'un autre a mis en cache
// alors que le store en mémoire a changé entre les deux.

const resets = new Set<() => void>();

const CLOUDFLARE_CONTEXT = Symbol.for('__cloudflare-context__');

/**
 * Une requête peut-elle attendre la lecture lancée par une autre plutôt que de faire la
 * sienne ? Sur Node, oui. Pas sur un Worker : si la requête qui a lancé la lecture se termine
 * avant elle, Cloudflare abandonne ce qui l'attend, et l'autre requête reste bloquée
 * (`handle_cross_request_promise_resolution`). Une lecture de trop vaut mieux : la lecture
 * partagée ne sert qu'en cas d'appels simultanés.
 */
export function canJoinInFlightRead(): boolean {
  return !(globalThis as Record<symbol, unknown>)[CLOUDFLARE_CONTEXT];
}

/** Inscrit la remise à zéro d'un cache. À appeler au chargement du module. */
export function registerProcessCache(reset: () => void): void {
  resets.add(reset);
}

/** Vide tous les caches inscrits. Usage strictement test. */
export function resetAllProcessCaches(): void {
  for (const reset of resets) reset();
}
