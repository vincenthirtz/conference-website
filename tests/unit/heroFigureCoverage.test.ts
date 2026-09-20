// Unit tests — chaque héros du registre a sa figurine, ou dit pourquoi non.
//
// CE QUI A MOTIVÉ CE FICHIER. Le 2026-09-20, treize héros du registre
// n'obtenaient aucune figurine et retombaient sur celle, générique, de leur
// rôle. Douze n'étaient simplement pas encore sculptés — c'est un état normal.
//
// LE TREIZIÈME ÉTAIT UN BOGUE, et personne ne pouvait le voir : **Soldier: 76**
// AVAIT sa figurine (`soldier76`), mais la conversion du nom en slug
// n'enlevait que les points, les espaces et les points médians. « Soldier: 76 »
// devenait `soldier:76`, qui ne correspondait à rien. Le repli sur le rôle est
// silencieux par conception — c'est ce qui rend ce genre de perte indétectable
// à l'œil : la carte s'affiche, simplement avec la mauvaise figurine.
//
// LA DIFFÉRENCE ENTRE LES DEUX CAS EST TOUT L'INTÉRÊT DU TEST. « Pas encore
// sculpté » se décide ; « sculpté mais jamais affiché » se subit. La liste
// ci-dessous force à ranger chaque héros dans l'un ou l'autre, et un héros
// ajouté au registre sans figurine fera échouer ce test tant que personne ne
// l'aura inscrit ici — donc tant que personne n'aura regardé.

import { describe, it, expect } from 'vitest';

import { OVERWATCH_HEROES } from '../../utils/heroes/overwatch';
import {
  HERO_FIGURE_SLUGS,
  heroFigureSlugFromName,
} from '../../utils/tcg/heroFigures';

/**
 * Héros du registre SANS figurine, assumé.
 *
 * Ils retombent sur la figurine de leur rôle, ce qui est un repli correct —
 * pas un trou. Sculpter un héros est un travail d'illustration, pas une ligne
 * de code : cette liste est la file d'attente, et elle doit rétrécir, jamais
 * s'allonger sans qu'on s'en aperçoive.
 */
const SANS_FIGURINE_ASSUME: readonly string[] = [
  // Héros arrivés au registre après la campagne de sculpture.
  'Domina',
  'D.Mon',
  'Anran',
  'Emre',
  'Freja',
  'Shion',
  'Sierra',
  'Doctrine',
  'Fika',
  'Juno',
  'Mizuki',
  'Wuyang',
];

describe('figurines de héros — couverture du registre', () => {
  const heroes = OVERWATCH_HEROES as ReadonlyArray<{
    name: string;
    role: string;
  }>;

  it('lit bien un registre non vide', () => {
    expect(heroes.length).toBeGreaterThan(40);
    expect(HERO_FIGURE_SLUGS.length).toBeGreaterThan(40);
  });

  it('tout héros sans figurine est une absence ASSUMÉE', () => {
    const sansFigurine = heroes
      .filter((h) => !heroFigureSlugFromName(h.name))
      .map((h) => h.name);

    const inattendus = sansFigurine.filter(
      (name) => !SANS_FIGURINE_ASSUME.includes(name)
    );
    expect(inattendus).toEqual([]);
  });

  it('la file d’attente ne contient pas de héros déjà sculpté', () => {
    // Une entrée qui n'a plus lieu d'être fait croire qu'il reste du travail,
    // et masque le prochain héros réellement manquant.
    const obsoletes = SANS_FIGURINE_ASSUME.filter((name) =>
      heroFigureSlugFromName(name)
    );
    expect(obsoletes).toEqual([]);
  });

  it('retrouve les noms dont la ponctuation piège', () => {
    // LE BOGUE D'ORIGINE, et les formes voisines. Chacun de ces noms est
    // l'orthographe réelle d'un héros quelque part dans le jeu ou dans une
    // saisie possible.
    expect(heroFigureSlugFromName('Soldier: 76')).toBe('soldier76');
    expect(heroFigureSlugFromName('D.Va')).toBe('dva');
    expect(heroFigureSlugFromName('Wrecking Ball')).toBe('wreckingball');
    expect(heroFigureSlugFromName('Junker Queen')).toBe('junkerqueen');
    // Orthographes OFFICIELLES du jeu, que le registre écrit sans accent : une
    // préférence saisie à la main ou importée peut très bien les porter.
    expect(heroFigureSlugFromName('Lúcio')).toBe('lucio');
    expect(heroFigureSlugFromName('Torbjörn')).toBe('torbjorn');
  });

  it('rend null pour un nom inconnu, jamais une figurine au hasard', () => {
    // `null` fait retomber la carte sur la figurine du rôle. Inventer une
    // correspondance approchante afficherait le mauvais héros — pire qu'un
    // archétype neutre.
    expect(heroFigureSlugFromName('Personne')).toBeNull();
    expect(heroFigureSlugFromName('')).toBeNull();
    expect(heroFigureSlugFromName(null)).toBeNull();
  });
});
