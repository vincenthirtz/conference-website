// lib/i18n/locales/admin-fr/adminMatchLineups.ts
//
// Traductions FRANCAISES du namespace admin `adminMatchLineups` — SOURCE DE
// VERITE. Le pendant anglais vit dans `../admin-en/adminMatchLineups.ts`.

import { adminNs } from '../../ns';

export default adminNs('adminMatchLineups', {
  heading: 'Feuilles de match',
  unknownTeam: 'Équipe inconnue',
  badgeTeam: 'Validée par l’équipe',
  badgeAdmin: 'Validée par le staff',
  badgeDraft: 'Brouillon',
  awaitingCheckin: 'En attente du check-in de l’équipe.',
  closed: 'Feuille close pour ce match.',
  noPlayers: 'Aucune joueuse déclarée.',
  substitute: '(remplaçante)',
  validatedAt: 'Validée le {date}.',
  validateForTeam: 'Valider à sa place',
  reopen: 'Rouvrir',
  footnote:
    'Valider à la place d’une équipe la marque « validée par le staff » : elle n’engage pas l’équipe de la même façon. Rouvrir est le seul geste qui défige une feuille validée.',
});
