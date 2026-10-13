// features/admin/dashboard/model.ts — formes de réponse lues par l'UI du site
// (page réseau, palette de commandes). Types seuls, sans import de service :
// le site les reçoit par la synchro inversée sans tirer le métier derrière
// (`service/networkFunnel.ts` et `service/hub.ts` les réexportent).

export type NetworkFunnel = {
  /** Comptes existants (auth.users) — via la RPC admin_list_users. */
  accounts: number | null;
  /** Comptes ayant lié Discord (GLOBAL). */
  discordLinkedGlobal: number | null;
  /** Comptes ayant vérifié leur BattleTag (GLOBAL). */
  battlenetLinkedGlobal: number | null;
  /** Cartes joueuses créées, visibles ou non (GLOBAL). */
  discoveryProfilesGlobal: number | null;
  /** Cartes joueuses réellement VISIBLES — le chiffre qui compte (GLOBAL). */
  discoverableGlobal: number | null;
  /** Arêtes de suivi (GLOBAL). */
  followsGlobal: number | null;
  /** Fiches « je cherche une équipe » actives (tenant). */
  freePlayers: number | null;
  /** Annonces « on recrute » actives (tenant). */
  teamOpenings: number | null;
  /** Demandes de scrim, tous statuts (tenant). */
  scrimRequests: number | null;
};

export type SearchKind = 'team' | 'tournament' | 'match' | 'ticket' | 'task';

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  subtitle: string | null;
  href: string;
};

export type AdminSearchPayload = { hits: SearchHit[] };
