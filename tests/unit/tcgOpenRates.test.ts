// Le taux d'ouverture PAR ORIGINE — `openRates` (lot T10).
//
// POURQUOI CE CHIFFRE MÉRITE SES PROPRES CAS. Le total « ouverts / distribués »
// mélange des populations qui ne se comportent pas pareil et rend une moyenne
// qui ne décrit personne. Au 2026-09-27, la victoire ouvrait à 59 % et
// l'accueil à 39 % : vingt points d'écart invisibles dans le total, et c'est
// cet écart qui a fondé le lot T1. Il a fallu un client SQL pour le voir.
//
// LE PIÈGE EST LE ZÉRO. Une origine qui n'a jamais rien distribué n'a pas un
// taux de 0 % — elle n'en a pas. Les confondre ferait passer une voie jamais
// servie (le drop Twitch, dont la chaîne attend deux gestes manuels) pour une
// voie que personne n'ouvre : le diagnostic exactement inverse, sur l'écran
// censé le donner.

import { describe, expect, it } from 'vitest';
import { openRates } from '../../utils/tcg/overviewModel';

describe('openRates', () => {
  it('calcule le taux depuis distribués et non ouverts', () => {
    // Les chiffres réels du 2026-09-27, qui ont fondé T1.
    const rates = openRates(
      { victory: 39, welcome: 61 },
      { victory: 16, welcome: 37 }
    );
    expect(rates.victory).toBe(59);
    expect(rates.welcome).toBe(39);
  });

  it('rend `null` pour une origine qui n’a rien distribué', () => {
    // LE CAS QUI COMPTE : 0 % dirait « personne ne les ouvre », alors que
    // personne n'en a jamais reçu.
    const rates = openRates({ drop: 0 }, { drop: 0 });
    expect(rates.drop).toBeNull();
  });

  it('rend `null` dès qu’un des deux compteurs manque', () => {
    // Convention du fichier : `null` ≠ `0`. Une lecture en échec ne doit pas
    // se déguiser en mesure.
    expect(openRates({ victory: 10 }, {}).victory).toBeNull();
    expect(openRates({}, { victory: 2 }).victory).toBeNull();
  });

  it('rend 100 quand tout a été ouvert, et 0 quand rien ne l’a été', () => {
    const rates = openRates(
      { victory: 8, welcome: 5 },
      { victory: 0, welcome: 5 }
    );
    expect(rates.victory).toBe(100);
    // Zéro ici est une VRAIE mesure : cinq paquets distribués, aucun ouvert.
    expect(rates.welcome).toBe(0);
  });

  it('couvre les six origines, même absentes', () => {
    // L'écran affiche six tuiles : une clé manquante y ferait un trou.
    const rates = openRates({}, {});
    expect(Object.keys(rates).sort()).toEqual([
      'drop',
      'placement',
      'purchase',
      'streak',
      'victory',
      'welcome',
    ]);
  });
});
