// components/admin/navigation/adminMenuIcons.tsx — une icône par ligne du
// menu admin (barre latérale de `AdminShell`).
//
// POURQUOI UN MODULE À PART. `adminNav.ts` est à la limite du garde de taille
// et ses libellés servent aussi aux cartes du dashboard ; l'icône d'une LIGNE
// de menu est une affaire de rendu. On la choisit donc ici, à partir du
// libellé (figé, FR) puis de la route — trois entrées partagent
// `/admin/tournaments`, seul le libellé les distingue.
//
// SVG en ligne, tracé 24 px façon Lucide : aucune dépendance ajoutée, et la
// coquille admin reste légère (bundle-budget).

import type { ReactNode } from 'react';

export type AdminMenuIconKey =
  | 'home'
  | 'calendarCheck'
  | 'checkCircle'
  | 'play'
  | 'trophy'
  | 'list'
  | 'plus'
  | 'webhook'
  | 'swords'
  | 'inbox'
  | 'users'
  | 'userPlus'
  | 'userStar'
  | 'userSearch'
  | 'gauge'
  | 'radio'
  | 'listOrdered'
  | 'clapper'
  | 'layers'
  | 'mic'
  | 'tv'
  | 'handshake'
  | 'cards'
  | 'shield'
  | 'megaphone'
  | 'newspaper'
  | 'userCog'
  | 'building'
  | 'fileText'
  | 'idCard'
  | 'settings'
  | 'scroll'
  | 'network'
  | 'chart'
  | 'rocket'
  | 'hash'
  | 'creditCard'
  | 'kanban'
  | 'folder'
  | 'dot';

