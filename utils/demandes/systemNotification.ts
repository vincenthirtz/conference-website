// utils/demandes/systemNotification.ts
//
// « Cette ligne est-elle une demande, ou une notification ? »
//
// Trois écrans écrivent dans `demandes` avec `user_id: null` pour PRÉVENIR une
// équipe — scrim accepté (`utils/teams/scrimRequestActions.ts`), message aux
// capitaines et ouverture d'un tournoi (`api/admin/tournaments/notify-captains`).
// Ce ne sont pas des demandes : personne ne les a envoyées, personne n'attend
// de réponse.
//
// La liste d'administration les affichait pourtant comme des demandes sans
// auteur : « Utilisateur inconnu », sous une silhouette de personne. Deux
// signaux qui annoncent un manque là où il n'y en a pas — et qui envoient
// chercher un compte supprimé qui n'a jamais existé.
//
// La règle vit ici parce qu'elle vaut pour tout écran qui lira cette table.

export type DemandeLike = {
  user_id?: string | null;
  /**
   * Le payload porte bien d'autres champs selon le type de demande (BattleTag,
   * équipes, créneau…). Le type reste donc ouvert : le restreindre au seul
   * `notification_type` refuserait des lignes parfaitement valides.
   */
  payload?: (Record<string, unknown> & { notification_type?: unknown }) | null;
};

/**
 * Les DEUX conditions comptent.
 *
 * Sans `user_id` mais sans type de notification, c'est une vraie demande dont
 * l'auteur a disparu (compte supprimé) : là, « Utilisateur inconnu » est la
 * bonne réponse, et la masquer serait perdre une information.
 */
export function isSystemNotification(d: DemandeLike): boolean {
  return !d.user_id && typeof d.payload?.notification_type === 'string';
}
