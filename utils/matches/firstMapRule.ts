// utils/matches/firstMapRule.ts
//
// Règle de la 1re map après le pile ou face, choisie à la création du tournoi
// (`tournaments.first_map_rule`). L'équipe A (gagnante du tirage) a toujours le
// 1er ban ; ce qui change, c'est qui fixe la map :
//   - `imposed`   : la map est imposée (fixée par le staff au tirage) ;
//                   A 1er ban, B 2e ban. C'est le fonctionnement historique,
//                   donc le défaut ;
//   - `team_pick` : A 1er ban, B choisit la map, A choisit le côté (attaque ou
//                   défense), B 2e ban.
//
// Module PUR (aucun accès base) : partagé par l'API, le formulaire admin et le
// tirage (utils/matches/coinToss.ts).

export const FIRST_MAP_RULES = ['imposed', 'team_pick'] as const;
export type FirstMapRule = (typeof FIRST_MAP_RULES)[number];

export const DEFAULT_FIRST_MAP_RULE: FirstMapRule = 'imposed';

/** Libellés affichés (admin, bot). */
export const FIRST_MAP_RULE_LABELS: Record<FirstMapRule, string> = {
  imposed: 'Map imposée — A 1er ban, B 2e ban',
  team_pick: 'B choisit la map — A 1er ban, B la map, A le côté, B 2e ban',
};

export function isFirstMapRule(value: unknown): value is FirstMapRule {
  return (
    typeof value === 'string' &&
    (FIRST_MAP_RULES as readonly string[]).includes(value)
  );
}

/** Valeur reconnue, sinon la règle par défaut (lecture d'une ligne, d'un brouillon). */
export function toFirstMapRule(value: unknown): FirstMapRule {
  return isFirstMapRule(value) ? value : DEFAULT_FIRST_MAP_RULE;
}