/** Tracés (contenu du `<svg viewBox="0 0 24 24">`). */
const PATHS: Record<AdminMenuIconKey, ReactNode> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M10 21v-6h4v6" />
    </>
  ),
  calendarCheck: (
    <>
      <rect x="3" y="4.5" width="18" height="16.5" rx="2" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m10 8.5 5.5 3.5-5.5 3.5z" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M8.5 21h7M9.5 17h5v4h-5z" />
    </>
  ),
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  plus: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </>
  ),
  webhook: (
    <>
      <path d="M18 16.5a3.5 3.5 0 1 1-2.9 5.4" />
      <path d="M9 18H4.5a3.5 3.5 0 1 1 3-5.3L11 7" />
      <path d="M12.5 4.5a3.5 3.5 0 0 1 5.3 3L14 14h4" />
    </>
  ),
  swords: (
    <>
      <path d="M14.5 17.5 3 6V3h3l11.5 11.5" />
      <path d="m13 19 6-6M16 16l4 4M19 21l2-2" />
      <path d="M9.5 6.5 14 2h3v3l-4.5 4.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M22 12h-6l-2 3h-4l-2-3H2" />
      <path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" />
    </>
  ),
  userPlus: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M19 8v6M16 11h6" />
    </>
  ),
  userStar: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 12-3.5" />
      <path d="m18 13 1.2 2.5 2.8.4-2 1.9.5 2.7-2.5-1.3-2.5 1.3.5-2.7-2-1.9 2.8-.4z" />
    </>
  ),
  userSearch: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 10-5.5" />
      <circle cx="17.5" cy="16.5" r="2.5" />
      <path d="m19.5 18.5 2 2" />
    </>
  ),
  gauge: (
    <>
      <path d="M3.5 17a9 9 0 1 1 17 0" />
      <path d="m12 14 4-5" />
      <circle cx="12" cy="14.5" r="1.5" />
    </>
  ),
  radio: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </>
  ),
  listOrdered: (
    <path d="M10 6h11M10 12h11M10 18h11M4 4.5h1.5V9M4 9h3M4 14.5a1.5 1.5 0 0 1 3 .5c0 1-3 2-3 3.5h3" />
  ),
  clapper: (
    <>
      <path d="M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="m3 10 .8-4.2a2 2 0 0 1 2.4-1.6L20 7.3 20.4 10" />
      <path d="m8 5 2.5 4.5M13.5 6.2 16 10.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </>
  ),
  tv: (
    <>
      <rect x="2.5" y="6.5" width="19" height="13" rx="2" />
      <path d="m8 2.5 4 4 4-4" />
    </>
  ),
  handshake: (
    <>
      <path d="m11 17 2 2a1.4 1.4 0 0 0 2-2" />
      <path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2L15 11" />
      <path d="m2.5 11 4-4 5 1.5 3-1.5 7 4-2.5 3.5" />
      <path d="M6.5 7 4 15l5 4" />
    </>
  ),
  cards: (
    <>
      <rect x="7" y="3" width="12" height="16" rx="2" />
      <path d="M4 7v11a3 3 0 0 0 3 3h9" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 4.5 6v5.5c0 4.5 3.2 8.2 7.5 9.5 4.3-1.3 7.5-5 7.5-9.5V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  megaphone: (
    <>
      <path d="M3 10.5v3a1.5 1.5 0 0 0 1.5 1.5H7l6 4V5L7 9H4.5A1.5 1.5 0 0 0 3 10.5z" />
      <path d="M16.5 9a4 4 0 0 1 0 6M19.5 6.5a7.5 7.5 0 0 1 0 11" />
    </>
  ),
  newspaper: (
    <>
      <path d="M4 5h13v14a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2z" />
      <path d="M17 9h3v10a2 2 0 0 1-4 0M7.5 9h6M7.5 13h6M7.5 17h3" />
    </>
  ),
  userCog: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 10.5-5" />
      <circle cx="18" cy="17" r="2" />
      <path d="M18 13.5V15M18 19v1.5M21 17h-1M16 17h-1.5M20.1 14.9l-.7.7M16.6 18.4l-.7.7M20.1 19.1l-.7-.7M16.6 15.6l-.7-.7" />
    </>
  ),
  building: (
    <>
      <path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M16 9h2a2 2 0 0 1 2 2v10M2.5 21h19" />
      <path d="M8 7h4M8 11h4M8 15h4" />
    </>
  ),
  fileText: (
    <>
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <path d="M14 3v5h5M8.5 13h7M8.5 17h5" />
    </>
  ),
  idCard: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5.5 16a3 3 0 0 1 6 0M14 10h4.5M14 14h3" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v2.5M12 19v2.5M21.5 12H19M5 12H2.5M18.7 5.3 17 7M7 17l-1.7 1.7M18.7 18.7 17 17M7 7 5.3 5.3" />
    </>
  ),
  scroll: (
    <>
      <path d="M8 21h11a2 2 0 0 0 2-2v-1H10v1a2 2 0 0 1-4 0V5a2 2 0 0 0-2-2" />
      <path d="M4 3h11a2 2 0 0 1 2 2v13M10 8h4M10 12h4" />
    </>
  ),
  network: (
    <>
      <rect x="9" y="2.5" width="6" height="5" rx="1" />
      <rect x="2.5" y="16.5" width="6" height="5" rx="1" />
      <rect x="15.5" y="16.5" width="6" height="5" rx="1" />
      <path d="M12 7.5v4.5M5.5 16.5V12h13v4.5" />
    </>
  ),
  chart: <path d="M3 3v18h18M7.5 16v-4M12 16V8M16.5 16v-6" />,
  rocket: (
    <>
      <path d="M5 15c-1.5 1.3-2 5-2 5s3.7-.5 5-2a2.1 2.1 0 0 0-3-3z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-4A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22 22 0 0 1-4 2z" />
      <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
    </>
  ),
  hash: <path d="M4.5 9h15M4.5 15h15M10 3.5 8 20.5M16 3.5l-2 17" />,
  creditCard: (
    <>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="M2.5 10h19M6.5 15h4" />
    </>
  ),
  kanban: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 7v7M12 7v4M16 7v10" />
    </>
  ),
  folder: (
    <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.3l2 2.5h8.7A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />
  ),
  dot: <circle cx="12" cy="12" r="2.5" />,
};

