// utils/bracket/shape.ts
//
// « Ce tournoi est-il un arbre à élimination, ou une grille de journées ? »
//
// POURQUOI CE FICHIER. La vue arbre décidait avec une heuristique trop large :
// « le premier tour a plus de matchs que le dernier ». La Cup 2026 est un round
// robin de sept journées à quatre matchs, suivi d'une petite et d'une grande
// finale — profil 4,4,4,4,4,4,4,1,1. Premier tour (4) > dernier (1), donc elle
// était dessinée en ARBRE À ÉLIMINATION, avec des connecteurs entre des matchs
// qui ne s'enchaînent pas. Le staff y lisait une progression qui n'existe pas.
//
// LA BONNE QUESTION est le lien, pas la taille : dans un arbre, la gagnante d'un
// match VA quelque part (`next_match_win_id`). Quand ce lien existe, il tranche
// seul. Aucun tournoi de la base n'en porte encore — les brackets y sont décrits
// par leur forme — d'où le repli sur la forme, mais une forme exigeante : un
// arbre DIVISE PAR DEUX à chaque tour. 4,2,1 est un arbre ; 4,4,4 n'en est pas
// un, quoi qu'en dise sa dernière colonne.

export interface RoundShape {
  matches: Array<{ next_match_win_id?: string | null }>;
}

/**
 * Le tournoi se dessine-t-il en arbre ?
 *
 * `true` dès qu'un match désigne son match suivant — c'est le signal
 * authoritatif. Sinon, seulement si chaque tour tient dans la moitié du
 * précédent (arrondi au supérieur, pour absorber les byes d'un tableau impair).
 */
export function isEliminationShape(rounds: RoundShape[]): boolean {
  if (rounds.length < 2) return false;

  const linked = rounds.some((r) =>
    r.matches.some((m) => Boolean(m.next_match_win_id))
  );
  if (linked) return true;

  for (let i = 1; i < rounds.length; i++) {
    const prev = rounds[i - 1].matches.length;
    const cur = rounds[i].matches.length;
    if (prev === 0) return false;
    if (cur > Math.ceil(prev / 2)) return false;
  }

  // Une suite qui ne décroît jamais (1,1,1) n'est pas un arbre non plus : c'est
  // une série de matchs isolés, et l'arbre y dessinerait une finale par colonne.
  return rounds[rounds.length - 1].matches.length < rounds[0].matches.length;
}
