// utils/mvp/publicLabel.ts
//
// LE NOM D'UNE JOUEUSE TEL QU'ON PEUT L'AFFICHER EN PUBLIC.
//
// `listMvpCandidates` compose « [Équipe] Pseudo », où le pseudo retombe sur le
// BattleTag quand la joueuse n'a pas renseigné de nom d'affichage. Ce BattleTag
// est un identifiant de compte de jeu : le publier, c'est donner un lien direct
// vers le profil de quelqu'un sans qu'elle l'ait demandé.
//
// La règle est née le 2026-09-23, quand une annonce Discord a publié
// « [Chocomates] Mivaii#2189 » dans un salon de discussion. Elle vaut a
// fortiori sur un OVERLAY, qui passe à l'antenne devant un public bien plus
// large et se retrouve dans les rediffusions.
//
// LE FILTRE VIT CÔTÉ SERVEUR, dans la réponse d'API, et pas dans le composant.
// Ce qui ne sort pas ne peut pas fuir : un second overlay écrit plus tard, ou
// un curieux qui lit la réponse JSON à la main, n'y trouvera rien.
//
// Le jumeau de cette fonction vit dans le bot (`services/discord-bot/
// mvp-vote.js`). Deux dépôts, deux implémentations — c'est le prix de la
// séparation, et la raison pour laquelle chacune est testée chez elle.

/**
 * Retire le discriminant BattleNet d'un libellé.
 * « [Chocomates] Mivaii#2189 » → « [Chocomates] Mivaii »
 *
 * TROIS CHIFFRES AU MINIMUM : c'est la forme d'un discriminant BattleNet, et
 * ça évite de mutiler un pseudo qui contiendrait « #1 ».
 */
export function withoutBattleTagId(label: string | null | undefined): string {
  return String(label ?? '')
    .replace(/#\d{3,}/g, '')
    .trim();
}
