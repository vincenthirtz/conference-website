// utils/auth/battleTagMismatch.ts
//
// Détection d'un mismatch d'identité BattleTag côté admin (anti-smurf Tier 1).
//
// Un « mismatch » signale au staff qu'une ligne de roster mérite investigation
// (usurpation potentielle / faute de frappe) : le compte Blizzard vérifié de la
// joueuse ne correspond pas au battle_tag déclaré dans son roster.
//
// Deux signaux, en OR :
//   1. Incohérence du flag dénormalisé : `verified_battle_net_id` est renseigné
//      (un compte Blizzard a été rattaché à cette ligne) MAIS
//      `battle_tag_verified_at` est NULL (la ligne n'est pas marquée vérifiée).
//      Le flux normal pose les deux ensemble ; les voir désynchronisés est
//      anormal → à investiguer.
//   2. Divergence roster ⇄ compte lié : la joueuse a un lien Battle.net vérifié
//      (user_battlenet_links.battle_tag) dont le tag DIFFÈRE — comparaison
//      insensible à la casse — du battle_tag affiché dans le roster.
//
// Aucune de ces conditions ne se déclenche pour une ligne saine : tag vérifié ==
// tag roster ⇒ pas de mismatch (le badge « vérifié » suffit).

export type BattleTagMismatchInput = {
  /** team_members.battle_tag (tag déclaré dans le roster). */
  battleTag: string | null;
  /** team_members.battle_tag_verified_at (NULL = non vérifié). */
  verifiedAt: string | null;
  /** team_members.verified_battle_net_id (compte Blizzard ayant vérifié la ligne). */
  verifiedBattleNetId: string | null;
  /** user_battlenet_links.battle_tag du compte Blizzard lié de la joueuse. */
  linkedTag: string | null;
};

const norm = (v: string | null): string => (v ?? '').trim().toLowerCase();

/**
 * Vrai si la ligne de roster présente une incohérence d'identité vérifiée à
 * signaler au staff (« ⚠ compte vérifié ≠ tag roster »).
 */
export function computeBattleTagMismatch(
  input: BattleTagMismatchInput
): boolean {
  // Signal 1 : compte rattaché mais ligne non estampillée vérifiée.
  if (input.verifiedBattleNetId && !input.verifiedAt) return true;

  // Signal 2 : lien Battle.net vérifié dont le tag diffère du tag roster.
  const linked = norm(input.linkedTag);
  const roster = norm(input.battleTag);
  if (linked && roster && linked !== roster) return true;

  return false;
}
