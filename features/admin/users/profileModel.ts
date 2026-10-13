// features/admin/users/profileModel.ts — la réponse de
// `GET /api/admin/users/[userId]/profile` : identité d'un compte cible pour
// l'en-tête et les actions des vues d'inspection (`player-view`,
// `captain-view`). Types seuls, partagés par la route, le client et les blocs
// d'affichage — déclarés ici pour que l'UI ne tire jamais `pages/api`
// (lot 4b).

export type AdminUserProfileUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  battleTag: string | null;
  avatarUrl: string | null;
  role: string | null;
  createdAt: string | null;
};

export type AdminUserProfilePayload = {
  user: AdminUserProfileUser;
  /**
   * Équipe de la cible dans le tenant actif, si elle en a une. Réduit au
   * strict nécessaire (badge d'en-tête + cible des actions transfert /
   * capitanat) : le détail du roster est rendu par les écrans joueur.
   */
  team: { id: string; name: string; role: string | null } | null;
};
