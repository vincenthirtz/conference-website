// Unit tests — la séquence d'ouverture d'un paquet (utils/tcg/packRevealSequence).
//
// La logique est pure : on la teste sans DOM ni horloge. Ce qui compte :
//   - l'ordre sachet → déchirure → éventail → retournements → fin ;
//   - « tout révéler » mène AU BOUT depuis n'importe quelle phase ;
//   - une minuterie en retard ne fait jamais revenir la séquence en arrière ;
//   - la tension s'intercale avant la carte, croissante avec la rareté ;
//   - une légendaire révélée déclenche UNE célébration (sauf mouvement réduit).

import { describe, it, expect } from 'vitest';

import {
  STAGGER_MS,
  TENSION_MS,
  flipTimeline,
  hasTension,
  initialRevealState,
  isHolographic,
  revealReducer,
  type RevealAction,
  type RevealState,
} from '../../utils/tcg/packRevealSequence';
import type { TcgRarity } from '../../utils/tcg/rarity';

const PACK: TcgRarity[] = ['common', 'rare', 'epic', 'legendary', 'common'];

function run(state: RevealState, ...actions: RevealAction[]): RevealState {
  return actions.reduce(revealReducer, state);
}

describe('packRevealSequence — phases', () => {
  it('démarre scellé, rien de retourné', () => {
    const s = initialRevealState(PACK);
    expect(s.phase).toBe('sealed');
    expect(s.flipped).toBe(0);
  });

  it('un paquet vide est déjà révélé (aucune commande inerte)', () => {
    expect(initialRevealState([]).phase).toBe('done');
  });

  it('enchaîne sachet → déchirure → éventail → retournements → fin', () => {
    let s = initialRevealState(PACK);
    s = run(s, { type: 'open' });
    expect(s.phase).toBe('tearing');
    s = run(s, { type: 'torn' });
    expect(s.phase).toBe('burst');
    s = run(s, { type: 'burstDone' });
    expect(s.phase).toBe('flipping');
    for (let i = 0; i < PACK.length; i += 1) {
      s = run(s, { type: 'flip', index: i });
    }
    expect(s.phase).toBe('done');
    expect(s.flipped).toBe(PACK.length);
  });

  it('ne retourne rien tant que le sachet n’est pas déchiré', () => {
    const s = run(initialRevealState(PACK), { type: 'flip', index: 0 });
    expect(s.flipped).toBe(0);
    expect(s.phase).toBe('sealed');
  });

  it('« tout révéler » saute TOUTE la séquence, depuis le sachet scellé', () => {
    const s = run(initialRevealState(PACK), {
      type: 'revealAll',
      celebrate: true,
    });
    expect(s.phase).toBe('done');
    expect(s.flipped).toBe(PACK.length);
    expect(s.tense).toBeNull();
  });

  it('« tout révéler » en pleine déchirure mène aussi au bout', () => {
    const s = run(
      initialRevealState(PACK),
      { type: 'open' },
      { type: 'revealAll', celebrate: true }
    );
    expect(s.phase).toBe('done');
    expect(s.flipped).toBe(PACK.length);
  });

  it('une minuterie en retard ne fait pas revenir en arrière', () => {
    const done = run(initialRevealState(PACK), {
      type: 'revealAll',
      celebrate: false,
    });
    const late = run(
      done,
      { type: 'torn' },
      { type: 'burstDone' },
      { type: 'tense', index: 2 },
      { type: 'flip', index: 0 },
      { type: 'open' }
    );
    expect(late).toEqual(done);
  });
});

describe('packRevealSequence — tension', () => {
  it('ne fait trembler que rare, épique et légendaire', () => {
    expect(hasTension('common')).toBe(false);
    expect(hasTension('rare')).toBe(true);
    expect(hasTension('epic')).toBe(true);
    expect(hasTension('legendary')).toBe(true);
  });

  it('allonge la tension avec la rareté', () => {
    expect(TENSION_MS.rare).toBeLessThan(TENSION_MS.epic);
    expect(TENSION_MS.epic).toBeLessThan(TENSION_MS.legendary);
  });

  it('intercale la tension AVANT la carte, et repousse les suivantes', () => {
    const steps = flipTimeline(PACK);
    expect(steps.map((s) => s.index)).toEqual([0, 1, 2, 3, 4]);
    // Commune : retournée sans prévenir.
    expect(steps[0]).toEqual({ index: 0, tenseAt: null, flipAt: 0 });
    // Rare : tremble dès que la précédente est partie, se retourne après.
    expect(steps[1].tenseAt).toBe(STAGGER_MS);
    expect(steps[1].flipAt).toBe(STAGGER_MS + TENSION_MS.rare);
    for (const s of steps) {
      if (s.tenseAt !== null) {
        expect(s.flipAt - s.tenseAt).toBe(TENSION_MS[PACK[s.index]]);
      }
    }
    // Strictement croissant : jamais deux cartes au même instant.
    for (let i = 1; i < steps.length; i += 1) {
      expect(steps[i].flipAt).toBeGreaterThan(steps[i - 1].flipAt);
    }
  });

  it('cesse de trembler quand la carte se retourne', () => {
    let s = run(
      initialRevealState(PACK),
      { type: 'open' },
      { type: 'torn' },
      { type: 'burstDone' },
      { type: 'flip', index: 0 },
      { type: 'tense', index: 1 }
    );
    expect(s.tense).toBe(1);
    s = run(s, { type: 'flip', index: 1 });
    expect(s.tense).toBeNull();
  });
});

describe('packRevealSequence — reflet et célébration', () => {
  it('réserve le reflet holographique aux épiques et légendaires', () => {
    expect(isHolographic('common')).toBe(false);
    expect(isHolographic('rare')).toBe(false);
    expect(isHolographic('epic')).toBe(true);
    expect(isHolographic('legendary')).toBe(true);
  });

  it('fête la légendaire quand elle se retourne, une seule fois', () => {
    let s = run(
      initialRevealState(PACK),
      { type: 'open' },
      { type: 'torn' },
      { type: 'burstDone' }
    );
    for (let i = 0; i < 3; i += 1) s = run(s, { type: 'flip', index: i });
    expect(s.celebrations).toBe(0);
    s = run(s, { type: 'flip', index: 3 });
    expect(s.celebrations).toBe(1);
    s = run(s, { type: 'flip', index: 4 });
    expect(s.celebrations).toBe(1);
  });

  it('« tout révéler » fête une légendaire encore cachée', () => {
    const s = run(initialRevealState(PACK), {
      type: 'revealAll',
      celebrate: true,
    });
    expect(s.celebrations).toBe(1);
  });

  it('mouvement réduit : aucune célébration', () => {
    const s = run(initialRevealState(PACK), {
      type: 'revealAll',
      celebrate: false,
    });
    expect(s.celebrations).toBe(0);
  });

  it('pas de légendaire, pas de fête', () => {
    const s = run(initialRevealState(['common', 'epic']), {
      type: 'revealAll',
      celebrate: true,
    });
    expect(s.celebrations).toBe(0);
  });
});
