// features/player/notifications/ui/inboxModel.ts — règles pures de
// l'Historique (lot 4) : famille d'une notification, titre et texte dans la
// langue de la joueuse, lien d'action, date relative.
//
// Notifications d'ÉQUIPE (`source: 'team'` avec l'objet `team`) : même rendu
// qu'avant le lot 4 (TeamNotificationsList.tsx) — phrase composée dans la
// langue de l'écran, lien vers la liseuse du règlement. Personnelles : titre
// et texte rangés à l'écriture (le texte du push, en français ; un rendu
// traduit viendra avec le lot 10).

import type nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';
import type { InboxItem } from '../inboxTypes';
import {
  teamNotificationRulesHref,
  teamNotificationText,
  teamNotificationTitle,
} from './TeamNotificationsList';

type Dict = (typeof nsPlayerNotifications)['fr'];

export type InboxGroup = 'match' | 'team' | 'scrim' | 'rules' | 'other';

/** Famille affichée en tête de carte (jamais par la couleur seule). */
export function inboxKindGroup(item: Pick<InboxItem, 'kind'>): InboxGroup {
  const kind = item.kind;
  // Types des notifications d'équipe (`scrim_accepted`, `rules_reminder`…).
  if (kind.startsWith('rules_')) return 'rules';
  if (kind.startsWith('scrim_')) return 'scrim';
  // Événements de l'outbox (`match.scheduled`, `team.join.decided`…).
  const head = kind.split('.')[0];
  switch (head) {
    case 'match':
    case 'checkin':
      return 'match';
    case 'scrim':
      return 'scrim';
    case 'team':
    case 'captain':
    case 'roster':
      return 'team';
    case 'rules':
      return 'rules';
    default:
      return kind.includes('rules') ? 'rules' : 'other';
  }
}

export function inboxItemTitle(item: InboxItem, t: Dict): string {
  if (item.source === 'team' && item.team) {
    return teamNotificationTitle(item.team.kind, t);
  }
  return item.title || t.teamKindFallback;
}

export function inboxItemText(
  item: InboxItem,
  t: Dict,
  locale: string
): string {
  if (item.source === 'team' && item.team) {
    return teamNotificationText(item.team, t, locale);
  }
  return item.body;
}

/**
 * Lien interne seulement (`/player/match/…`) : une URL absolue, `//hôte` ou
 * `javascript:` n'est jamais rendue en lien.
 */
export function safeInternalPath(
  url: string | null | undefined
): string | null {
  if (!url || typeof url !== 'string') return null;
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\'))
    return null;
  return url;
}

export type InboxAction = { href: string; kind: 'rules' | 'open' };

/** Bouton d'action : la liseuse du règlement, sinon le lien de l'entrée. */
export function inboxItemAction(item: InboxItem): InboxAction | null {
  if (item.source === 'team' && item.team) {
    const rules = teamNotificationRulesHref(item.team);
    if (rules) return { href: rules, kind: 'rules' };
  }
  const href = safeInternalPath(item.url);
  return href ? { href, kind: 'open' } : null;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** « il y a 3 heures », « hier »… ; `''` si la date est illisible. */
export function relativeDate(
  iso: string,
  locale: string,
  now: number = Date.now()
): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const seconds = Math.round((time - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return rtf.format(Math.trunc(seconds / size), unit);
    }
  }
  return rtf.format(0, 'minute');
}

/** Date complète (info-bulle) ; `''` si illisible. */
export function absoluteDate(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
