// lib/i18n/locales/admin-fr/adminTeamMessages.ts
//
// Traductions FRANCAISES du namespace `adminTeamMessages` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminTeamMessages', {
  heading: 'Contacter les équipes',
  subtitle:
    'Poste un message dans le salon textuel Discord de chaque équipe inscrite à {tournament}.',
  loadError: "Impossible de charger l'état des équipes.",
  noTournament: 'Aucun tournoi en cours — rien à envoyer.',
  unprovisionedWarning:
    "{count} équipe(s) n'ont pas de salon textuel provisionné : elles seront ignorées à l'envoi.",
  sectionTargets: 'Équipes ciblées',
  sectionCompose: 'Message',
  sectionPreview: 'Aperçu ({count} message(s))',
  colSelect: 'Sélection',
  colTeam: 'Équipe',
  colRoster: 'Titulaires',
  colIssues: "Points d'attention",
  colChannel: 'Salon',
  selectTeamAria: "Cibler l'équipe {team}",
  issueDormant: '{count} jamais connectée(s)',
  issueBattleTag: '{count} sans BattleTag',
  channelOk: 'Provisionné',
  channelMissing: 'Absent',
  kindIncomplete: 'Roster incomplet',
  kindWarnings: 'Complet, à vérifier',
  kindComplete: 'Complet',
  kindCustom: 'Personnalisé',
  presetRoster: 'Rappel roster (auto-personnalisé)',
  presetCustom: 'Gabarit libre',
  presetRosterHint:
    'Chaque équipe reçoit un message adapté à son état réel : titulaires manquants, comptes jamais connectés, BattleTags absents, deadline et date de début.',
  templateLabel: 'Gabarit du message',
  templatePlaceholder:
    'Bonjour {equipe} — il vous manque {manquants} joueuse(s) sur {minimum}…',
  variablesHint: 'Variables disponibles :',
  mentionLabel: "Mentionner le rôle de l'équipe (notification)",
  onlyLabel: 'Envoyer à',
  onlyAll: 'toutes les équipes sélectionnées',
  onlyNeedsAttention: "celles avec un point d'attention",
  onlyIncomplete: 'celles au roster incomplet',
  previewButton: 'Aperçu',
  sendButton: 'Envoyer',
  sendDisabledHint: "Génère d'abord un aperçu.",
  working: 'En cours…',
  templateRequired: "Écris un gabarit avant de générer l'aperçu.",
  noTeamSelected: 'Sélectionne au moins une équipe.',
  previewEmpty: 'Aucune équipe ne correspond au filtre choisi.',
  previewError: "Échec de l'aperçu.",
  previewNotDeliverable: 'pas de salon — ignorée',
  nothingDeliverable: 'Aucune équipe contactable dans cet aperçu.',
  confirmSend: 'Poster le message dans {count} salon(s) Discord ?',
  confirmSendSubtitle:
    'Les messages partent immédiatement et ne peuvent pas être rappelés.',
  sendSuccess: '{sent} message(s) envoyé(s), {skipped} ignoré(s).',
  sendError: "Échec de l'envoi.",
});
