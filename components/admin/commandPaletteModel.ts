// components/admin/commandPaletteModel.ts — la logique PURE de la palette ⌘K :
// quelles lignes montrer, dans quel ordre, pour une saisie donnée. Sans React,
// donc testée seule (tests/unit/commandPaletteModel.test.ts).
//
// Trois sources, du plus immédiat au plus lent :
//   1. les ACTIONS (raccourcis et créations, `commandPaletteActions.ts`) ;
//   2. les PAGES du menu admin, déjà filtrées par droits (`filterAdminLinks`)
//      — cherchées sur place, dès la première lettre, sans réseau ;
//   3. les résultats SERVEUR (équipes, tournois, matchs, tickets, tâches),
//      à partir de 2 caractères.
// Préfixe `>` : commandes seulement (actions + pages), rien n'est demandé au
// serveur — « > scrims » va droit à la page.

import type { AdminLink } from '@/types/components';

export type PaletteRowKind =
  | 'team'
  | 'tournament'
  | 'match'
  | 'ticket'
  | 'task'
  | 'page'
  | 'create'
  | 'recent';

export type PaletteRow = {
  kind: PaletteRowKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type PaletteSectionKey = 'recent' | 'actions' | 'pages' | 'results';

export type PaletteSection = { key: PaletteSectionKey; rows: PaletteRow[] };

export const COMMAND_PREFIX = '>';
export const SERVER_MIN_CHARS = 2;
const MAX_PAGES = 6;
const MAX_ACTIONS_FILTERED = 5;

/** Minuscules, sans accents ni espaces superflus : « Équipes » ≈ « equipes ». */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Score d'un texte pour une saisie (0 = pas de correspondance). Tous les mots
 * saisis doivent apparaître ; un texte qui COMMENCE par la saisie, puis un mot
 * qui commence par elle, passent devant une simple inclusion.
 */
export function matchScore(query: string, text: string): number {
  const q = normalize(query);
  if (!q) return 0;
  const hay = normalize(text);
  const tokens = q.split(' ');
  if (!tokens.every((tok) => hay.includes(tok))) return 0;
  if (hay.startsWith(q)) return 3;
  if (hay.split(/[\s›/·-]+/).some((w) => w.startsWith(tokens[0]))) return 2;
  return 1;
}

/**
 * Pages atteignables du menu, à plat. `subtitle` = le chemin des sections
 * (« Compétition › Tournois »), qui dit où l'on va et se cherche aussi.
 */
export function flattenAdminPages(links: AdminLink[]): PaletteRow[] {
  const out: PaletteRow[] = [];
  const seen = new Set<string>();
  const walk = (items: AdminLink[], trail: string[]) => {
    for (const item of items) {
      const href = item.ref;
      if (href?.startsWith('/admin') && !seen.has(href)) {
        seen.add(href);
        out.push({
          kind: 'page',
          id: `page:${href}`,
          title: item.title,
          subtitle: trail.length ? trail.join(' › ') : null,
          href,
        });
      }
      if (item.children?.length) walk(item.children, [...trail, item.title]);
    }
  };
  walk(links, []);
  return out;
}

function rank(rows: PaletteRow[], query: string, max: number): PaletteRow[] {
  return rows
    .map((row, i) => ({
      row,
      i,
      score: Math.max(
        matchScore(query, row.title),
        // Le chemin compte, mais moins que le titre.
        row.subtitle ? matchScore(query, `${row.subtitle} ${row.title}`) - 1 : 0
      ),
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((r) => r.row);
}

/** Saisie → (mode commandes ?, texte cherché). */
export function parseQuery(raw: string): {
  commandsOnly: boolean;
  text: string;
} {
  const trimmed = raw.trimStart();
  if (trimmed.startsWith(COMMAND_PREFIX)) {
    return { commandsOnly: true, text: trimmed.slice(1).trim() };
  }
  return { commandsOnly: false, text: raw.trim() };
}

/** Le serveur n'est interrogé qu'hors mode commandes, à partir de 2 caractères. */
export function wantsServerSearch(raw: string): boolean {
  const { commandsOnly, text } = parseQuery(raw);
  return !commandsOnly && text.length >= SERVER_MIN_CHARS;
}

/** Sections à afficher, dans l'ordre ; les sections vides sont omises. */
export function buildSections(input: {
  query: string;
  actions: PaletteRow[];
  pages: PaletteRow[];
  hits: PaletteRow[];
  recent: PaletteRow[];
}): PaletteSection[] {
  const { commandsOnly, text } = parseQuery(input.query);
  const sections: PaletteSection[] = [];
  const push = (key: PaletteSectionKey, rows: PaletteRow[]) => {
    if (rows.length > 0) sections.push({ key, rows });
  };

  if (!text) {
    // Champ vide : l'accueil — récents (hors mode commandes), puis actions.
    if (!commandsOnly) push('recent', input.recent);
    push('actions', input.actions);
    // `>` seul : tout le menu, pour le parcourir au clavier.
    if (commandsOnly) push('pages', input.pages);
    return sections;
  }

  push('actions', rank(input.actions, text, MAX_ACTIONS_FILTERED));
  push('pages', rank(input.pages, text, commandsOnly ? 50 : MAX_PAGES));
  if (!commandsOnly && text.length >= SERVER_MIN_CHARS) {
    push('results', input.hits);
  }
  return sections;
}
