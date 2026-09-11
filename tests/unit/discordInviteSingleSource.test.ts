// Le lien d'invitation Discord ne se recopie pas.
//
// POURQUOI CE TEST : l'invitation était écrite en dur dans douze fichiers
// (pages publiques, parcours onboard, hero de l'accueil, bandeau joueuse,
// email transactionnel, scènes de régie), alors que `config/socials.ts` existe
// précisément pour être la source unique — son propre en-tête raconte déjà le
// même épisode pour Twitter et Twitch, corrigé une fois puis recommencé.
//
// Ce qu'une rotation d'invitation provoquerait sans ce garde-fou : le site
// continue de servir un lien mort, sans erreur serveur, sans test rouge, et
// personne ne s'en aperçoit avant qu'une joueuse le signale.
//
// Le test lit les fichiers du dépôt plutôt que le rendu : c'est la RECOPIE
// qu'on interdit, pas l'affichage.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { SOCIALS } from '../../config/socials';

const ROOT = join(__dirname, '..', '..');

/** Dossiers de code produit ratissés. */
const SCANNED = ['pages', 'components', 'utils', 'lib', 'hooks', 'config'];

const IGNORED_DIRS = new Set(['node_modules', '.next', '.git', '.claude']);

/**
 * Exceptions ASSUMÉES, chacune pour une raison qui n'est pas « on a oublié » :
 *
 *   - `config/socials.ts` EST la source unique ;
 *   - `components/Association/ribbit.ts` pointe vers un AUTRE serveur (celui de
 *     l'association Ribbit), qui n'a rien à voir avec l'invitation du tournoi ;
 *   - les trois `*Placeholder` / `placeholder=` montrent la FORME attendue dans
 *     un champ de saisie ; ce ne sont pas des liens cliqués.
 */
const ALLOWED_FILES = new Set([
  'config/socials.ts',
  'components/Association/ribbit.ts',
]);

/** Une ligne qui ne fait qu'illustrer la forme attendue d'une saisie. */
function isPlaceholderLine(line: string): boolean {
  return /placeholder/i.test(line);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

describe('lien d’invitation Discord', () => {
  const invite = SOCIALS.find((s) => s.key === 'discord')!.href;

  it('n’est écrit en dur que dans config/socials.ts', () => {
    // La partie identifiante de l'invitation, sans le protocole : attrape aussi
    // bien `https://discord.gg/xxx` que `discord.gg/xxx`.
    const needle = invite.replace(/^https?:\/\//, '');

    const offenders: string[] = [];
    for (const dir of SCANNED) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file).split(sep).join('/');
        if (ALLOWED_FILES.has(rel)) continue;
        readFileSync(file, 'utf8')
          .split('\n')
          .forEach((line, i) => {
            if (!line.includes(needle)) return;
            if (isPlaceholderLine(line)) return;
            offenders.push(`${rel}:${i + 1}`);
          });
      }
    }

    expect(
      offenders,
      `Utilise socialUrl('discord') (config/socials) au lieu de recopier l’invitation :\n${offenders.join('\n')}`
    ).toEqual([]);
  });
});
