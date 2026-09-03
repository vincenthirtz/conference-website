// utils/tenants/tenantScope.ts
//
// Le manifeste des données d'un espace.
//
// 96 tables portent une colonne `tenant_id` en production. Toute opération
// transverse — compter, dater, exporter, purger — écrite en recopiant une liste
// de tables sera fausse le jour où la 97ᵉ arrive, et personne ne le verra : une
// table oubliée ne lève pas d'erreur, elle rend un chiffre trop bas ou laisse
// des lignes derrière elle.
//
// D'où ce fichier : une seule déclaration, plusieurs lecteurs. La vue
// d'ensemble d'un espace s'en sert pour compter et dater ; l'export et la purge
// s'en serviront ensuite (cf. docs/PLAN-gestion-tenants.md, lots T4 et T5).
//
// Ce manifeste ne prétend PAS lister les 96 tables : il déclare les domaines
// qu'un humain lit sur une fiche. Les tables de détail (lignes de bracket,
// accusés de réception, compteurs) suivent leur domaine parent et n'ont pas à
// figurer ici tant qu'on ne fait que compter.

/** Un domaine mesurable d'un espace. */
export type TenantDomain = {
  /** Clé stable, utilisée dans les réponses d'API et les libellés. */
  key: string;
  /** Table Postgres, qui DOIT porter une colonne `tenant_id`. */
  table: string;
  /**
   * Colonne de date qui fait foi pour « quand la dernière fois ? ».
   * `null` = ce domaine se compte mais ne se date pas.
   */
  dateCol: string | null;
  /**
   * Filtre supplémentaire, sous forme de couples colonne/valeur appliqués en
   * égalité. Volontairement pauvre : un manifeste qui accepte du SQL libre
   * n'est plus un manifeste.
   */
  where?: Record<string, string | number | boolean | null>;
  /** Colonne de suppression douce à exclure, quand elle existe. */
  softDeleteCol?: string;
};

export const TENANT_DOMAINS = [
  { key: 'teams', table: 'teams', dateCol: 'created_at' },
  { key: 'members', table: 'team_members', dateCol: 'created_at' },
  { key: 'tournaments', table: 'tournaments', dateCol: 'created_at' },
  {
    key: 'matches',
    table: 'matches',
    dateCol: 'created_at',
    softDeleteCol: 'deleted_at',
  },
  {
    key: 'openTickets',
    table: 'support_tickets',
    dateCol: 'created_at',
    where: { status: 'open' },
  },
] as const satisfies readonly TenantDomain[];

export type TenantDomainKey = (typeof TENANT_DOMAINS)[number]['key'];

/**
 * Les « signes de vie » : les quatre dates qui disent si un espace tourne.
 *
 * Elles ne sont pas des domaines — on ne les compte pas, on prend la plus
 * récente — et chacune répond à une question différente : le bot parle-t-il
 * encore, joue-t-on, le staff vient-il, l'API sert-elle.
 */
export const LIFE_SIGNS = [
  {
    key: 'botEvent',
    table: 'bot_event_outbox',
    dateCol: 'created_at',
  },
  {
    key: 'matchPlayed',
    table: 'matches',
    dateCol: 'completed_at',
  },
  {
    key: 'staffAction',
    table: 'staff_logs',
    dateCol: 'created_at',
  },
  {
    key: 'apiCall',
    table: 'api_usage_counters',
    dateCol: 'updated_at',
  },
] as const;

export type LifeSignKey = (typeof LIFE_SIGNS)[number]['key'];
