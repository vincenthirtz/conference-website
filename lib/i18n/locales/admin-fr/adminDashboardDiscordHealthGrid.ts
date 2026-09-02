// lib/i18n/locales/admin-fr/adminDashboardDiscordHealthGrid.ts
//
// Traductions FRANCAISES du namespace `adminDashboardDiscordHealthGrid` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminDashboardDiscordHealthGrid', {
  channelMatchAnnouncements: 'Annonces match',
  channelMatchResults: 'Résultats',
  channelBracketUpdates: 'Bracket',
  channelVetoLive: 'Veto live',
  channelCheckinReminders: 'Check-in',
  channelSupportTickets: 'Support',
  channelMvpPolls: 'MVP polls',
  ageNow: "à l'instant",
  ageMinutes: 'il y a {n} min',
  ageHours: 'il y a {n}h',
  ageDays: 'il y a {n}j',
  tipOkPosted: 'Dernière POST {age}',
  tipOkNoHistory: 'Configuré et actif (aucun historique encore)',
  tipStalePosted: "Pas posté depuis {age} alors qu'on attend du trafic",
  tipStaleNoPost: "Aucun POST récent alors qu'on attend du trafic",
  tipFailed: 'Le dernier POST a échoué (HTTP non-2xx)',
  tipInactive: 'Webhook configuré mais désactivé',
  tipMissing: 'Aucun webhook configuré pour ce canal',
  shortSilence: 'silence',
  shortFailed: 'échec',
  missingWarning:
    "⚠️ {count} canal/canaux manquent un webhook actif alors qu'on attend du trafic.",
});