/** Libellé (FR figé du menu) → icône. Prioritaire : plusieurs lignes partagent une route. */
const BY_TITLE: Record<string, AdminMenuIconKey> = {
  Dashboard: 'home',
  'Pilotage du jour': 'calendarCheck',
  'Check-in': 'checkCircle',
  'Tournoi en cours': 'play',
  Tournois: 'trophy',
  'Tournois – liste': 'list',
  'Créer un tournoi': 'plus',
  'Webhooks Discord (par tournoi)': 'webhook',
  'Check-in matchs (par tournoi)': 'checkCircle',
  Scrims: 'swords',
  'Scrims – liste': 'list',
  'Créer un scrim': 'plus',
  'Demandes de scrim': 'inbox',
  Équipes: 'users',
  'Équipes – liste': 'list',
  'Créer une équipe': 'plus',
  'Gérer mon équipe (capitaine)': 'userStar',
  'Joueuses libres': 'userSearch',
  'Demandes joueurs / équipes': 'inbox',
  Cockpit: 'gauge',
  'Console live': 'radio',
  'Run-of-show': 'listOrdered',
  Scènes: 'clapper',
  Overlays: 'layers',
  Casteuses: 'mic',
  'Chaînes Twitch': 'tv',
  Partenaires: 'handshake',
  TCG: 'cards',
  Modération: 'shield',
  Communications: 'megaphone',
  'Créer une actualité': 'newspaper',
  'Gérer les utilisateurs': 'userCog',
  'Créer un utilisateur': 'userPlus',
  'Planning du staff': 'calendarCheck',
  Association: 'building',
  'Documents de l’asso': 'fileText',
  'Ajouter un adhérent': 'idCard',
  'Paramètres du site': 'settings',
  'Logs & stats': 'chart',
  Journaux: 'scroll',
  Réseau: 'network',
  Statistiques: 'chart',
  Onboarding: 'rocket',
  'Salons Discord': 'hash',
  Facturation: 'creditCard',
  Tâches: 'kanban',
};

/** Repli par route, pour une entrée ajoutée au menu sans passer par ici. */
const BY_ROUTE: [RegExp, AdminMenuIconKey][] = [
  [/\/(new|create)\b|[?&]new=1/, 'plus'],
  [/^\/admin\/?$/, 'home'],
  [/tournament|tournoi|stage|bracket|league/, 'trophy'],
  [/scrim/, 'swords'],
  [/team|player|user|adherent|member/, 'users'],
  [/demande|request|inbox/, 'inbox'],
  [/regie|broadcast|diffusion|caster|twitch|overlay|event/, 'radio'],
  [/moderation|blacklist|dispute/, 'shield'],
  [/communication|news|mail/, 'megaphone'],
  [/setting|config|tenant|api-token|webhook/, 'settings'],
  [/log|stat|rating|metric/, 'chart'],
  [/task/, 'kanban'],
  [/billing|payment/, 'creditCard'],
  [/discord/, 'hash'],
  [/document|drive/, 'fileText'],
];

export function adminMenuIconKey(
  title: string,
  ref: string | undefined,
  isSection = false
): AdminMenuIconKey {
  const byTitle = BY_TITLE[title];
  if (byTitle) return byTitle;
  const route = ref ?? '';
  for (const [re, key] of BY_ROUTE) if (route && re.test(route)) return key;
  return isSection ? 'folder' : 'dot';
}

export default function AdminMenuIcon({
  title,
  href,
  isSection = false,
  className = '',
}: {
  title: string;
  href?: string;
  isSection?: boolean;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${className}`}
    >
      {PATHS[adminMenuIconKey(title, href, isSection)]}
    </svg>
  );
}
