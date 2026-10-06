// features/admin/users/usersExport.ts — mise en forme PURE de l'export CSV des
// comptes (`GET /api/admin/users/export`).
//
// L'export était assemblé dans le navigateur (useUsersManageBulk) : pages de
// 200 lignes, nouvelles tentatives sur 429, fichier possiblement TRONQUÉ en
// silence relatif, et aucune trace au journal staff alors qu'il contient
// emails, dernières connexions et identités Discord. Il est désormais produit
// côté serveur, en une requête journalisée (`export_users`).
//
// Colonnes et séparateur INCHANGÉS (`,`, BOM, CRLF) : un tableur ou un script
// qui lisait l'ancien fichier lit le nouveau. Une seule différence voulue :
// l'anti-injection de formule, que l'ancienne version n'avait pas.

import { isSuspended } from '@/components/admin/users/manageFormat';
import { isStaffRoleValue, type UserLite } from './manageModel';

/** Plafond de lignes d'un export (au-delà, `truncated`). */
export const USERS_EXPORT_MAX_ROWS = 10_000;

/** Taille de page demandée à la RPC de liste (son maximum). */
export const USERS_EXPORT_PAGE_SIZE = 200;

export const USERS_EXPORT_CSV_COLUMNS = [
  'id',
  'email',
  'display_name',
  'account_role',
  'role_scope',
  'created_at',
  'last_sign_in_at',
  'banned_until',
  'discord',
  'teams',
] as const;

/** BOM UTF-8 : sans lui, Excel FR ouvre le fichier en Windows-1252. */
const CSV_BOM = String.fromCharCode(0xfeff);

/**
 * Cellule CSV sûre (séparateur `,`).
 *
 * 1. Anti-injection de formule (OWASP) : un pseudo `=HYPERLINK(...)` serait
 *    évalué par le tableur ; on préfixe d'une apostrophe, qui force le texte.
 * 2. Échappement RFC 4180 : cellule quotée si elle contient `,`, `"` ou un
 *    saut de ligne, guillemets doublés.
 */
export function usersCsvCell(value: string | null | undefined): string {
  let str = value ?? '';
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  if (/[,"\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

export function userCsvRow(u: UserLite): string[] {
  return [
    u.id,
    u.email || '',
    u.display_name || '',
    u.role || '',
    isStaffRoleValue(u.role) ? 'staff' : 'community',
    u.created_at || '',
    u.last_sign_in_at || '',
    isSuspended(u.banned_until) ? u.banned_until || '' : '',
    u.discord_username || u.discord_user_id || '',
    (u.team_memberships || [])
      .map((tm) => `${tm.team_name} (${tm.role || '—'})`)
      .join('; '),
  ];
}

/** CSV complet : BOM, en-tête, une ligne par compte, CRLF. */
export function buildUsersCsv(users: readonly UserLite[]): string {
  const lines = [
    USERS_EXPORT_CSV_COLUMNS.join(','),
    ...users.map((u) => userCsvRow(u).map(usersCsvCell).join(',')),
  ];
  return CSV_BOM + lines.join('\r\n');
}

/** `utilisateurs-YYYY-MM-DD.csv` (date UTC). */
export function usersExportFilename(now: Date = new Date()): string {
  return `utilisateurs-${now.toISOString().slice(0, 10)}.csv`;
}
