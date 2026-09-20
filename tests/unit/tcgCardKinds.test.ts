// Unit tests — les cinq types de carte, et le fait qu'on ne puisse plus en
// oublier un.
//
// CE QUI S'EST PASSÉ LE 2026-09-20, et qui explique ce fichier. Les cartes
// MASCOTTE ont été ajoutées au tirage, à la base et à l'affichage. Dix
// lecteurs ne les connaissaient pas, chacun avec sa propre copie de l'union
// `'player' | 'team' | 'map'`. Rien n'a échoué. Selon le lecteur, la carte
// disparaissait en silence (`cardSubjectId` rendait `null`, et chaque appelant
// sautait la ligne) ou tombait dans le `return` final et ressortait DÉGUISÉE en
// équipe, avec un identifiant `undefined` — donc une clé React partagée par
// toutes les mascottes, et un lien `/team/<slug-de-mascotte>` en 404.
//
// Les fan arts étaient dans le même état depuis leur création, et personne ne
// l'avait vu, parce qu'aucune n'avait encore été soumise.
//
// LA VRAIE GARDE N'EST PAS DANS CE FICHIER, elle est dans le type :
// `CARD_SUBJECT_COLUMN` est un `Record` exhaustif sur `TcgCardKind`, donc
// ajouter un type sans dire quelle colonne le porte NE COMPILE PAS. Ce test
// vérifie ce que le type ne peut pas voir — que la correspondance est juste,
// et qu'aucun lecteur ne s'est refabriqué sa propre liste dans son coin.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  TCG_CARD_KINDS,
  CARD_SUBJECT_COLUMN,
  cardSubjectId,
  cardSubjectKey,
  isTcgCardKind,
} from '../../utils/tcg/subjectKey';

describe('types de carte TCG — la liste canonique', () => {
  it('couvre les cinq types, dans l’ordre du tirage', () => {
    expect([...TCG_CARD_KINDS]).toEqual([
      'player',
      'team',
      'map',
      'fanart',
      'mascot',
    ]);
  });

  it('donne une colonne DISTINCTE à chaque type', () => {
    const columns = TCG_CARD_KINDS.map((k) => CARD_SUBJECT_COLUMN[k]);
    // Deux types qui pointeraient la même colonne se confondraient : une carte
    // de map compterait comme une carte de mascotte, sans rien casser.
    expect(new Set(columns).size).toBe(columns.length);
  });

  it('retrouve le sujet de chaque type', () => {
    for (const kind of TCG_CARD_KINDS) {
      const row = {
        subject_kind: kind,
        [CARD_SUBJECT_COLUMN[kind]]: 'valeur-du-sujet',
      };
      expect(cardSubjectId(row)).toBe('valeur-du-sujet');
      expect(cardSubjectKey(row)).toBe(`${kind}:valeur-du-sujet`);
    }
  });

  it('ne confond pas deux types qui portent chacun leur colonne', () => {
    // Une ligne mal formée (deux colonnes remplies) ne doit pas rendre le
    // sujet de l'AUTRE type. Le CHECK d'exclusivité l'interdit en base ; ici on
    // vérifie que la lecture suit `subject_kind`, et lui seul.
    const row = {
      subject_kind: 'mascot',
      card_map_slug: 'hanamura',
      card_mascot_slug: 'pachimari',
    };
    expect(cardSubjectId(row)).toBe('pachimari');
  });

  it('refuse un type inconnu plutôt que d’inventer un sujet', () => {
    // Une carte écrite par une version plus récente du code. `null` dit « je ne
    // sais pas » ; forcer une valeur inventerait un sujet.
    expect(isTcgCardKind('hologramme')).toBe(false);
    expect(
      cardSubjectId({ subject_kind: 'hologramme', card_user_id: 'x' })
    ).toBeNull();
    expect(
      cardSubjectKey({ subject_kind: 'hologramme', card_user_id: 'x' })
    ).toBeNull();
  });
});

describe('types de carte TCG — plus personne ne recopie la liste', () => {
  /**
   * Les unions écrites à la main qu'on interdit désormais.
   *
   * On cherche la forme TEXTUELLE parce que c'est elle qui a fait le dégât :
   * dix copies indépendantes, chacune à mettre à jour, dont une seule oubliée
   * suffisait. Le compilateur ne peut pas les relier entre elles — il ne voit
   * que des types structurellement identiques, tous valides.
   */
  const FORBIDDEN = [
    "'player' | 'team' | 'map'",
    "'player', 'team', 'map'",
  ] as const;

  function sourceFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...sourceFiles(full));
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
    }
    return out;
  }

  it('aucune union de types de carte recopiée dans utils/tcg', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('utils/tcg')) {
      // `subjectKey.ts` EST la source : c'est le seul endroit qui a le droit
      // de nommer les types un par un.
      if (file.endsWith('subjectKey.ts')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (source.includes(pattern)) offenders.push(`${file} → ${pattern}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
