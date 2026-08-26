// Regression tripwire against re-introducing hardcoded French user-facing text.
//
// The whole public site is internationalised through `lib/i18n` (useT + format
// + fr/en per-namespace files). Nothing enforces that at push time (pushes to
// `work` skip CI),
// so this unit test — which we DO run before commit — fails the moment a
// French-accented string reappears in a JSX **text node** or a localizable
// attribute (placeholder / aria-label / alt / title) outside the allowed zones.
//
// Scope & rationale for the accent heuristic:
//  - We match on French accented characters (é è ê à ç î ô û ë ï …). This has a
//    near-zero false-positive rate: English and brand names (OW Women's Cup,
//    Discord, Overwatch…) carry no accents, so they never trip it.
//  - We only scan JSX text nodes and a short list of visible attributes — NOT
//    arbitrary TS string literals. That deliberately ignores the documented
//    skips (SEO objects, getServerSideProps error messages) which are plain TS
//    strings, keeping the signal clean.
//  - It will NOT catch accent-free French ("Voir les tournois"). That's an
//    accepted blind spot: this is a tripwire for the common case, not a proof.
//
// admin/* is now internationalised (FR-first via useAdminT) and IS scanned.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const SCAN_DIRS = ['pages', 'components'];

// Directories/paths that are intentionally NOT internationalised.
// components/overlay/caster: overlays OBS du cockpit caster — sortie ANTENNE
// en français figé, port au pixel des overlays de l'app desktop (mêmes
// libellés que src/overlays/*.html du repo womenscup-caster). Ce n'est pas de
// l'UI utilisateur : pas d'i18n, comme sur le desktop.
const EXCLUDED_DIR_SEGMENTS: string[] = [
  path.join('components', 'overlay', 'caster'),
];

// Curated allowlist of accepted accented snippets (brand copy, etc.). Keep this
// SMALL — every entry is a hole in the guard. Format: exact trimmed snippet.
const ALLOWLIST = new Set<string>([]);

const ACCENTS = 'àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ';
const ACCENT_RE = new RegExp(`[${ACCENTS}]`);

// Accent-free French is a real blind spot ("Rejoindre le Discord", "Fermer",
// "Filtres des tournois"). This curated list of French-only tokens catches the
// common visible cases without false-positiving on English. Whole-word, case-i.
const FR_WORDS =
  /\b(?:rejoindre|s'inscrire|inscrire|inscription|inscriptions|fermer|ouvrir|ouverture|filtres?|aucune?|choisir|choix|envoyer|annuler|enregistrer|modifier|supprimer|ajouter|rechercher|connexion|deconnexion|suivant|precedent|retour|valider|bienvenue|obligatoire|disponible|indisponible|equipe|equipes|joueur|joueuse|joueuses|semaine|prochaine?|votre|vos|nos|notre|charger|chargement|erreur|impossible|introuvable|reessayer|reessayez)\b/i;

// Decode \uXXXX escapes and the HTML entities used in JSX so accented French
// hidden as `é` or `&eacute;` is still detected.
const HTML_ENTITIES: Record<string, string> = {
  '&eacute;': 'é',
  '&egrave;': 'è',
  '&ecirc;': 'ê',
  '&agrave;': 'à',
  '&acirc;': 'â',
  '&ccedil;': 'ç',
  '&ocirc;': 'ô',
  '&ucirc;': 'û',
  '&icirc;': 'î',
  '&iuml;': 'ï',
  '&euml;': 'ë',
  '&ugrave;': 'ù',
};

function decodeText(s: string): string {
  let out = s.replace(/\\u([0-9a-fA-F]{4})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
  for (const [ent, ch] of Object.entries(HTML_ENTITIES)) {
    out = out.split(ent).join(ch);
  }
  return out;
}

function isFrench(text: string): boolean {
  const decoded = decodeText(text);
  return ACCENT_RE.test(decoded) || FR_WORDS.test(decoded);
}

function walk(dir: string): string[] {
  const abs = path.join(ROOT, dir);
  let entries: string[] = [];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const rel = path.join(dir, entry);
    if (EXCLUDED_DIR_SEGMENTS.some((seg) => rel.startsWith(seg))) continue;
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) {
      files.push(...walk(rel));
    } else if (entry.endsWith('.tsx')) {
      files.push(rel);
    }
  }
  return files;
}

/**
 * Remove JS/TS comments while PRESERVING string/template literals (attributes
 * are string literals — blanking them would break attr detection) and newlines.
 *
 * This is a character scanner, NOT a regex. A naive block-comment regex
 * mis-pairs a block-open token that appears inside a line comment (e.g. the
 * path segment `/player` followed by a star) with a distant block-close token,
 * silently deleting everything between — a false-negative hole in the guard.
 * The scanner enters LINE mode at a line-comment marker first, so a block-open
 * token sitting inside a line comment can never start a block comment.
 *
 * REGEX LITERALS get their own mode, and that one is load-bearing: a literal
 * holding a quote — `/[",\r\n]/` in a CSV escaper — used to open a phantom
 * string that swallowed the entire rest of the file, so hundreds of lines were
 * silently exempt from the guard while it still reported green.
 *
 * Two rules keep regex detection from over-reaching, which is what makes it
 * safe to enable at all:
 *   - a slash only starts a regex when the previous significant character
 *     cannot END an expression (after an identifier, digit or closing bracket
 *     it is a division) — the classic regex-vs-division heuristic;
 *   - a regex never crosses a newline. So even when the heuristic guesses
 *     wrong, the damage is capped at one line instead of eating the file —
 *     exactly the failure mode this mode exists to prevent.
 */
