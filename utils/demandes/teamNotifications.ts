// utils/demandes/teamNotifications.ts — les NOTIFICATIONS SYSTÈME rangées dans
// la table `demandes` : une ligne sans autrice (`user_id` nul) qui porte
// `payload.notification_type`.
//
// Qui en écrit :
//   - `scrim_accepted` (type `other`) — utils/teams/scrimRequestActions.ts et
//     l'acceptation staff (pages/api/admin/demandes) : équipe CIBLE ;
//   - `scrim_acknowledged` (type `other`) — « Pris en compte » staff
//     (pages/api/admin/demandes) : équipe DEMANDEUSE ;
//   - `tournament_open` (type `captain_message`) — relance des capitaines
//     (features/admin/tournaments/service/teams.ts) : déjà lue, comme tout
//     message, par la messagerie des capitaines.
//   - `rules_validation_requested` / `rules_reminder` (type `other`) — le
//     règlement d'un tournoi à valider (utils/tournaments/rulesAcceptance.ts) :
//     inscription en cours, nouvelle version importante, relance de la
//     capitaine. ADRESSÉES : `payload.recipient_user_ids` liste les seuls
//     membres qui la voient (ceux qui doivent encore valider).
//
// Deux règles en découlent :
//   1. Ce ne sont PAS des demandes. Elles ne comptent jamais « en attente » :
//      compteur du hub admin, liste admin au filtre « en attente », pile du
//      bot (`withoutSystemNotifications`).
//   2. Les notifications d'ÉQUIPE (type `other`, `TEAM_NOTIFICATION_TYPES`)
//      s'affichent dans l'écran Notifications de l'espace joueuse, pour les
//      membres ACTUELS de l'équipe `team_id`. « Lu » est PAR MEMBRE : la liste
//      des lectrices vit dans `payload.read_by` (aucune colonne, aucune
//      migration). Deux lectures simultanées peuvent perdre une des deux
//      marques : la notification réapparaît alors « nouvelle » pour l'une —
//      sans autre conséquence.
//
// Les filtres sont écrits en chemins JSON (`payload->>…`) : PostgREST comme
// la façade D1 (utils/db/d1/filters.ts) les lisent, testé sur le moteur D1
// local (tests/unit/teamNotificationsD1.test.ts).

/** Chemin du discriminant, pour `.filter()`. */
export const NOTIFICATION_TYPE_PATH = 'payload->>notification_type';

/** Notifications d'équipe affichées dans l'espace joueuse (type `other`). */
export const TEAM_NOTIFICATION_TYPES = [
  'scrim_accepted',
  'scrim_acknowledged',
  'rules_validation_requested',
  'rules_reminder',
] as const;

export type TeamNotificationType = (typeof TEAM_NOTIFICATION_TYPES)[number];

/** La même liste, sous la forme `(a,b)` du filtre `in` de PostgREST. */
export const TEAM_NOTIFICATION_TYPES_FILTER = `(${TEAM_NOTIFICATION_TYPES.join(',')})`;

type Filterable<Q> = {
  filter(column: string, operator: string, value: unknown): Q;
};

/**
 * Retire les notifications système d'une lecture de `demandes`. Une demande
 * véritable n'a jamais de `notification_type` (payload nul compris).
 */
export function withoutSystemNotifications<Q extends Filterable<Q>>(
  query: Q
): Q {
  return query.filter(NOTIFICATION_TYPE_PATH, 'is', null);
}

/**
 * La notification s'adresse-t-elle à `userId` ? Sans
 * `payload.recipient_user_ids` (tableau), elle s'adresse à toute l'équipe ;
 * avec, aux seuls comptes listés.
 */
export function isAddressedTo(payload: unknown, userId: string): boolean {
  const raw =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).recipient_user_ids
      : undefined;
  return Array.isArray(raw) ? raw.includes(userId) : true;
}

/** Les membres qui ont déjà lu la notification (`payload.read_by`). */
export function readersOf(payload: unknown): string[] {
  const raw =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>).read_by
      : null;
  return Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === 'string')
    : [];
}

/** Le payload avec `userId` parmi les lectrices (inchangé si elle y est). */
export function payloadReadBy(
  payload: unknown,
  userId: string
): Record<string, unknown> {
  const base =
    payload && typeof payload === 'object'
      ? (payload as Record<string, unknown>)
      : {};
  const readers = readersOf(base);
  if (readers.includes(userId)) return { ...base };
  return { ...base, read_by: [...readers, userId] };
}
