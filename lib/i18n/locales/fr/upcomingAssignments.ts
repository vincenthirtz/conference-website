// lib/i18n/locales/fr/upcomingAssignments.ts
//
// Traductions FRANCAISES du namespace `upcomingAssignments` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../en.json` (blob charge paresseusement).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../parity.ts` casse le typecheck sinon.

import { ns } from '../../ns';

export default ns('upcomingAssignments', {
  title: 'Tes prochaines assignations',
  emptyBody:
    'Aucune assignation cast dans les 24h. Reviens plus tard ou contacte le Director.',
  scrim: 'Scrim',
  match: 'Match',
  notScheduled: 'Non programmé',
  roleFallback: 'Caster',
  vs: 'vs',
  stream: 'Stream',
  now: 'maintenant',
  inMinutes: 'dans {count} min',
  agoMinutes: 'il y a {count} min',
  inHours: 'dans {count}h',
  agoHours: 'il y a {count}h',
  inDays: 'dans {count}j',
  agoDays: 'il y a {count}j',
});
