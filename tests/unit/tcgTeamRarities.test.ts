// Unit tests — `readTeamRarities`, la lecture EN LOT des raretés d'équipe.
//
// POURQUOI CETTE VARIANTE EXISTE : `readTeamRarity` coûte deux requêtes par
// équipe. C'est le bon compromis pour UNE fiche, et un contresens sur le
// catalogue public, qui les affiche toutes — quelques dizaines d'équipes y
// feraient une centaine d'allers-retours à chaque régénération ISR.
//
// Ce qui est verrouillé ici, c'est l'ÉQUIVALENCE avec la version unitaire : le
// barème reste `teamCardRarity`, et seule la façon d'aller chercher `bestRank`
// et `rating` change. Deux chemins qui répondraient différemment sur la même
// équipe donneraient deux vérités sur le même tournoi — exactement ce que le
// module dit refuser depuis l'origine.

import { describe, it, expect, beforeEach } from 'vitest';

import {
  store,
  resetSupabaseMock,
  CONFERENCE_TENANT_ID,
} from './__helpers__/supabaseMock';
import {
  readTeamRarities,
  readTeamRarity,
} from '../../utils/tcg/readTeamRarity';

const CHAMPION = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const FINALIST = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NOBODY = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

beforeEach(() => {
  resetSupabaseMock();
  store.team_ratings = [
    { tenant_id: CONFERENCE_TENANT_ID, team_id: CHAMPION, rating: 1200 },
    { tenant_id: CONFERENCE_TENANT_ID, team_id: FINALIST, rating: null },
  ] as never;
  store.final_rankings = [
    // Volontairement DÉSORDONNÉ et multiple : c'est le meilleur rang qui
    // compte, et la version unitaire le fait trier par la base.
    { tenant_id: CONFERENCE_TENANT_ID, team_id: CHAMPION, rank: 4 },
    { tenant_id: CONFERENCE_TENANT_ID, team_id: CHAMPION, rank: 1 },
    { tenant_id: CONFERENCE_TENANT_ID, team_id: FINALIST, rank: 2 },
  ] as never;
});

describe('readTeamRarities', () => {
  it('retient le MEILLEUR rang quand une équipe en a plusieurs', async () => {
    const map = await readTeamRarities(CONFERENCE_TENANT_ID, [CHAMPION]);
    // Rang 1 l'emporte sur rang 4, quel que soit l'ordre des lignes.
    expect(map.get(CHAMPION)).toBe('legendary');
  });

  it('rend la même rareté que la version unitaire', async () => {
    // L'invariant qui compte : un seul barème, deux chemins d'accès.
    for (const teamId of [CHAMPION, FINALIST, NOBODY]) {
      const batched = await readTeamRarities(CONFERENCE_TENANT_ID, [teamId]);
      const single = await readTeamRarity(CONFERENCE_TENANT_ID, teamId);
      expect(batched.get(teamId), `désaccord sur ${teamId}`).toBe(single);
    }
  });

  it('retombe sur `common` pour une équipe sans rang ni rating', async () => {
    const map = await readTeamRarities(CONFERENCE_TENANT_ID, [NOBODY]);
    // Plancher documenté du barème : toute équipe a une carte.
    expect(map.get(NOBODY)).toBe('common');
  });

  it('rend une entrée pour CHAQUE équipe demandée', async () => {
    // Une absence silencieuse obligerait l'appelant à re-deviner le plancher,
    // et c'est ainsi qu'un `undefined` finit affiché.
    const ids = [CHAMPION, FINALIST, NOBODY];
    const map = await readTeamRarities(CONFERENCE_TENANT_ID, ids);
    expect([...map.keys()].sort()).toEqual([...ids].sort());
  });

  it('ne fait rien sur une liste vide', async () => {
    const map = await readTeamRarities(CONFERENCE_TENANT_ID, []);
    expect(map.size).toBe(0);
  });
});
