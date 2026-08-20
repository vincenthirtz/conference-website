// Garde-fou : la colonne s'appelle `auth_user_id`.
//
// `user_discord_links` n'a PAS de colonne `user_id`. PostgREST répond alors
// « column does not exist » — une erreur que les appelants loguent puis
// avalent, en retombant sur « aucun lien trouvé ». Le symptôme n'est donc pas
// une panne : c'est un site qui affirme calmement que PERSONNE n'a lié son
// compte Discord.
//
// Le 2026-08-20, quatre call sites écrivaient `user_id`, et depuis un moment :
//   - /api/player/network-status  → `discordLinked` toujours false, donc la
//     carte « Exister dans le réseau » réclamait la liaison à des comptes déjà
//     liés ;
//   - /api/player/team-health     → constat `discord_unlinked` sur TOUT le
//     roster, en permanence ;
//   - /api/cron/team-weekly-recap → même erreur dans le récap hebdo ;
//   - /api/teams/create-with-member → Discord du créateur jamais résolu, donc
//     `team.created` partait sans lui et le bot ne pouvait pas lui donner son
//     rôle d'équipe.
//
// Aucun test ne les couvrait : les fixtures semaient `user_id`, donc le mock
// (sans schéma) répondait comme si la colonne existait. Ce garde-fou lit le
// SOURCE, pas le comportement — c'est le seul niveau où la faute est visible.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ROOTS = ['pages', 'utils', 'lib', 'netlify', 'components'];

/** Tous les fichiers TS/TSX sous `dir`, récursivement. */
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Fenêtre de 10 lignes après chaque `.from('user_discord_links')` : la chaîne
 * PostgREST (select / eq / in) tient largement dedans, et on évite de faire
 * remonter un `user_id` qui appartiendrait à une autre requête du fichier.
 */
const CHAIN_WINDOW = 10;

/** `select('user_id')`, `eq('user_id', …)`, `in('user_id', …)`. */
const BAD_COLUMN = /\b(select|eq|in|neq|order|filter)\(\s*['"`]user_id\b/;

function offendingChains(source: string): string[] {
  const lines = source.split('\n');
  const hits: string[] = [];
  lines.forEach((line, i) => {
    if (!line.includes("from('user_discord_links')")) return;
    const chain = lines.slice(i, i + CHAIN_WINDOW);
    for (const [offset, chainLine] of chain.entries()) {
      // On s'arrête au premier `.from(` suivant : la chaîne est finie.
      if (offset > 0 && chainLine.includes('.from(')) break;
      if (BAD_COLUMN.test(chainLine)) {
        hits.push(`L${i + 1 + offset}: ${chainLine.trim()}`);
      }
    }
  });
  return hits;
}

describe('user_discord_links : colonne auth_user_id', () => {
  it('aucun code applicatif ne filtre ni ne sélectionne `user_id`', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of walk(path.join(REPO_ROOT, root))) {
        const hits = offendingChains(fs.readFileSync(file, 'utf8'));
        if (hits.length) {
          offenders.push(
            `${path.relative(REPO_ROOT, file)}\n    ${hits.join('\n    ')}`
          );
        }
      }
    }
    expect(
      offenders,
      `La colonne est \`auth_user_id\`. Passer par utils/discordLinks.ts ` +
        `(getDiscordLinkForUser / getDiscordLinksForUsers) plutôt que par une ` +
        `query en ligne :\n  ${offenders.join('\n  ')}`
    ).toEqual([]);
  });

  it('se déclencherait sur la faute d’origine (le garde-fou garde bien)', () => {
    const faulty = `
      const { data } = await supabaseAdmin
        .from('user_discord_links')
        .select('user_id')
        .in('user_id', memberIds);
    `;
    expect(offendingChains(faulty)).toHaveLength(2);
  });

  it('laisse passer la forme correcte', () => {
    const ok = `
      const { data } = await supabaseAdmin
        .from('user_discord_links')
        .select('auth_user_id, discord_user_id')
        .in('auth_user_id', authUserIds);
    `;
    expect(offendingChains(ok)).toEqual([]);
  });
});
