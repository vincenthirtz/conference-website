// tests/unit/personalDataTables.test.ts
//
// GARDE-FOU CONTRE LA DÉRIVE DU REGISTRE RGPD.
//
// Le registre `utils/player/personalDataTables.ts` n'a de valeur que s'il est
// COMPLET et EXACT :
//   - complet : une table ajoutée demain avec un `user_id` et sans politique
//     RGPD fuirait en silence — exactement comme la photo TCG a survécu aux
//     suppressions de compte pendant des mois. Ce test la fait échouer en CI ;
//   - exact : chaque nom de colonne du registre est EXÉCUTÉ par la suppression
//     en production. Un nom inventé la ferait échouer (et la route refuserait
//     alors d'effacer le compte). On vérifie tout contre le snapshot du schéma.
//
// CE QUI COMPTE COMME « DÉSIGNE UNE UTILISATRICE ». Trois sources, toutes
// lues dans `database/schema-snapshot.json`, aucune par intuition :
//   1. toute colonne dont le nom finit par `user_id` (user_id, auth_user_id,
//      card_user_id, reporter_user_id, submitted_by_auth_user_id, …, et les
//      identifiants Discord / Twitch, exclus un par un s'il le faut) ;
//   2. toute colonne portant une clé étrangère vers `auth.users` (le snapshot
//      ne donne que le nom de contrainte : on en déduit la colonne, et le test
//      échoue si la déduction rate plutôt que d'ignorer la contrainte) ;
//   3. les variantes SANS clé étrangère ni suffixe trouvées en lisant les
//      migrations (`KNOWN_UNSUFFIXED_USER_COLUMNS`). Une future colonne de ce
//      genre ne sera attrapée que si on l'ajoute ici — c'est la limite assumée.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  NOT_PERSONAL_DATA_COLUMNS,
  PERSONAL_DATA_TABLES,
} from '../../utils/player/personalDataTables';

const snapshot: {
  tables: Record<string, string[]>;
  foreignKeys: Record<string, { source: string; target: string }>;
} = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../database/schema-snapshot.json'),
    'utf8'
  )
);
const TABLES = snapshot.tables;
const FOREIGN_KEYS = snapshot.foreignKeys;

/** Colonnes d'id utilisatrice sans FK ni suffixe `user_id`, lues dans les migrations. */
const KNOWN_UNSUFFIXED_USER_COLUMNS = [
  'proposer_id', // tcg_trades (tcg_card_trades.sql)
  'recipient_id', // tcg_trades
  'submitted_by', // tcg_fanart_cards (tcg_fanart_cards.sql)
  'follower_id', // player_follows (FK aussi, redondant mais explicite)
  'followee_id', // player_follows
];

function hasColumn(table: string, column: string): boolean {
  return (TABLES[table] ?? []).includes(column);
}

/** Colonne d'une contrainte `<table>_<col>_fkey` / `<table>_<col>_fk`. */
function columnOfConstraint(name: string, source: string): string | null {
  const stem = name.replace(`${source}_`, '').replace(/_(fkey|fk)$/, '');
  if (hasColumn(source, stem)) return stem;
  // `teams_captain_fk` → `captain_id`, `team_members_user_fk` → `user_id`.
  if (hasColumn(source, `${stem}_id`)) return `${stem}_id`;
  return null;
}

function detectUserColumns(): {
  columns: Set<string>;
  unresolved: string[];
} {
  const columns = new Set<string>();
  const unresolved: string[] = [];
  for (const [table, cols] of Object.entries(TABLES)) {
    for (const col of cols) {
      if (
        col.endsWith('user_id') ||
        KNOWN_UNSUFFIXED_USER_COLUMNS.includes(col)
      ) {
        columns.add(`${table}.${col}`);
      }
    }
  }
  for (const [name, fk] of Object.entries(FOREIGN_KEYS)) {
    if (fk.target !== 'users') continue;
    const col = columnOfConstraint(name, fk.source);
    if (col) columns.add(`${fk.source}.${col}`);
    else unresolved.push(name);
  }
  return { columns, unresolved };
}

