// hooks/useTeamNames.ts
//
// Résout les noms d'équipes à partir de leurs identifiants via la lecture
// groupée `GET /api/teams?ids=a,b,c`. Utilisé par l'espace joueur pour afficher
// les noms des deux équipes d'une grille de disponibilités de scrim (l'API des
// plannings ne renvoie que les `team_id`).
//
// Avant : un `GET /api/teams/:id` PAR identifiant — deux requêtes par grille
// affichée sur le tableau de bord. Désormais une requête par lot.
//
// Un cache module-level évite de re-fetcher un même nom d'équipe entre le
// dashboard et la page de détail (ou entre plusieurs cartes).

import { useEffect, useState } from 'react';

const cache = new Map<string, string>();

/**
 * Requêtes en vol, par URL. Plusieurs cartes du tableau de bord montent en même
 * temps avec les mêmes équipes : sans ce partage, chacune relancerait la même
 * lecture avant que la première n'ait rempli le cache.
 */
const inflight = new Map<string, Promise<void>>();

/**
 * Taille d'un lot. DOIT rester ≤ `MAX_TEAM_IDS` de `pages/api/teams/index.ts`
 * (non importé : ce module part dans le bundle client, la route importe
 * `supabaseAdmin`). Au-delà, le serveur refuserait le lot entier.
 */
export const TEAM_NAMES_BATCH_SIZE = 50;

// Même motif que `isValidUUID` (utils/apiHelpers, côté serveur). Filtré ICI
// parce que le serveur refuse le lot entier sur un seul identifiant invalide :
// une valeur corrompue ne doit pas priver les autres cartes de leurs noms.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function collectFromCache(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const name = cache.get(id);
    if (name) out[id] = name;
  }
  return out;
}

/**
 * URL d'un lot. Identifiants TRIÉS : deux composants qui demandent les mêmes
 * équipes dans un ordre différent partagent la même entrée du cache CDN (qui
 * varie sur toute la query string) et la même requête en vol.
 */
export function buildTeamNamesUrl(ids: readonly string[]): string {
  const sorted = [...ids].sort();
  return `/api/teams?ids=${sorted.map(encodeURIComponent).join(',')}`;
}

/**
 * Charge dans le cache module les noms des identifiants absents. Une requête
 * par lot de `TEAM_NAMES_BATCH_SIZE`, jamais une par équipe. Ne jette jamais :
 * en cas d'échec, l'appelant garde son libellé de repli.
 *
 * Exporté pour les tests (pas de jsdom dans ce harnais) ; le hook reste l'API
 * publique.
 */
export async function loadTeamNames(
  ids: readonly string[],
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  const missing = Array.from(new Set(ids)).filter(
    (id) => UUID_RE.test(id) && !cache.has(id)
  );
  if (missing.length === 0) return;

  const batches: string[][] = [];
  for (let i = 0; i < missing.length; i += TEAM_NAMES_BATCH_SIZE) {
    batches.push(missing.slice(i, i + TEAM_NAMES_BATCH_SIZE));
  }

  await Promise.all(
    batches.map((batch) => {
      const url = buildTeamNamesUrl(batch);
      const pending = inflight.get(url);
      if (pending) return pending;

      const request = (async () => {
        try {
          const res = await fetchImpl(url);
          if (!res.ok) return;
          const data = await res.json();
          const teams = Array.isArray(data?.teams) ? data.teams : [];
          for (const team of teams) {
            if (
              typeof team?.id === 'string' &&
              typeof team?.name === 'string' &&
              team.name
            ) {
              cache.set(team.id, team.name);
            }
          }
        } catch {
          /* réseau : on laisse le fallback côté appelant */
        } finally {
          inflight.delete(url);
        }
      })();
      inflight.set(url, request);
      return request;
    })
  );
}

/** Réservé aux tests : repart d'un cache vide. */
export function __resetTeamNamesCacheForTests(): void {
  cache.clear();
  inflight.clear();
}

/**
 * Renvoie une map `{ [teamId]: name }` pour les ids fournis (les `null` /
 * `undefined` sont ignorés). Les noms manquants sont chargés en tâche de fond
 * et le composant se re-render quand ils arrivent.
 */
export function useTeamNames(
  ids: (string | null | undefined)[]
): Record<string, string> {
  const unique = Array.from(new Set(ids.filter((v): v is string => !!v)));
  const key = unique.join(',');

  const [names, setNames] = useState<Record<string, string>>(() =>
    collectFromCache(unique)
  );

  useEffect(() => {
    let cancelled = false;
    const wanted = key ? key.split(',') : [];
    const missing = wanted.filter((id) => !cache.has(id));

    if (missing.length === 0) {
      setNames(collectFromCache(wanted));
      return;
    }

    void loadTeamNames(missing).then(() => {
      if (!cancelled) setNames(collectFromCache(wanted));
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
}
