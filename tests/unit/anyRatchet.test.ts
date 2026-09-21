// Unit tests — le nombre de `any` dans le code de production ne remonte pas.
//
// POURQUOI UN CLIQUET, ET PAS UNE INTERDICTION. Il restait 391 occurrences de
// `as any` / `: any` dans le code de production au 2026-09-21, après les quatre
// fichiers ramenés à zéro ce jour-là. Les interdire d'un coup
// demanderait de tout typer d'un coup — donc de ne rien livrer pendant
// longtemps, ou de bâcler. Le cliquet arrête l'hémorragie sans imposer de
// refonte : chaque zone est gelée à son chiffre du jour, et ce chiffre ne peut
// que BAISSER.
//
// CE QUE `as any` COÛTE RÉELLEMENT ICI, et ce n'est pas de l'esthétique. Le
// motif dominant était `(row as any).colonne` sur un résultat Supabase. Le cast
// éteint le compilateur, et le mock Supabase des tests unitaires ne valide PAS
// les noms de colonnes (cf. `tests/unit/supabaseSelectSchema.test.ts`, né du
// même problème). Une colonne mal orthographiée, ou retirée par une migration,
// traversait donc les tests AU VERT et ne cassait qu'en production — et sur les
// routes `bot/v1/*`, la casse se produit dans un AUTRE dépôt, celui du bot
// Discord.
//
// LA CORRECTION N'EST PAS `as any` → `as Machin`, qui déplacerait le mensonge.
// C'est de déclarer la forme de la ligne UNE fois, en recopiant le `.select()`
// — alors une colonne absente devient une erreur de compilation.
//
// `pages/api/bot/v1` est passé de 144 à 5 le 2026-09-21, et l'exercice a
// révélé cinq écarts réels, tous invisibles auparavant : un repli mort, deux
// types trop pessimistes, un `Map.get()` sur une clé nullable, et un rappel de
// briefing qui pouvait partir avec `matchId: null` alors que le contrat du bot
// annonce une chaîne.
//
// LES TESTS NE SONT PAS COMPTÉS. Un `as any` dans un test sert à fabriquer une
// fixture partielle : c'est un usage légitime, et les y interdire pousserait à
// écrire des fixtures complètes et illisibles.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

/**
 * Plafonds par zone, au 2026-09-21. Un chiffre ne doit que DESCENDRE.
 *
 * TOUTES LES ZONES SONT À ZÉRO, sauf un `any` assumé dans `utils`. Le dépôt
 * est passé de 391 occurrences à une seule.
 *
 * CE QUE LA DESCENTE A SORTI, et c'est le vrai bilan — chacun de ces défauts
 * était invisible, et aucun n'aurait produit d'erreur :
 *
 *   - un filtre `tenant_id` qui pouvait disparaître à l'exécution, exposant
 *     tous les espaces à un bot auto-hébergé (`bot/v1/cast/upcoming`, puis le
 *     même motif dans `utils/stages/autoAdvance`) ;
 *   - un statut de match LIBRE, venu du corps de requête, écrit tel quel dans
 *     `matches.status` (`stages/[stageId]/batch-scores`) ;
 *   - le contexte SSR passé pour un contexte d'API dans toute la chaîne
 *     d'authentification staff, qui n'aurait tenu que tant que personne n'y
 *     appelait `res.status()` ;
 *   - une dizaine d'embeds PostgREST lus en supposant l'objet : sur la
 *     variante tableau, chacun perdait silencieusement un nom d'équipe, un
 *     nom de tournoi, ou une entrée entière ;
 *   - un statut de VM `undefined` déguisé en chaîne (`netlify/telegram-vm`) ;
 *   - deux types `Team` voisins qui avaient divergé, l'un sans `slug` —
 *     d'où un `(team as any).slug` pour rattraper le lien de retour.
 *
 * Et trois nullabilités inventées « par prudence », corrigées après
 * vérification dans `information_schema` : `team_members.is_substitute`,
 * `leagues.slug` et `partners.category` sont NOT NULL. Les déclarer nullables
 * aurait créé des replis morts qui ressemblent à des cas réels.
 *
 * Ce n'est pas un décompte d'hygiène.
 */
const BUDGET: Record<string, number> = {
  // `pages` HORS `pages/api` : les écrans. Compté à part, sinon cette zone
  // serait le trou par lequel le total remonte sans que rien ne le dise.
  pagesScreens: 0,
  'pages/api/bot/v1': 0,
  'pages/api/admin': 0,
  'pages/api/teams': 0,
  'pages/api/player': 0,
  'pages/api/cron': 0,
  'pages/api/webhooks': 0,
  // Le seul du dépôt, assumé et documenté sur place : la signature
  // d'implémentation des overloads de `withBotRoute`. L'union et
  // l'intersection ont été essayées, elles cassent les appelants.
  utils: 1,
  components: 0,
  lib: 0,
  netlify: 0,
};

/**
 * Le source sans ses commentaires.
 *
 * INDISPENSABLE : les fichiers corrigés portent des commentaires qui
 * EXPLIQUENT ce que `as any` coûtait. Les compter punirait la documentation du
 * correctif — le contraire de ce qu'on veut encourager.
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
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Zone absente (dossier déplacé) : on rend une liste vide, et le test
    // « compte bien quelque chose » se charge de le signaler.
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry.name) && statSync(full).isFile()) {
      out.push(full);
    }
  }
  return out;
}

/** `as any` et `: any`, hors commentaires. */
function countAny(files: string[]): number {
  let n = 0;
  for (const file of files) {
    const source = withoutComments(readFileSync(file, 'utf8'));
    n += (source.match(/\bas any\b|:\s*any\b/g) ?? []).length;
  }
  return n;
}

describe('cliquet des `any` — le code de production ne se dégrade pas', () => {
  it('compte bien quelque chose', () => {
    // Si une zone est déplacée, le test ne doit pas devenir vert en ne
    // regardant plus rien.
    expect(sourceFiles('pages/api/admin').length).toBeGreaterThan(20);
  });

  /** `pagesScreens` n'est pas un dossier : c'est `pages` moins `pages/api`. */
  function filesOfZone(zone: string): string[] {
    if (zone !== 'pagesScreens') return sourceFiles(zone);
    return sourceFiles('pages').filter((f) => !f.startsWith('pages/api'));
  }

  for (const [zone, budget] of Object.entries(BUDGET)) {
    it(`${zone} ≤ ${budget}`, () => {
      const actual = countAny(filesOfZone(zone));
      // Le message dit dans quel sens ça a bougé : un chiffre en baisse est un
      // progrès à enregistrer ici, pas un échec.
      expect(
        actual,
        actual > budget
          ? `${zone} : ${actual} > ${budget}. Déclare la forme de la ligne (cf. pages/api/bot/v1/disputes.ts) au lieu d'un cast.`
          : `${zone} : ${actual} < ${budget} — baisse le plafond dans BUDGET.`
      ).toBeLessThanOrEqual(budget);
    });
  }

  it('les zones à zéro le restent', () => {
    // Elles sont la preuve que la convention tient. Une seule régression y
    // suffirait à la rendre discutable.
    for (const zone of Object.keys(BUDGET)) {
      if (BUDGET[zone] !== 0) continue;
      expect(countAny(filesOfZone(zone)), zone).toBe(0);
    }
  });
});