describe('registre RGPD — couverture du schéma', () => {
  it('toute colonne qui désigne une utilisatrice est au registre ou exclue explicitement', () => {
    const { columns } = detectUserColumns();
    const covered = new Set(
      PERSONAL_DATA_TABLES.flatMap((e) =>
        e.columns.map((c) => `${e.table}.${c}`)
      )
    );
    const missing = [...columns]
      .filter((key) => !covered.has(key) && !(key in NOT_PERSONAL_DATA_COLUMNS))
      .sort();
    expect(
      missing,
      'Ajoute ces colonnes à utils/player/personalDataTables.ts avec une politique RGPD, ou à NOT_PERSONAL_DATA_COLUMNS avec la raison'
    ).toEqual([]);
  });

  it('chaque clé étrangère vers auth.users se résout en une colonne', () => {
    expect(detectUserColumns().unresolved).toEqual([]);
  });

  it('aucune exclusion périmée : chaque entrée correspond au schéma et à la détection', () => {
    const { columns } = detectUserColumns();
    const stale = Object.keys(NOT_PERSONAL_DATA_COLUMNS).filter(
      (key) => !columns.has(key)
    );
    expect(stale).toEqual([]);
    for (const reason of Object.values(NOT_PERSONAL_DATA_COLUMNS)) {
      expect(reason.trim().length).toBeGreaterThan(10);
    }
  });

  it('une colonne n’est jamais à la fois au registre et exclue', () => {
    const both = PERSONAL_DATA_TABLES.flatMap((e) =>
      e.columns.map((c) => `${e.table}.${c}`)
    ).filter((key) => key in NOT_PERSONAL_DATA_COLUMNS);
    expect(both).toEqual([]);
  });
});

describe('registre RGPD — exactitude (tout nom est exécuté en production)', () => {
  it('une seule entrée par table', () => {
    const tables = PERSONAL_DATA_TABLES.map((e) => e.table);
    expect(new Set(tables).size).toBe(tables.length);
  });

  for (const entry of PERSONAL_DATA_TABLES) {
    describe(entry.table, () => {
      it('existe, et ses colonnes aussi', () => {
        expect(TABLES[entry.table], 'table absente du snapshot').toBeDefined();
        expect(entry.columns.length).toBeGreaterThan(0);
        for (const c of entry.columns)
          expect(hasColumn(entry.table, c), c).toBe(true);
      });

      it('a une raison écrite', () => {
        expect(entry.why.trim().length).toBeGreaterThan(10);
      });

      it('ses colonnes de politique existent', () => {
        const { policy } = entry;
        if (policy.kind === 'anonymise') {
          expect(Object.keys(policy.set).length).toBeGreaterThan(0);
          for (const c of Object.keys(policy.set)) {
            expect(hasColumn(entry.table, c), c).toBe(true);
            // Anonymiser ne doit jamais réécrire la colonne qui la désigne :
            // l'étape suivante ne retrouverait plus ses lignes.
            expect(entry.columns).not.toContain(c);
          }
        }
        if (policy.kind === 'cascade') {
          expect(Object.keys(policy.onDelete).sort()).toEqual(
            [...entry.columns].sort()
          );
        }
        if (entry.files)
          expect(hasColumn(entry.table, entry.files.column)).toBe(true);
        if (entry.neutralise) {
          for (const c of [
            ...Object.keys(entry.neutralise.set),
            ...Object.keys(entry.neutralise.whereEq),
            ...(entry.neutralise.stampNow ? [entry.neutralise.stampNow] : []),
          ]) {
            expect(hasColumn(entry.table, c), c).toBe(true);
          }
        }
        if (entry.purgeUnreferenced) {
          const p = entry.purgeUnreferenced;
          expect(hasColumn(entry.table, p.key)).toBe(true);
          expect(hasColumn(p.referencedBy.table, p.referencedBy.column)).toBe(
            true
          );
        }
      });

      it('ses colonnes exportées existent, et aucun secret connu n’est exporté', () => {
        if ('omit' in entry.export) {
          expect(entry.export.omit.trim().length).toBeGreaterThan(10);
          return;
        }
        for (const c of entry.export.columns) {
          expect(hasColumn(entry.table, c), c).toBe(true);
        }
        const SECRETS = [
          'token',
          'p256dh',
          'auth',
          'endpoint',
          'email_verification_token',
          'secrets_reveal_token',
          'pending_secrets_reveal',
          'access_token_enc',
          'refresh_token_enc',
        ];
        expect(entry.export.columns.filter((c) => SECRETS.includes(c))).toEqual(
          []
        );
      });
    });
  }

  it('les tables sans clé étrangère qui gardaient la photo et l’identité sont traitées', () => {
    const byTable = new Map(PERSONAL_DATA_TABLES.map((e) => [e.table, e]));
    expect(byTable.get('tcg_player_cards')?.policy.kind).toBe('delete');
    expect(byTable.get('tcg_player_cards')?.files?.column).toBe('photo_path');
    expect(byTable.get('tcg_fanart_cards')?.files?.column).toBe('image_path');
    expect(byTable.get('player_ratings')?.policy.kind).toBe('anonymise');
    expect(byTable.get('player_calendar_tokens')?.policy.kind).toBe('delete');
  });
});
