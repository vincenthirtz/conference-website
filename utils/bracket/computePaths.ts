// lib/bracket/computePaths.ts
// Utilitaires pour passer du graphe de bracket à un layout exploitable par le front
// (colonnes, rangées, et "paths" entre les matchs).
import {
  BracketGraph,
  BracketColumn,
  BracketColumnsByKey,
  buildColumnsBySideAndGroup,
  makeSideGroupKey,
  listSideGroupKeys,
} from './buildGraph';

/* -----------------------------------------------------------
 * Types de layout
 * ---------------------------------------------------------*/

/**
 * Position d'un match dans la grille d'un side+group
 * - sideGroupKey : "wb::A", "lb::", "final::" etc.
 * - columnIndex : index de la colonne (0 = plus tôt dans le bracket)
 * - rowIndex : index de la rangée (0 = en haut)
 */
export type MatchPosition = {
  sideGroupKey: string;
  columnIndex: number;
  rowIndex: number;
};

/**
 * Représente un "edge" (liaison) entre deux matchs dans la grille.
 * Cela ne dessine rien par lui-même, mais donne tout ce qu'il faut
 * au front pour faire des lignes (SVG, canvas, etc.).
 */
export type BracketEdgePath = {
  fromMatchId: string;
  toMatchId: string;
  from: MatchPosition;
  to: MatchPosition;
};

/**
 * Layout complet pour un bracket :
 * - columnsByKey : colonnes de matchs pour chaque side+group
 * - positions : map matchId -> position
 * - edges : liaisons calculées entre les matchs
 */
export type BracketLayout = {
  columnsByKey: BracketColumnsByKey;
  positions: Record<string, MatchPosition>;
  edges: BracketEdgePath[];
};

/* -----------------------------------------------------------
 * Fonction principale
 * ---------------------------------------------------------*/

/**
 * Construit un layout complet de bracket (positions + edges) à partir
 * d'un BracketGraph. Si tu as déjà calculé les colonnes avec
 * buildColumnsBySideAndGroup, tu peux les passer en paramètre.
 */
export function computeBracketLayout(
  graph: BracketGraph,
  maybeColumnsByKey?: BracketColumnsByKey
): BracketLayout {
  const columnsByKey = maybeColumnsByKey ?? buildColumnsBySideAndGroup(graph);

  const positions: Record<string, MatchPosition> = {};
  const edges: BracketEdgePath[] = [];

  // 1) Calculer les positions (col / row) de chaque match
  for (const [sideGroupKey, columns] of Object.entries(columnsByKey)) {
    columns.forEach((column: BracketColumn, columnIndex: number) => {
      column.matchIds.forEach((matchId, rowIndex) => {
        positions[matchId] = {
          sideGroupKey,
          columnIndex,
          rowIndex,
        };
      });
    });
  }

  // 2) Construire les edges à partir des liens outgoingTo du graphe
  const seenEdgeKey = new Set<string>();

  for (const node of Object.values(graph.nodes)) {
    const fromPos = positions[node.id];
    if (!fromPos) continue;

    for (const toId of node.outgoingTo) {
      const toPos = positions[toId];
      if (!toPos) continue;

      // On ne crée un edge que si les deux matchs sont dans le même side+group
      if (fromPos.sideGroupKey !== toPos.sideGroupKey) continue;

      const edgeKey = `${node.id}->${toId}`;
      if (seenEdgeKey.has(edgeKey)) continue;
      seenEdgeKey.add(edgeKey);

      edges.push({
        fromMatchId: node.id,
        toMatchId: toId,
        from: fromPos,
        to: toPos,
      });
    }
  }

  return {
    columnsByKey,
    positions,
    edges,
  };
}

/* -----------------------------------------------------------
 * Helpers supplémentaires pour le front
 * ---------------------------------------------------------*/

/**
 * Récupère le layout d'un side+group spécifique (ex: "wb::A") sous une forme simplifiée.
 */
export function sliceLayoutForSideGroup(
  layout: BracketLayout,
  sideGroupKey: string
): {
  columns: BracketColumn[];
  positions: Record<string, MatchPosition>;
  edges: BracketEdgePath[];
} {
  const columns = layout.columnsByKey[sideGroupKey] ?? [];

  const positions: Record<string, MatchPosition> = {};
  for (const [matchId, pos] of Object.entries(layout.positions)) {
    if (pos.sideGroupKey === sideGroupKey) {
      positions[matchId] = pos;
    }
  }

  const edges = layout.edges.filter(
    (e) =>
      e.from.sideGroupKey === sideGroupKey && e.to.sideGroupKey === sideGroupKey
  );

  return { columns, positions, edges };
}

/**
 * Helper pratique : pour construire un layout par side+group
 * déjà groupé, prêt à mapper en composants React.
 */
export function computeLayoutBySideGroup(graph: BracketGraph): Record<
  string,
  {
    columns: BracketColumn[];
    positions: Record<string, MatchPosition>;
    edges: BracketEdgePath[];
  }
> {
  const layout = computeBracketLayout(graph);
  const keys = listSideGroupKeys(graph);

  const result: Record<
    string,
    {
      columns: BracketColumn[];
      positions: Record<string, MatchPosition>;
      edges: BracketEdgePath[];
    }
  > = {};

  for (const key of keys) {
    result[key] = sliceLayoutForSideGroup(layout, key);
  }

  return result;
}
