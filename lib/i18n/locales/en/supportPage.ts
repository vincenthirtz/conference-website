// lib/i18n/locales/en/supportPage.ts
//
// Traductions ANGLAISES du namespace `supportPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/supportPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  catDisputeLabel: 'Dispute / Contestation',
  catDisputeDesc:
    'Contested score, abusive forfeit, disagreement over a result...',
  catBehaviorLabel: 'Behavior / Safety',
  catBehaviorDesc:
    'Toxicity, harassment, inappropriate behavior, offensive remarks...',
  catTechnicalLabel: 'Technical issue',
  catTechnicalDesc: 'Site bug, lobby connection problem, etc.',
  catOtherLabel: 'Other',
  catOtherDesc: 'Any other report.',
  sevLowLabel: 'Low',
  sevLowHint: 'Not urgent',
  sevMediumLabel: 'Medium',
  sevMediumHint: 'To handle within 24-48h',
  sevHighLabel: 'High',
  sevHighHint: 'Safety or urgent — immediate moderation ping',
  errMessageTooShort: 'The message must be at least 10 characters',
  errEmailRequired: 'Email required (or check "Stay anonymous")',
  errSubmit: 'Submission failed',
  pageTitle: 'Report / Support',
  pageSubtitle:
    'Dispute, inappropriate behavior, technical issue: report it here. You can stay anonymous.',
  successTitle: 'Report received',
  successBody: 'Our moderation team is reviewing it.',
  referenceLabel: 'Reference :',
  anotherReport: 'Submit another report',
  categoryLabel: 'Category',
  severityLabel: 'Severity',
  anonToggle: 'Stay anonymous',
  anonHint:
    "No personal information is sent. Moderation won't be able to contact you back.",
  nameLabel: 'Your name (optional)',
  namePlaceholder: 'Ada Lovelace',
  emailLabel: 'Email',
  emailPlaceholder: 'you@example.com',
  subjectLabel: 'Subject (optional)',
  subjectPlaceholder: 'Short summary of the report',
  messageLabel: 'Message',
  messagePlaceholder:
    'Describe the situation: what, who, when, where... For behavior, quote specific messages if possible.',
  reportedTitle: 'Person or team concerned (optional)',
  reportedHint: 'This information helps moderation handle the report.',
  reportedTypeLabel: 'Type',
  reportedTypeNone: '— None —',
  reportedTypePlayer: 'Player',
  reportedTypeTeam: 'Team',
  reportedTypeOrg: 'Organization / Association',
  reportedNameLabel: 'Nickname or name',
  reportedNamePlaceholder: 'Nickname or name of the person/team concerned',
  reportedBattleTagLabel: 'BattleTag (optional)',
  reportedBattleTagPlaceholder: 'Nickname#12345',
  errReportedNameRequired:
    'Enter the nickname or name concerned (or set the type back to "None")',
  submitting: 'Sending...',
  submit: 'Send the report',
  discordNote:
    'For any immediate emergency, also contact moderation on Discord.',
};
