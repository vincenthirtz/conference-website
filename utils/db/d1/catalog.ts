// utils/db/d1/catalog.ts — la carte du schéma D1 pour la façade (lot 3 de
// conference-website docs/D1-MIGRATION.md).
//
// database/d1/catalog.json est GÉNÉRÉ par `npm run db:d1` (lot 2) depuis le relevé de
// production : colonnes et leur genre, clés primaires, unicités, clés étrangères. La façade
// s'en sert pour convertir les valeurs (values.ts), nommer les contraintes dans les erreurs
// (errors.ts), cibler les upserts et résoudre les relations des `select` imbriqués.
//
// Rien n'est lu dans la base : la carte est figée avec le schéma, et le garde-fou
// d1SchemaGuard.test.ts refuse qu'elle prenne du retard.

/** Le genre d'une colonne, tel que le traducteur du lot 2 l'a rangé. */
export type ColumnKind =
  | 'text'
  | 'uuid'
  | 'timestamptz'
  | 'date'
  | 'time'
  | 'boolean'
  | 'integer'
  | 'smallint'
  | 'bigint'
  | 'double'
  | 'numeric'
  | 'json'
  | 'array'
  | 'inet';

export interface D1Column {
  name: string;
  type: ColumnKind;
  /** Le type Postgres d'origine (`numeric(10,2)`, `text[]`…). */
  pg: string;
  nullable: boolean;
  /** Ce que la base pose seule : `now`, `uuid`, `sequence`, `today`, `year`, ou la valeur (texte SQL). */
  default: string | null;
}

export interface D1Unique {
  name: string;
  columns: string[];
  /** Index sur expression (lower(), NULLS NOT DISTINCT…) : la cible d'upsert à reproduire telle quelle. */
  expressions: string[] | null;
  where: string | null;
}

export interface D1ForeignKey {
  name: string;
  columns: string[];
  table: string;
  references: string[];
  onDelete: 'no action' | 'restrict' | 'cascade' | 'set null' | 'set default';
}

export interface D1TableCatalog {
  columns: D1Column[];
  primaryKey: string[];
  uniques: D1Unique[];
  foreignKeys: D1ForeignKey[];
  /**
   * Colonnes sensibles (lot 3g) : celles que la clé publique ne lisait pas en production
   * (droits par colonne). Le mode « lecture publique » de la façade les refuse.
   */
  sensitive?: string[];
  /**
   * Colonne de date de modification (lot 4a) : posée à « maintenant » par la façade à chaque
   * mise à jour, comme le déclencheur BEFORE UPDATE de Postgres le faisait.
   */
  touch?: string;
  /** Une vue (lot 4a) : lue comme une table, jamais écrite ; ni clé ni lien. */
  view?: boolean;
  /**
   * Colonnes qu'un déclencheur SQLite pose sur la ligne APRÈS l'écriture (lot 4b : le BEFORE de
   * Postgres les posait avant). RETURNING ne les voit pas : la façade relit alors les lignes.
   */
  computed?: string[];
}

export interface D1CatalogJson {
  tables: Record<string, D1TableCatalog>;
  /** Le schéma a la boîte d'envoi du temps réel `_d1_realtime` (lot 4c) : la façade la vide à chaque écriture. */
  realtime?: boolean;
}

/** Une table, avec ses accès rapides. */
export interface TableInfo extends D1TableCatalog {
  name: string;
  column: Map<string, D1Column>;
  /** `sensitive` en ensemble (vide si la table n'en a pas). */
  sensitiveSet: Set<string>;
  /** Clés étrangères des AUTRES tables qui pointent ici (relations « un à plusieurs »). */
  incoming: Array<D1ForeignKey & { from: string }>;
}

export interface DbCatalog {
  table(name: string): TableInfo | undefined;
  tables: Map<string, TableInfo>;
  realtime: boolean;
}

export function loadCatalog(json: D1CatalogJson): DbCatalog {
  const tables = new Map<string, TableInfo>();
  for (const [name, entry] of Object.entries(json.tables)) {
    tables.set(name, {
      ...entry,
      name,
      column: new Map(entry.columns.map((c) => [c.name, c])),
      sensitiveSet: new Set(entry.sensitive ?? []),
      incoming: [],
    });
  }
  for (const [name, info] of tables) {
    for (const fk of info.foreignKeys) tables.get(fk.table)?.incoming.push({ ...fk, from: name });
  }
  return { tables, table: (name) => tables.get(name), realtime: json.realtime === true };
}
