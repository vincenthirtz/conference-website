// lib/bracket/buildGraph.ts
// Construction d'un graphe de bracket à partir des matchs
// (utilise directement les liens next_match_win_id / next_match_lose_id).

import type { BracketSide } from '@/types/admin';
import type {
  MatchForGraph,
  BracketMatchNode,
  BracketGraph,
  BracketColumn,
  BracketColumnsByKey,
} from '@/types/bracket';

export type { BracketSide } from '@/types/admin';
export type {
  MatchForGraph,
  BracketMatchNode,
  BracketGraph,
} from '@/types/bracket';

/* -----------------------------------------------------------
 * Construction du graphe brut
 * ---------------------------------------------------------*/

/**
 * Construit un graphe de bracket à partir des matchs fournis.
 * On ne touche pas à la base, on travaille uniquement en mémoire.
 */
export function buildBracketGraph(matches: MatchForGraph[]): BracketGraph {
  const nodes: Record<string, BracketMatchNode> = {};

  // 1) Créer tous les nodes
  for (const m of matches) {
    nodes[m.id] = {
      id: m.id,
      tournamentId: m.tournament_id,
      side: m.bracket_side,
      groupKey: m.group_key,
      roundNumber: m.round_number,
      nextWinId: m.next_match_win_id,
      nextLoseId: m.next_match_lose_id,
      incomingFrom: [],
      outgoingTo: [],
    };
  }

  // 2) Construire les arcs incoming/outgoing en fonction des liens next_match_*
  for (const m of matches) {
    const node = nodes[m.id];
    if (!node) continue;

    if (m.next_match_win_id && nodes[m.next_match_win_id]) {
      node.outgoingTo.push(m.next_match_win_id);
      nodes[m.next_match_win_id].incomingFrom.push(m.id);
    }

    if (m.next_match_lose_id && nodes[m.next_match_lose_id]) {
      node.outgoingTo.push(m.next_match_lose_id);
      nodes[m.next_match_lose_id].incomingFrom.push(m.id);
    }
  }

  // 3) Calculer roots / leaves par side+group
  const rootsBySideAndGroup: Record<string, string[]> = {};
  const leavesBySideAndGroup: Record<string, string[]> = {};

  const pushMap = (map: Record<string, string[]>, key: string, id: string) => {
    if (!map[key]) map[key] = [];
    map[key].push(id);
  };

  for (const node of Object.values(nodes)) {
    const key = makeSideGroupKey(node.side, node.groupKey);

    if (node.incomingFrom.length === 0) {
      pushMap(rootsBySideAndGroup, key, node.id);
    }
    if (node.outgoingTo.length === 0) {
      pushMap(leavesBySideAndGroup, key, node.id);
    }
  }

  return {
    nodes,
    rootsBySideAndGroup,
    leavesBySideAndGroup,
  };
}

/* -----------------------------------------------------------
 * Construction de colonnes exploitable par le front
 * ---------------------------------------------------------*/

export type { BracketColumn, BracketColumnsByKey } from '@/types/bracket';

/**
 * Construit des colonnes de bracket par side+group à partir du graphe.
 *
 * - On utilise les roots comme point de départ.
 * - BFS layer par layer (profondeur dans le graphe).
 * - round_number est utilisé comme hint pour ordonner les colonnes,
 *   mais n'est pas obligatoire.
 */
export function buildColumnsBySideAndGroup(
  graph: BracketGraph
): BracketColumnsByKey {
  const result: BracketColumnsByKey = {};

  for (const sideGroupKey of Object.keys(graph.rootsBySideAndGroup)) {
    const rootIds = graph.rootsBySideAndGroup[sideGroupKey] || [];
    if (rootIds.length === 0) {
      result[sideGroupKey] = [];
      continue;
    }

    // BFS "par couches"
    const visited = new Set<string>();
    const layers: string[][] = [];

    let currentLayer = rootIds.slice();

    while (currentLayer.length > 0) {
      const nextLayer: string[] = [];
      const layerIds: string[] = [];

      for (const id of currentLayer) {
        if (visited.has(id)) continue;
        visited.add(id);
        layerIds.push(id);

        const node = graph.nodes[id];
        if (!node) continue;

        for (const outId of node.outgoingTo) {
          const outNode = graph.nodes[outId];
          if (!outNode) continue;

          const key = makeSideGroupKey(outNode.side, outNode.groupKey);
          // On ne traverse que dans le même side+group
          if (key !== sideGroupKey) continue;

          if (!visited.has(outId)) {
            nextLayer.push(outId);
          }
        }
      }

      if (layerIds.length > 0) {
        // On essaie de les trier par roundNumber si dispo
        layerIds.sort((a, b) => {
          const na = graph.nodes[a];
          const nb = graph.nodes[b];
          const ra = na?.roundNumber ?? 0;
          const rb = nb?.roundNumber ?? 0;
          if (ra !== rb) return ra - rb;
          return a.localeCompare(b);
        });

        layers.push(layerIds);
      }

      currentLayer = nextLayer;
    }

    result[sideGroupKey] = layers.map((ids) => ({
      matchIds: ids,
    }));
  }

  return result;
}

/* -----------------------------------------------------------
 * Helpers pour le front
 * ---------------------------------------------------------*/

/**
 * Clé canonique side + group (permet d'indexer wb groupe A, lb groupe B, etc.)
 */
export function makeSideGroupKey(
  side: BracketSide,
  groupKey: string | null
): string {
  return `${side}::${groupKey || ''}`;
}

/**
 * Décompose une clé side::group en { side, groupKey }
 */
export function parseSideGroupKey(key: string): {
  side: BracketSide;
  groupKey: string | null;
} {
  const [sideRaw, groupRaw] = key.split('::');
  const side = (sideRaw || 'none') as BracketSide;
  const groupKey = groupRaw || null;
  return { side, groupKey };
}

/**
 * Récupère tous les side::group présents dans le graphe,
 * triés pour un affichage stable (wb, lb, final, none).
 */
export function listSideGroupKeys(graph: BracketGraph): string[] {
  const keys = new Set<string>();
  for (const node of Object.values(graph.nodes)) {
    keys.add(makeSideGroupKey(node.side, node.groupKey));
  }

  const order: BracketSide[] = ['wb', 'lb', 'final', 'none'];

  return Array.from(keys).sort((a, b) => {
    const pa = parseSideGroupKey(a);
    const pb = parseSideGroupKey(b);

    const ia = order.indexOf(pa.side);
    const ib = order.indexOf(pb.side);

    if (ia !== ib) return ia - ib;

    const ga = pa.groupKey || '';
    const gb = pb.groupKey || '';

    return ga.localeCompare(gb);
  });
}

/**
 * Helper : extrait les matchs d'une colonne pour le front.
 */
export function getColumnMatches(
  graph: BracketGraph,
  column: BracketColumn
): BracketMatchNode[] {
  return column.matchIds.map((id) => graph.nodes[id]).filter(Boolean);
}
