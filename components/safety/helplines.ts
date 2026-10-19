// components/safety/helplines.ts
//
// Numéros d'urgence et lignes d'écoute de la page /securite (France).
//
// RÈGLES :
//   - uniquement des services nationaux bien établis ;
//   - `allDay` (« 24 h/24, 7 j/7 ») seulement là où c'est sûr. Le 3018 n'en a
//     pas : ses horaires ne sont pas écrits plutôt que risqués ;
//   - le 114 est un numéro d'urgence PAR SMS : lien `sms:`, pas `tel:`.
//
// Liste à faire valider par l'association avant que la page soit liée
// (docs/PLAN-womens-library.md, lot 8). Les textes sont dans le namespace
// `safetyPage` ; ici, seulement ce qui ne se traduit pas.

import type nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';

type SafetyDict = typeof nsSafetyPage.fr;
type SafetyKey = keyof SafetyDict;

export type Helpline = {
  number: string;
  href: `tel:${string}` | `sms:${string}`;
  kind: 'call' | 'sms';
  group: 'urgent' | 'listen';
  allDay: boolean;
  nameKey: SafetyKey;
  bodyKey: SafetyKey;
};

export const HELPLINES: readonly Helpline[] = [
  {
    number: '17',
    href: 'tel:17',
    kind: 'call',
    group: 'urgent',
    allDay: true,
    nameKey: 'line17Name',
    bodyKey: 'line17Body',
  },
  {
    number: '112',
    href: 'tel:112',
    kind: 'call',
    group: 'urgent',
    allDay: true,
    nameKey: 'line112Name',
    bodyKey: 'line112Body',
  },
  {
    number: '114',
    href: 'sms:114',
    kind: 'sms',
    group: 'urgent',
    allDay: true,
    nameKey: 'line114Name',
    bodyKey: 'line114Body',
  },
  {
    number: '3919',
    href: 'tel:3919',
    kind: 'call',
    group: 'listen',
    allDay: true,
    nameKey: 'line3919Name',
    bodyKey: 'line3919Body',
  },
  {
    number: '3018',
    href: 'tel:3018',
    kind: 'call',
    group: 'listen',
    allDay: false,
    nameKey: 'line3018Name',
    bodyKey: 'line3018Body',
  },
  {
    number: '119',
    href: 'tel:119',
    kind: 'call',
    group: 'listen',
    allDay: true,
    nameKey: 'line119Name',
    bodyKey: 'line119Body',
  },
  {
    number: '3114',
    href: 'tel:3114',
    kind: 'call',
    group: 'listen',
    allDay: true,
    nameKey: 'line3114Name',
    bodyKey: 'line3114Body',
  },
];

/** Site du 3018 (e-Enfance) : tchat et application. */
export const E_ENFANCE_3018_URL = 'https://3018.fr';
