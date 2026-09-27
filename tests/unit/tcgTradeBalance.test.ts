// L'écart de rareté d'une proposition — `utils/tcg/tradeBalance.ts`.
//
// À QUOI SERT CE MODULE, ET DONC CE QUE CES CAS PROTÈGENT. La parité d'un
// échange porte sur le NOMBRE de cartes, jamais sur leur valeur : une commune
// contre une légendaire passe si la destinataire accepte. C'est assumé —
// arbitrer la valeur à sa place, ce serait décider pour elle.
//
// Mais « elle accepte » ne veut rien dire si elle ne voit pas. Le verdict est
// donc une INFORMATION, et sa seule faute possible est de se tromper de sens :
// annoncer « à ton avantage » un échange qui ne l'est pas serait pire que de ne
// rien annoncer du tout.

import { describe, expect, it } from 'vitest';
import { summarizeSide, tradeBalance } from '../../utils/tcg/tradeBalance';
import type { TcgRarity } from '../../utils/tcg/rarity';

const c = (rarity: TcgRarity | null, isFoil = false) => ({ rarity, isFoil });

describe('summarizeSide', () => {
  it('compte par rareté et retient la meilleure', () => {
    const s = summarizeSide([c('common'), c('epic'), c('rare')]);
    expect(s.count).toBe(3);
    expect(s.byRarity).toEqual({ common: 1, rare: 1, epic: 1, legendary: 0 });
    expect(s.best).toBe('epic');
  });

  it('compte une rareté INCONNUE comme commune, jamais ne la saute', () => {
    // Une carte absente du total ferait mentir le verdict sans que rien ne le
    // signale — le mode d'échec le plus dangereux pour un indicateur.
    const s = summarizeSide([c(null), c(null)]);
    expect(s.count).toBe(2);
    expect(s.byRarity.common).toBe(2);
  });

  it('compte les brillantes à part', () => {
    const s = summarizeSide([c('rare', true), c('rare')]);
    expect(s.foils).toBe(1);
  });

  it('rend un résumé vide sans planter', () => {
    const s = summarizeSide([]);
    expect(s).toMatchObject({ count: 0, best: null, foils: 0, score: 0 });
  });
});

describe('tradeBalance — le sens du verdict', () => {
  it('dit « équilibré » à raretés identiques', () => {
    const b = tradeBalance({
      offered: [c('rare'), c('common')],
      requested: [c('rare'), c('common')],
    });
    expect(b.verdict).toBe('even');
  });

  it('dit « à ton avantage » quand la destinataire reçoit mieux', () => {
    const b = tradeBalance({
      offered: [c('legendary')],
      requested: [c('common')],
    });
    expect(b.verdict).toBe('favours_recipient');
  });

  it('dit « à son avantage » quand la destinataire donne mieux', () => {
    // LE CAS QUI COMPTE : c'est celui que la destinataire doit voir avant
    // d'accepter, et se tromper de sens ici serait pire que de se taire.
    const b = tradeBalance({
      offered: [c('common')],
      requested: [c('legendary')],
    });
    expect(b.verdict).toBe('favours_proposer');
  });

  it('ne bascule PAS sur une seule brillante', () => {
    // Un demi-rang ne fait pas un palier. Avec une tolérance à zéro, presque
    // tout serait « déséquilibré » — donc plus rien ne serait signalé.
    const b = tradeBalance({
      offered: [c('rare', true)],
      requested: [c('rare')],
    });
    expect(b.verdict).toBe('even');
  });

  it('bascule sur un écart de palier, même à nombre égal', () => {
    const b = tradeBalance({
      offered: [c('common'), c('common')],
      requested: [c('epic'), c('common')],
    });
    expect(b.verdict).toBe('favours_proposer');
  });

  it('rend les deux résumés, pas seulement le verdict', () => {
    // L'écran affiche le détail : un verdict sans ses chiffres ne se vérifie
    // pas, et un indicateur qu'on ne peut pas vérifier ne se croit pas.
    const b = tradeBalance({
      offered: [c('epic')],
      requested: [c('common'), c('common')],
    });
    expect(b.offered.best).toBe('epic');
    expect(b.requested.count).toBe(2);
  });
});
