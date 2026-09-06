// tests/unit/supabaseSelectSchema.test.ts
//
// Garde-fou : toute colonne citée dans un `.select()` doit exister dans le
// schéma réel (database/schema-snapshot.json).
//
// POURQUOI : le mock Supabase de cette suite ne valide pas les noms de
// colonnes. Un `.select('colonne_inexistante')` passe au vert ici et casse en
// production, où PostgREST rejette la requête ENTIÈRE (42703) — l'endpoint
// répond 500, l'écran ne s'affiche plus. Deux occurrences avant ce test :
// mvp-leaderboard, puis matches.best_of / matches.started_at, qui empêchaient
// /admin/scrims/[id] de se charger.
//
// L'instantané se régénère avec `node scripts/refresh-schema-snapshot.mjs`
// (source : le document OpenAPI de PostgREST). À rejouer après toute migration
// qui ajoute ou retire une colonne.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  scanRepo,
  scanFile,
  collectColumnRefs,
  type ColumnRef,
} from './__helpers__/supabaseSelectScan';

const ROOT = resolve(__dirname, '../..');
const ROOTS = ['pages', 'utils', 'components', 'netlify', 'lib'];

const snapshot: {
  tables: Record<string, string[]>;
  foreignKeys: Record<string, { source: string; target: string }>;
} = JSON.parse(
  readFileSync(resolve(ROOT, 'database/schema-snapshot.json'), 'utf8')
);

const scan = scanRepo(ROOTS, ROOT);

// Relations citées par le code mais ABSENTES du schéma. Chacune serait un bug
// ouvert, pas une exemption : la liste ne doit que rétrécir. Le loquet reste en
// place pour qu'un manque connu n'oblige pas à désactiver tout le garde-fou —
// mais il est VIDE, et le test ci-dessous réclame le retrait de toute entrée
// dont la relation existe enfin.
//
// Vidée le 2026-09-06 : team_map_stats (la seule entrée) a été créée en vue,
// cf. database/migrations/create_team_map_stats_view.sql.
const KNOWN_MISSING_RELATIONS = new Set<string>([]);

const known = new Map<string, Set<string>>(
  Object.entries(snapshot.tables).map(([table, cols]) => [table, new Set(cols)])
);

