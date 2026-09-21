// utils/stages/ffaStage.ts
//
// « Ce tournoi contient-il une phase FFA ? »
//
// POURQUOI UN MODULE POUR SI PEU. Six écrans publics posaient exactement la
// même question, avec exactement la même ligne :
//
//   const hasFfaStage = (stagesRes.data || []).some(
//     (s: any) => s.stage_type === 'ffa'
//   );
//
// Six copies, six `any`, et surtout six endroits à modifier le jour où un
// second type de phase sans affrontement direct apparaîtra. Le littéral `'ffa'`
// y était écrit à la main à chaque fois : une faute de frappe dans l'un d'eux
// aurait désactivé l'adaptation de l'écran sans que rien ne le signale — la
// page se serait contentée d'afficher un bracket pour un format qui n'en a pas.
//
// PUR : il n'interroge rien, il lit une réponse déjà reçue.

/** Une ligne de `tournament_stages` dont seul le type nous intéresse. */
export type StageTypeRow = { stage_type?: string | null };

/**
 * La valeur exacte stockée en base pour une phase « chacun pour soi ».
 *
 * Exportée pour que personne n'ait à la réécrire : c'est le littéral qui se
 * décalait entre les copies.
 */
export const FFA_STAGE_TYPE = 'ffa';

/**
 * Vrai si au moins une phase du tournoi est en FFA.
 *
 * Les écrans s'en servent pour basculer d'un affichage d'affrontements à un
 * classement par points — un bracket n'a pas de sens pour ce format.
 *
 * `contains…` et non `has…` : les écrans nomment déjà leur variable locale
 * `hasFfaStage`, et l'import l'aurait masquée. Renommer la fonction « pour
 * faire propre » rendrait ces fichiers incompilables — ou pire, ferait
 * référencer la fonction là où la valeur est attendue.
 */
export function containsFfaStage(
  stages: readonly StageTypeRow[] | null | undefined
): boolean {
  if (!Array.isArray(stages)) return false;
  return stages.some((s) => s.stage_type === FFA_STAGE_TYPE);
}
