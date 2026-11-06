// features/player/tournamentRules/format.ts — dates et libellés du règlement
// (liseuse, bandeau, carte capitaine). Pur, sans React.

import type nsPlayerTournamentRules from '@/lib/i18n/locales/fr/playerTournamentRules';

type RoleLabels = (typeof nsPlayerTournamentRules.fr)['roles'];

/** « 6 novembre 2026 à 14:32 », heure de Paris (celle du tournoi). */
export function formatRulesDateTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Europe/Paris',
  }).format(d);
}

/** « 6 novembre 2026 », heure de Paris. */
export function formatRulesDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'long',
    timeZone: 'Europe/Paris',
  }).format(d);
}

/** Libellé d'un rôle d'équipe ; un rôle inconnu passe tel quel. */
export function rulesRoleLabel(
  role: string | null | undefined,
  labels: RoleLabels
): string | null {
  if (!role) return null;
  const key = role.trim().toLowerCase() as keyof RoleLabels;
  return labels[key] ?? role;
}
