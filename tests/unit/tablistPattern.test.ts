// Unit tests — `role="tablist"` n'est pas une étiquette, c'est un contrat.
//
// CE QUE CE TEST EMPÊCHE. Cinq barres d'onglets avaient été écrites à la main
// dans ce dépôt. Trois d'entre elles portaient les bons attributs ARIA —
// `tablist`, `tab`, `aria-selected` — mais AUCUNE ne fournissait le
// comportement que ces rôles promettent : pas de navigation aux flèches, et
// tous les boutons dans l'ordre de tabulation au lieu d'un seul.
//
// C'EST PIRE QU'UN MANQUE, ET C'EST TOUT LE SUJET. Un lecteur d'écran annonce
// « onglet 2 sur 5 » et invite à utiliser les flèches. La personne appuie, et
// rien ne bouge. Une barre sans ARIA du tout (`admin/teams/index.tsx`) est
// simplement muette ; une barre qui annonce un motif qu'elle n'implémente pas
// fait perdre du temps à qui la croit.
//
// LA RÈGLE : `role="tablist"` n'apparaît QUE dans `components/ui/Tabs.tsx`,
// qui porte le motif complet (focus roving, flèches, Home/Fin). Une page qui
// veut des onglets l'utilise ; une page qui veut autre chose n'emprunte pas le
// rôle.
//
// ET LE CAS QU'ON NE DOIT PAS CONFONDRE. Les barres de `/lore` et
// `/actualites` ressemblent à des onglets mais n'en sont pas : elles
// restreignent UNE liste au lieu de changer de panneau. Leur coller
// `role="tab"` annoncerait des panneaux qui n'existent pas. Le motif juste est
// un groupe de bascules (`role="group"` + `aria-pressed`) — ce test ne les
// concerne donc pas, et c'est délibéré.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Le seul fichier autorisé à déclarer le rôle. */
const PRIMITIVE = join('components', 'ui', 'Tabs.tsx');

/**
 * Le source SANS ses commentaires.
 *
 * NÉCESSAIRE, ET DÉCOUVERT EN ÉCRIVANT CE TEST : les fichiers migrés portent
 * désormais des commentaires qui EXPLIQUENT pourquoi ils n'écrivent plus
 * `role="tablist"` à la main. Une recherche naïve les signalait donc comme
 * fautifs — le test aurait puni la documentation du correctif.
 *
 * On retire les lignes de commentaire (`//`, `*`, `{/* … *\/`) et les blocs
 * `/* … *\/`. Un attribut JSX réel n'est jamais seul sur une ligne de
 * commentaire, donc rien de vrai n'est perdu.
 */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const trimmed = line.trim();
      return !(
        trimmed.startsWith('//') ||
        trimmed.startsWith('*') ||
        trimmed.startsWith('{/*')
      );
    })
    .join('\n');
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx$/.test(entry.name) && statSync(full).isFile()) {
      out.push(full);
    }
  }
  return out;
}

describe('motif tablist — une seule implémentation', () => {
  const files = [...sourceFiles('pages'), ...sourceFiles('components')];

  it('trouve bien des fichiers à contrôler', () => {
    // Si l'arborescence bouge, le test ne doit pas devenir vert en ne
    // regardant plus rien.
    expect(files.length).toBeGreaterThan(100);
  });

  it('seul `components/ui/Tabs.tsx` déclare role="tablist"', () => {
    const offenders = files
      .filter((f) => f !== PRIMITIVE)
      .filter((f) =>
        /role=["']tablist["']/.test(withoutComments(readFileSync(f, 'utf8')))
      );
    expect(offenders).toEqual([]);
  });

  it('personne ne pose role="tab" à la main', () => {
    // `role="tab"` hors de la primitive veut dire qu'on a recommencé à écrire
    // des boutons d'onglet soi-même — donc, presque toujours, sans le clavier.
    const offenders = files
      .filter((f) => f !== PRIMITIVE)
      .filter((f) =>
        /role=["']tab["']/.test(withoutComments(readFileSync(f, 'utf8')))
      );
    expect(offenders).toEqual([]);
  });

  it('la primitive tient bien le clavier', () => {
    // La garde n'a de valeur que si le fichier vers lequel elle concentre tout
    // le monde fait le travail. On vérifie les trois pièces du motif.
    const source = readFileSync(PRIMITIVE, 'utf8');
    expect(source).toMatch(/ArrowRight/);
    expect(source).toMatch(/ArrowLeft/);
    // Un seul arrêt de tabulation : l'onglet actif.
    expect(source).toMatch(/tabIndex=\{selected \? 0 : -1\}/);
  });
});
