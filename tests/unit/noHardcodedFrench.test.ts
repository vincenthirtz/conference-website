// Regression tripwire against re-introducing hardcoded French user-facing text.
//
// The whole public site is internationalised through `lib/i18n` (useT + format
// + fr/en.json). Nothing enforces that at push time (pushes to `work` skip CI),
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
// admin/* is intentionally out of i18n scope and is excluded.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, it, expect } from 'vitest';

const ROOT = process.cwd();
const SCAN_DIRS = ['pages', 'components'];

// Directories/paths that are intentionally NOT internationalised.
const EXCLUDED_DIR_SEGMENTS = [
  path.join('pages', 'admin'),
  path.join('components', 'admin'),
];

// Curated allowlist of accepted accented snippets (brand copy, etc.). Keep this
// SMALL — every entry is a hole in the guard. Format: exact trimmed snippet.
const ALLOWLIST = new Set<string>([]);

const ACCENTS = 'àâäéèêëîïôöùûüÿçœæÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇŒÆ';
const ACCENT_RE = new RegExp(`[${ACCENTS}]`);

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

/** Strip comments so accented text inside them is never flagged. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block + JSX {/* */} inner
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 '); // line comments (naive, avoids ://)
}

const JSX_TEXT_RE = />([^<>{}]*)</g;
const ATTR_RE = /\b(?:placeholder|aria-label|alt|title|aria-description)=(["'])([^"']*?)\1/g;

type Offender = { file: string; snippet: string };

function findOffenders(rel: string): Offender[] {
  const src = stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));
  const found: Offender[] = [];

  for (const m of src.matchAll(JSX_TEXT_RE)) {
    const text = m[1].trim();
    if (!text || !ACCENT_RE.test(text)) continue;
    if (ALLOWLIST.has(text)) continue;
    found.push({ file: rel, snippet: text.slice(0, 80) });
  }

  for (const m of src.matchAll(ATTR_RE)) {
    const text = m[2].trim();
    if (!text || !ACCENT_RE.test(text)) continue;
    if (ALLOWLIST.has(text)) continue;
    found.push({ file: rel, snippet: `[attr] ${text.slice(0, 80)}` });
  }

  return found;
}

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