function stripComments(src: string): string {
  let out = '';
  let mode: 'code' | 'line' | 'block' | 'sq' | 'dq' | 'tmpl' | 'regex' =
    'code';
  /** Dernier caractère non blanc vu en mode code (arbitrage regex / division). */
  let prevSignificant = '';
  const canPrecedeRegex = (ch: string): boolean =>
    ch === '' || !/[A-Za-z0-9_$)\]]/.test(ch);
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (mode === 'code') {
      if (c === '/' && n === '/') {
        mode = 'line';
        i++;
      } else if (c === '/' && n === '*') {
        mode = 'block';
        i++;
      } else if (c === '/' && canPrecedeRegex(prevSignificant)) {
        mode = 'regex';
        out += c;
      } else if (c === "'") {
        mode = 'sq';
        out += c;
      } else if (c === '"') {
        mode = 'dq';
        out += c;
      } else if (c === '`') {
        mode = 'tmpl';
        out += c;
      } else {
        out += c;
      }
      if (mode === 'code' && !/\s/.test(c)) prevSignificant = c;
    } else if (mode === 'regex') {
      // Le contenu est conservé tel quel : ce qui compte est de ne PAS
      // interpréter les guillemets qu'il contient comme ouvrant une chaîne.
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i++;
      } else if (c === '[') {
        // Classe de caractères : un `/` à l'intérieur ne ferme pas la regex.
        while (i + 1 < src.length && src[i + 1] !== ']') {
          i++;
          out += src[i];
          if (src[i] === '\\') {
            i++;
            out += src[i] ?? '';
          }
        }
      } else if (c === '/') {
        mode = 'code';
        prevSignificant = c;
      } else if (c === '\n') {
        // Filet de sécurité : une regex ne franchit pas une fin de ligne.
        mode = 'code';
        prevSignificant = '';
      }
    } else if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      }
    } else if (mode === 'block') {
      if (c === '*' && n === '/') {
        mode = 'code';
        i++;
      } else if (c === '\n') {
        out += c; // keep line structure
      }
    } else {
      // inside a string/template: preserve chars, honour escapes, detect close
      out += c;
      if (c === '\\') {
        out += src[i + 1] ?? '';
        i++;
      } else if (
        (mode === 'sq' && c === "'") ||
        (mode === 'dq' && c === '"') ||
        (mode === 'tmpl' && c === '`')
      ) {
        mode = 'code';
        prevSignificant = c;
      }
    }
  }
  return out;
}

const JSX_TEXT_RE = />([^<>{}]*)</g;
const ATTR_RE =
  /\b(?:placeholder|aria-label|alt|title|aria-description)=(["'])([^"']*?)\1/g;

type Offender = { file: string; snippet: string };

function findOffenders(rel: string): Offender[] {
  const src = stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));
  const found: Offender[] = [];

  for (const m of src.matchAll(JSX_TEXT_RE)) {
    const text = m[1].trim();
    if (!text || !isFrench(text)) continue;
    if (ALLOWLIST.has(text)) continue;
    found.push({ file: rel, snippet: text.slice(0, 80) });
  }

  for (const m of src.matchAll(ATTR_RE)) {
    const text = m[2].trim();
    if (!text || !isFrench(text)) continue;
    if (ALLOWLIST.has(text)) continue;
    found.push({ file: rel, snippet: `[attr] ${text.slice(0, 80)}` });
  }

  return found;
}

describe('stripComments', () => {
  // Régression : le scanner n'avait pas de mode regex, si bien qu'un guillemet
  // à l'intérieur d'un littéral regex ouvrait une chaîne fantôme qui avalait
  // tout le reste du fichier. Le garde-fou restait vert en étant aveugle sur
  // des centaines de lignes (constaté sur pages/admin/users/manage.tsx).
  const textNodes = (src: string) =>
    [...stripComments(src).matchAll(JSX_TEXT_RE)].map((m) => m[1].trim());

  it('voit encore le JSX après une regex contenant un guillemet', () => {
    const src = [
      'const csvCell = (v: string) => (/[",\\r\\n]/.test(v) ? v : v);',
      'export function C() {',
      '  return <p>Texte français</p>;',
      '}',
    ].join('\n');
    expect(textNodes(src)).toContain('Texte français');
  });

  it('ne prend pas une division pour une regex', () => {
    // `total / 2` : le slash suit un identifiant, ce n'est pas une regex. Si on
    // se trompait ici, tout le reste de la ligne serait avalé.
    const src = [
      'const half = total / 2;',
      'export function C() {',
      '  return <p>Été</p>;',
      '}',
    ].join('\n');
    expect(textNodes(src)).toContain('Été');
  });

  it('dépouille toujours les commentaires', () => {
    const src = [
      '// Commentaire français ignoré',
      '/* Bloc français ignoré */',
      'export function C() {',
      '  return <p>Visible</p>;',
      '}',
    ].join('\n');
    expect(textNodes(src)).toEqual(['Visible']);
  });
});

describe('no hardcoded French in JSX text / visible attributes', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(d));

  it('scans a non-trivial number of source files', () => {
    // Guards against a broken walk silently passing the suite.
    expect(files.length).toBeGreaterThan(50);
  });

  it('has no accented French text nodes or attributes outside i18n/admin', () => {
    const offenders = files.flatMap(findOffenders);
    const report = offenders
      .map((o) => `  ${o.file}: "${o.snippet}"`)
      .join('\n');
    expect(
      offenders,
      offenders.length
        ? `Hardcoded French found — route it through useT (lib/i18n):\n${report}`
        : ''
    ).toEqual([]);
  });
});
