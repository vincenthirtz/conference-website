// hooks/useTeamNames.ts
//
// Résout les noms d'équipes à partir de leurs identifiants via l'endpoint
// public `/api/teams/[teamId]`. Utilisé par l'espace joueur pour afficher les
// noms des deux équipes d'une grille de disponibilités de scrim (l'API des
// plannings ne renvoie que les `team_id`).
//
// Un cache module-level évite de re-fetcher un même nom d'équipe entre le
// dashboard et la page de détail (ou entre plusieurs cartes).

import { useEffect, useState } from 'react';

const cache = new Map<string, string>();

function collectFromCache(ids: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of ids) {
    const name = cache.get(id);
    if (name) out[id] = name;
  }
  return out;
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

    Promise.all(
      missing.map(async (id) => {
        try {
          const res = await fetch(`/api/teams/${id}`);
          if (!res.ok) return;
          const data = await res.json();
          const name = data?.team?.name;
          if (typeof name === 'string' && name) cache.set(id, name);
        } catch {
          /* réseau : on laisse le fallback côté appelant */
        }
      })
    ).then(() => {
      if (!cancelled) setNames(collectFromCache(wanted));
    });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return names;
}
