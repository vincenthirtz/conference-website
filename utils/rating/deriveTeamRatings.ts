// utils/rating/deriveTeamRatings.ts
//
// Derive un rating d'equipe PUR (aucune I/O) a partir des ratings joueurs.
//
// Regle : rating equipe = moyenne des ratings des membres presents dans
// playerRatings (les user_id inconnus sont ignores). rd = moyenne des rd
// connus (null si aucun membre connu). Si le roster est vide ou entierement
// inconnu, on renvoie { rating: DEFAULT_RATING, rd: null, rosterSize: 0 }.

import { DEFAULT_RATING } from './glicko2';

export type TeamRating = {
  rating: number;
  rd: number | null;
  rosterSize: number;
};

export function deriveTeamRatings(input: {
  rostersByTeam: Map<string, string[]>;
  playerRatings: Map<string, { rating: number; rd: number }>;
}): Map<string, TeamRating> {
  const { rostersByTeam, playerRatings } = input;
  const result = new Map<string, TeamRating>();

  for (const [teamId, roster] of rostersByTeam) {
    let ratingSum = 0;
    let rdSum = 0;
    let known = 0;

    for (const userId of roster) {
      const pr = playerRatings.get(userId);
      if (!pr) continue;
      ratingSum += pr.rating;
      rdSum += pr.rd;
      known += 1;
    }

    if (known === 0) {
      result.set(teamId, { rating: DEFAULT_RATING, rd: null, rosterSize: 0 });
      continue;
    }

    result.set(teamId, {
      rating: ratingSum / known,
      rd: rdSum / known,
      rosterSize: known,
    });
  }

  return result;
}
