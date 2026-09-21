// Unit tests — aucune spec e2e ne peut écrire dans la base visée sans filet.
//
// LE VERSANT QUE LE GARDE-FOU DE SEED NE COUVRE PAS.
// `tests/utils/supabaseTestClient.ts` refuse en absolu de SEMER la production :
// toute spec qui l'importe s'interrompt à l'import si l'URL est celle de la
// prod. C'est solide, et `tests/unit/e2eSeedGuard.test.ts` le vérifie.
//
// Mais Playwright ne se limite pas au seed. Sa config lance `npm run dev`, qui
// lit `.env` — donc le serveur sous test parle à la base que `.env` désigne, et
// aujourd'hui c'est la PRODUCTION. Une spec qui ne touche jamais
// `supabaseTestClient` et qui poste sur une route publique écrirait donc pour
// de bon, sans qu'aucun garde-fou ne s'interpose.
//
// CE N'EST PAS THÉORIQUE, C'EST JUSTE ENCORE VRAI PAR CHANCE. Au 2026-09-21,
// quatorze specs n'importent pas le client de seed ; cinq d'entre elles font
// des requêtes mutantes, et toutes les cinq vérifient un REFUS (401, 403, 400,
// 405). Aucune n'attend un succès. Rien, dans le dépôt, ne garantissait que la
// suivante en ferait autant.
//
// LA RÈGLE POSÉE ICI. Une spec qui émet une requête mutante doit :
//   - soit importer `supabaseTestClient` — elle hérite alors du refus absolu,
//     et se trouve simplement ignorée tant que la cible est la prod ;
//   - soit n'affirmer que des REFUS, ce que ce test vérifie bloc par bloc.
//
// La vérification est volontairement grossière — elle lit le source, pas le
// comportement. C'est assez pour que personne n'ajoute une écriture en prod
// SANS LE VOIR, et c'est tout ce qu'on lui demande.

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const E2E_DIR = 'tests/e2e';

/** Les appels qui peuvent MODIFIER quelque chose côté serveur. */
const MUTATING =
  /request\.(post|put|patch|delete)\(|method:\s*'(POST|PUT|PATCH|DELETE)'/;

/**
 * Une assertion de REFUS, sous les TROIS formes qu'emploie la suite.
 *
 * Les trois existent pour de bonnes raisons et il faut donc les reconnaître
 * toutes : `toBe(4xx)` quand le code est figé, `toBeGreaterThanOrEqual(400)`
 * quand une validation peut légitimement renvoyer plusieurs codes, et
 * `expect([401, 403]).toContain(res.status())` quand la route répond
 * différemment selon qu'il y a un jeton ou pas. N'en reconnaître que la
 * première faisait accuser à tort les specs d'API d'administration — un test
 * qui crie au loup finit désactivé.
 */
const REFUSAL =
  /toBe\((4\d\d|5\d\d)\)|toBeGreaterThanOrEqual\(400\)|expect\(\[[\s\d,]*[45]\d\d[\s\d,]*\]\)\.toContain/;

function specFiles(): string[] {
  return readdirSync(E2E_DIR)
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => join(E2E_DIR, f));
}

/**
 * Découpe un fichier en blocs `test(...)`.
 *
 * Grossier mais suffisant : la suite écrit un `test(` par cas, et on veut
 * seulement savoir si une requête mutante cohabite avec une assertion de refus
 * dans le même cas.
 */
function testBlocks(source: string): string[] {
  // On découpe sur `test(` ET sur `test.describe(`, puis on ne GARDE que les
  // morceaux introduits par un cas.
  //
  // Les deux essais plus naïfs échouent, chacun dans un sens : découper sur
  // les deux sans filtrer fait accuser un describe pour un tableau
  // d'endpoints déclaré avant ses cas ; ne pas découper sur les describe fait
  // que le DERNIER cas d'un bloc avale le describe suivant, et hérite du même
  // tableau. Le séparateur doit donc être connu, pas seulement la position.
  const parts = source.split(/\n\s*(test(?:\.\w+)*)\(/);
  const blocks: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    if (parts[i] === 'test.describe') continue;
    blocks.push(parts[i + 1] ?? '');
  }
  return blocks;
}

describe('e2e — aucune écriture non gardée vers la base visée', () => {
  it('lit bien la suite e2e', () => {
    // Si le dossier est déplacé, ce test ne doit pas devenir vert en ne
    // regardant plus rien.
    expect(specFiles().length).toBeGreaterThan(50);
  });

  it('toute spec mutante est gardée, ou ne vérifie que des refus', () => {
    const coupables: string[] = [];

    for (const file of specFiles()) {
      const source = readFileSync(file, 'utf8');

      // Gardée par le client de seed : le refus absolu s'applique, la spec est
      // ignorée tant que la cible est la production.
      if (source.includes('supabaseTestClient')) continue;

      for (const block of testBlocks(source)) {
        if (!MUTATING.test(block)) continue;
        if (REFUSAL.test(block)) continue;
        const titre = block.slice(0, block.indexOf("'", 1) + 1).trim();
        coupables.push(`${file} → ${titre}`);
      }
    }

    expect(
      coupables,
      coupables.length > 0
        ? 'Ces cas e2e émettent une requête mutante sans importer ' +
            '`supabaseTestClient` et sans vérifier de refus. Contre la base de ' +
            'PRODUCTION — celle que `.env` désigne — ils écriraient pour de bon. ' +
            'Importez le client de seed (la spec sera ignorée hors Supabase ' +
            "locale), ou n'affirmez qu'un refus.\n" +
            coupables.join('\n')
        : ''
    ).toEqual([]);
  });

  it('la config Playwright ne vise pas un hôte distant par défaut', () => {
    // `TEST_BASE_URL` reste surchargeable — mais le DÉFAUT doit rester local.
    // Le jour où il pointerait vers owwomenscup.fr, toute la suite jouerait
    // contre le site réel, et les assertions de refus ci-dessus n'y feraient
    // plus rien.
    const config = readFileSync('playwright.config.ts', 'utf8');
    expect(config).toContain('http://localhost:');
    expect(config).not.toMatch(/baseURL\s*=\s*['"`]https?:\/\/(?!localhost)/);
  });
});