describe('schéma : colonnes citées dans les .select()', () => {
  it('ne cite aucune colonne absente du schéma réel', () => {
    const offenders: string[] = [];
    for (const ref of scan.refs) {
      const columns = known.get(ref.table);
      if (!columns) continue; // table inconnue : traité par le test suivant
      if (!columns.has(ref.column)) {
        offenders.push(`${ref.file}:${ref.line} — ${ref.table}.${ref.column}`);
      }
    }
    expect(
      offenders,
      offenders.length
        ? `Colonnes absentes du schéma (PostgREST répondra 42703 et l'endpoint 500) :\n` +
            `${offenders.join('\n')}\n\n` +
            `Si la colonne vient d'être ajoutée par une migration, régénérez ` +
            `l'instantané : node scripts/refresh-schema-snapshot.mjs`
        : undefined
    ).toEqual([]);
  });

  it('ne vise aucune table absente du schéma réel', () => {
    const unknown = new Map<string, ColumnRef>();
    for (const ref of scan.refs) {
      if (!known.has(ref.table) && !KNOWN_MISSING_RELATIONS.has(ref.table)) {
        unknown.set(ref.table, ref);
      }
    }
    const lines = [...unknown.entries()].map(
      ([table, ref]) => `${ref.file}:${ref.line} — table « ${table} »`
    );
    expect(
      lines,
      lines.length
        ? `Tables inconnues du schéma. Soit la table a disparu, soit ` +
            `l'instantané est périmé (node scripts/refresh-schema-snapshot.mjs) :\n${lines.join('\n')}`
        : undefined
    ).toEqual([]);
  });

  // Vérifier les COLONNES ne suffit pas : un indice de relation inexistant fait
  // rejeter la requête ENTIÈRE par PostgREST (PGRST200), exactement comme une
  // colonne fantôme. C'est ce qui est arrivé — la contrainte s'appelle
  // `matches_team1_fk`, le code citait `matches_team1_id_fkey`, et 19 appels
  // répartis dans 8 fichiers répondaient 500.
  it('ne cite aucun indice de relation inexistant', () => {
    // PostgREST accepte deux formes d'indice : le nom de la CONTRAINTE
    // (`teams!matches_team1_fk`) ou celui de la COLONNE de clé étrangère
    // (`teams!team_id`). Les deux sont valides — vérifié contre la base — donc
    // un indice est fautif seulement s'il n'est ni l'un ni l'autre.
    const isColumnOf = (table: string, name: string) =>
      known.get(table)?.has(name) ?? false;

    const offenders: string[] = [];
    for (const ref of scan.hints) {
      if (snapshot.foreignKeys[ref.hint]) continue;
      if (isColumnOf(ref.source, ref.hint) || isColumnOf(ref.target, ref.hint)) {
        continue;
      }
      offenders.push(`${ref.file}:${ref.line} — ${ref.target}!${ref.hint}`);
    }
    expect(
      offenders,
      offenders.length
        ? `Contraintes inexistantes (PostgREST répondra PGRST200 et l'endpoint 500) :\n` +
            `${offenders.join('\n')}\n\n` +
            `Si la contrainte vient d'être créée, régénérez l'instantané : ` +
            `node scripts/refresh-schema-snapshot.mjs`
        : undefined
    ).toEqual([]);
  });

  it('n’embarque pas une table via une contrainte qui pointe ailleurs', () => {
    // Un indice qui existe mais relie deux autres tables est tout aussi
    // rejeté qu'un indice inconnu.
    const offenders: string[] = [];
    for (const ref of scan.hints) {
      const fk = snapshot.foreignKeys[ref.hint];
      if (!fk) continue;
      if (fk.target !== ref.target && fk.source !== ref.target) {
        offenders.push(
          `${ref.file}:${ref.line} — ${ref.target}!${ref.hint} ` +
            `(la contrainte relie ${fk.source} → ${fk.target})`
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  // Sans ce test, une régression de l'analyseur (import cassé, chemin changé,
  // AST qui ne matche plus) rendrait les deux tests ci-dessus vrais par vide :
  // verts, et totalement aveugles. C'est exactement le piège rencontré sur le
  // scanner i18n maison.
  it('analyse effectivement une part significative du dépôt', () => {
    expect(scan.analysed).toBeGreaterThan(500);
    expect(scan.refs.length).toBeGreaterThan(2000);
    expect(known.size).toBeGreaterThan(100);
    // Idem pour les indices de relation : zéro indice relevé signifierait que
    // l'extraction est cassée, pas que le dépôt n'en utilise aucun.
    expect(scan.hints.length).toBeGreaterThan(20);
    expect(Object.keys(snapshot.foreignKeys).length).toBeGreaterThan(100);
  });

  it('ne garde en manques connus que des relations réellement absentes', () => {
    // Quand la relation est enfin créée, ce test réclame le retrait de la
    // ligne — sans quoi la liste deviendrait une exemption permanente.
    const stillMissing = [...KNOWN_MISSING_RELATIONS].filter((t) => !known.has(t));
    expect(
      stillMissing,
      'Relation désormais présente en base : retirez-la de KNOWN_MISSING_RELATIONS.'
    ).toEqual([...KNOWN_MISSING_RELATIONS]);
  });

  // Les angles morts doivent rester visibles et bornés : si les `.select()`
  // dynamiques se multiplient, la couverture du garde-fou fond sans bruit.
  it('garde ses angles morts sous contrôle', () => {
    const ratio = scan.skipped.length / (scan.analysed + scan.skipped.length);
    expect(
      ratio,
      `${scan.skipped.length} select(s) non analysés sur ${
        scan.analysed + scan.skipped.length
      }. Détail :\n${scan.skipped
        .slice(0, 20)
        .map((s) => `${s.file}:${s.line} — ${s.reason}`)
        .join('\n')}`
      // 6,3 % à la mise en place : le budget laisse de la marge sans laisser
      // la couverture fondre en silence.
    ).toBeLessThan(0.1);
  });
});

// --- Tests de l'analyseur lui-même -----------------------------------------
//
// Un garde-fou non testé ne garde rien : on vérifie qu'il SAIT voir une faute,
// et qu'il ne crie pas sur les formes légitimes de PostgREST.

const parse = (select: string, table = 'matches') => {
  const out: ColumnRef[] = [];
  collectColumnRefs(select, table, 'x.ts', 1, out);
  return out.map((r) => `${r.table}.${r.column}`);
};

describe('analyseur : liste de colonnes PostgREST', () => {
  it('lit une liste simple, espaces et retours à la ligne compris', () => {
    expect(parse('id, status,\n  team1_id')).toEqual([
      'matches.id',
      'matches.status',
      'matches.team1_id',
    ]);
  });

  it('ignore * et count, qui sont toujours valides', () => {
    expect(parse('*')).toEqual([]);
    expect(parse('count')).toEqual([]);
  });

  it('résout un alias vers la vraie colonne', () => {
    expect(parse('libelle:name')).toEqual(['matches.name']);
  });

  it('distingue un cast (::) d’un alias (:)', () => {
    expect(parse('created_at::text')).toEqual(['matches.created_at']);
  });

  it('ne retient que la base d’un chemin JSON', () => {
    expect(parse('settings->>theme')).toEqual(['matches.settings']);
    expect(parse('settings->a->>b')).toEqual(['matches.settings']);
  });

  it('descend dans une ressource embarquée et change de table', () => {
    expect(parse('id, team1:teams!matches_team1_id_fkey(id, name)')).toEqual([
      'matches.id',
      'teams.id',
      'teams.name',
    ]);
  });

  it('ne coupe pas sur les virgules internes à une embarcation', () => {
    expect(parse('teams(id, name), status')).toEqual([
      'teams.id',
      'teams.name',
      'matches.status',
    ]);
  });

  it('gère l’embarcation « spread » et les embarcations imbriquées', () => {
    expect(parse('...teams(name)')).toEqual(['teams.name']);
    expect(parse('teams(id, members:team_members(id))')).toEqual([
      'teams.id',
      'team_members.id',
    ]);
  });

  it('n’invente pas de table quand l’indice n’est pas un nom de table', () => {
    // PostgREST accepte aussi une colonne de clé étrangère comme indice :
    // on préfère ne rien analyser plutôt que de signaler une fausse faute.
    expect(parse('auteur:"staff"(id)')).toEqual([]);
  });
});

describe('analyseur : résolution de la table', () => {
  const run = (code: string) => scanFile('/tmp/x.ts', code, 'x.ts');

  it('voit un .from().select() chaîné', () => {
    const r = run(`supabaseAdmin.from('matches').select('id, best_of');`);
    expect(r.refs.map((x) => `${x.table}.${x.column}`)).toEqual([
      'matches.id',
      'matches.best_of',
    ]);
  });

  it('voit un select en fin de chaîne, après les filtres', () => {
    const r = run(
      `await supabaseAdmin.from('scrims').update(p).eq('id', id).select('id, slug').single();`
    );
    expect(r.refs.map((x) => x.table)).toEqual(['scrims', 'scrims']);
  });

  it('suit une requête stockée dans une variable', () => {
    const r = run(
      `const query = supabaseAdmin.from('teams');\nconst { data } = await query.select('id, short_name');`
    );
    expect(r.refs.map((x) => `${x.table}.${x.column}`)).toEqual([
      'teams.id',
      'teams.short_name',
    ]);
  });

  it('signale un select dont l’argument est dynamique au lieu de le deviner', () => {
    const r = run('supabaseAdmin.from("matches").select(COLONNES);');
    expect(r.refs).toEqual([]);
    expect(r.skipped[0]?.reason).toBe('select-dynamique');
  });

  it('signale un select dont la table est dynamique', () => {
    const r = run("supabaseAdmin.from(table).select('id, name');");
    expect(r.refs).toEqual([]);
    expect(r.skipped[0]?.reason).toBe('table-dynamique');
  });

  it('reste muet sur un .select() qui n’est pas du Supabase', () => {
    const r = run("document.querySelector('.foo'); element.select();");
    expect(r.refs).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it('attrape la faute qui a motivé ce garde-fou', () => {
    // matches.best_of n'existait pas en base : l'endpoint répondait 500 et
    // /admin/scrims/[id] restait bloqué.
    const r = run(`supabaseAdmin.from('matches').select('id, colonne_fantome');`);
    const cols = new Set(snapshot.tables.matches);
    const faulty = r.refs.filter((x) => !cols.has(x.column));
    expect(faulty.map((x) => x.column)).toEqual(['colonne_fantome']);
  });
});
