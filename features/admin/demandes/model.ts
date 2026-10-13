// features/admin/demandes/model.ts — forme de réponse de la fiche demande,
// lue par le client du site. Type seul (le service le porte en signature) :
// le site le reçoit sans tirer service ni repository.

/**
 * `GET /api/admin/demandes/[id]` : la ligne telle que la base la rend
 * (colonnes libres, `payload` JSONB), avec au moins `user_id`.
 */
export type DemandeDetail = {
  demande: Record<string, unknown> & { user_id: string | null };
};
