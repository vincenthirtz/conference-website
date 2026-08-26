// lib/i18n/locales/admin-en/adminTeamMessages.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamMessages`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamMessages.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heading: 'Contact teams',
  subtitle:
    'Post a message in the Discord text channel of every team registered for {tournament}.',
  loadError: 'Could not load team status.',
  noTournament: 'No ongoing tournament — nothing to send.',
  unprovisionedWarning:
    '{count} team(s) have no provisioned text channel: they will be skipped.',
  sectionTargets: 'Target teams',
  sectionCompose: 'Message',
  sectionPreview: 'Preview ({count} message(s))',
  colSelect: 'Selection',
  colTeam: 'Team',
  colRoster: 'Starters',
  colIssues: 'Attention points',
  colChannel: 'Channel',
  selectTeamAria: 'Target team {team}',
  issueDormant: '{count} never signed in',
  issueBattleTag: '{count} without BattleTag',
  channelOk: 'Provisioned',
  channelMissing: 'Missing',
  kindIncomplete: 'Incomplete roster',
  kindWarnings: 'Complete, needs a check',
  kindComplete: 'Complete',
  kindCustom: 'Custom',
  presetRoster: 'Roster reminder (auto-personalised)',
  presetCustom: 'Free-form template',
  presetRosterHint:
    'Each team gets a message tailored to its actual state: missing starters, accounts that never signed in, missing BattleTags, deadline and start date.',
  templateLabel: 'Message template',
  templatePlaceholder:
    'Hi {equipe} — you are missing {manquants} player(s) out of {minimum}…',
  variablesHint: 'Available variables:',
  mentionLabel: 'Mention the team role (notification)',
  onlyLabel: 'Send to',
  onlyAll: 'all selected teams',
  onlyNeedsAttention: 'those with an attention point',
  onlyIncomplete: 'those with an incomplete roster',
  previewButton: 'Preview',
  sendButton: 'Send',
  sendDisabledHint: 'Generate a preview first.',
  working: 'Working…',
  templateRequired: 'Write a template before generating the preview.',
  noTeamSelected: 'Select at least one team.',
  previewEmpty: 'No team matches the selected filter.',
  previewError: 'Preview failed.',
  previewNotDeliverable: 'no channel — skipped',
  nothingDeliverable: 'No reachable team in this preview.',
  confirmSend: 'Post the message in {count} Discord channel(s)?',
  confirmSendSubtitle: 'Messages are sent immediately and cannot be recalled.',
  sendSuccess: '{sent} message(s) sent, {skipped} skipped.',
  sendError: 'Sending failed.',
};
