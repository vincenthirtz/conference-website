// utils/tournaments/registerHref.ts
//
// « Où envoyer quelqu'un qui veut s'inscrire à ce tournoi ? »
//
// La réponse dépend d'un seul drapeau (`tournaments.solo_mode`), mais la
// question se pose depuis au moins trois écrans — la fiche tournoi, le hero de
// sa landing, la liste des tournois — qui écrivaient tous le même littéral
// `/team/create?tournament=${id}`. Trois copies, et autant d'endroits à ne pas
// oublier : un seul oubli renvoie une participante solo dans un wizard qui lui
// demande un nom d'équipe, un roster et une capitaine.
//
// Le wizard sait se rattraper — il redirige vers le formulaire solo dès qu'il
// apprend que le tournoi en est un. Mais ce rattrapage est un rebond CÔTÉ
// CLIENT, après une requête : la participante voit l'écran d'équipe une
// fraction de seconde avant d'être déplacée. Ce module existe pour que le lien
// soit juste DÈS LE DÉPART, le rattrapage ne servant plus que de filet aux
// liens déjà partagés.
//
// PUR : il ne lit rien d'autre que ce qu'on lui passe.

/** Le strict minimum pour décider — id et drapeau. */
export type RegisterHrefTournament = {
  id: string;
  /** Absent des réponses d'API antérieures à la colonne : traité comme false. */
  solo_mode?: boolean | null;
};

/**
 * Le lien d'inscription d'un tournoi.
 *
 * Solo → le formulaire individuel, qui ne demande que pseudo, BattleTag et
 * email. Sinon → le wizard de création d'équipe, pré-cadré sur le tournoi.
 */
export function tournamentRegisterHref(
  tournament: RegisterHrefTournament
): string {
  return tournament.solo_mode === true
    ? `/tournament/${tournament.id}/inscription-solo`
    : `/team/create?tournament=${tournament.id}`;
}
