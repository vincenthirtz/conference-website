// Garde-fou : AUCUN BattleTag complet ne doit sortir par une surface publique.
//
// Contexte : un BattleTag a la forme « Pseudo#1234 ». Le suffixe numérique est
// ce qui permet d'ajouter quelqu'un EN JEU. Sur un site de tournoi féminin,
// l'exposer publiquement est un vecteur de harcèlement direct — d'où la
// convention `maskBattleTag` (utils/battleTag.ts), appliquée aux rosters,
// pages d'équipe, MVP et outils casters.
//
// Les surfaces de RATING (classement, profil joueuse, image OG) avaient été
// écrites après cette convention et ne l'appliquaient pas. Elles sont restées
// inoffensives tant que `player_ratings` était vide ; le remplissage de la
// table (rebuild) les a rendues bien réelles. Ce test verrouille l'invariant
// pour que ça ne puisse pas revenir en silence.

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { readLeaderboard } from '../../utils/rating/readLeaderboard';
import { maskBattleTag } from '../../utils/battleTag';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';

/** Un BattleTag complet = pseudo + « # » + identifiant numérique. */
const FULL_TAG_RE = /#\d+/;

beforeEach(() => {
  resetSupabaseMock();
  store.player_ratings = [
    {
      tenant_id: TENANT,
      user_id: 'u-1',
      display_name: null, // pire cas : le tag sert de libellé
      battle_tag: 'Akira#4422',
      avatar_url: null,
      rating: 1600,
      rd: 120,
      games_played: 5,
      wins: 3,
      losses: 2,
    },
    {
      tenant_id: TENANT,
      user_id: 'u-2',
      display_name: 'Eiko',
      battle_tag: 'Eiko#2202',
      avatar_url: null,
      rating: 1500,
      rd: 130,
      games_played: 4,
      wins: 2,
      losses: 2,
    },
  ] as any;
});

describe('maskBattleTag', () => {
  it("retire l'identifiant numérique", () => {
    expect(maskBattleTag('Akira#4422')).toBe('Akira');
    expect(maskBattleTag('SansDiese')).toBe('SansDiese');
    expect(maskBattleTag(null)).toBeNull();
  });
});

describe('classement public — anonymat', () => {
  it('ne renvoie JAMAIS un BattleTag complet', async () => {
    const { players } = await readLeaderboard(TENANT, 50, 0);

    expect(players.length).toBeGreaterThan(0);
    for (const p of players) {
      if (p.battleTag) {
        expect(p.battleTag).not.toMatch(FULL_TAG_RE);
      }
    }
    // Et le payload sérialisé entier ne contient aucun suffixe numérique.
    expect(JSON.stringify(players)).not.toMatch(FULL_TAG_RE);
  });

  it('conserve le pseudo pour rester lisible', async () => {
    const { players } = await readLeaderboard(TENANT, 50, 0);
    const akira = players.find((p) => p.userId === 'u-1');
    expect(akira?.battleTag).toBe('Akira');
  });
});
