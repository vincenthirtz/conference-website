// utils/processCaches.ts
//
// Registre des caches EN MÉMOIRE DU PROCESSUS (clés d'API du bot, ligne
// « gate » d'un tenant, chaînes Twitch, secrets d'intégration, réglages du
// miroir social…).
//
// POURQUOI. L'API est un serveur persistant depuis la bascule sur Lightsail :
// une valeur lue une fois peut servir des minutes, là où une lambda Netlify
// repartait de zéro à chaque appel. Ces caches divisent le trafic vers
// Supabase (et donc ses logs facturés), à condition que chaque écriture
// connue invalide la sienne — c'est à chaque module de le faire.
//
// CE REGISTRE ne sert qu'aux tests : chaque module y inscrit sa remise à
// zéro, et `tests/unit/__helpers__/testSetup.ts` les appelle toutes avant
// chaque cas. Sans ça, un cas hériterait de ce qu'un autre a mis en cache
// alors que le store en mémoire a changé entre les deux.

const resets = new Set<() => void>();

/** Inscrit la remise à zéro d'un cache. À appeler au chargement du module. */
export function registerProcessCache(reset: () => void): void {
  resets.add(reset);
}

/** Vide tous les caches inscrits. Usage strictement test. */
export function resetAllProcessCaches(): void {
  for (const reset of resets) reset();
}
