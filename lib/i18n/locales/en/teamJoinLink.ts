// lib/i18n/locales/en/teamJoinLink.ts
//
// Traductions ANGLAISES du namespace `teamJoinLink`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamJoinLink.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  // --- public page ---------------------------------------------------------
  pageTitle: 'Join a team',
  eyebrow: 'Invitation',
  heading: 'Join {team}',
  body: 'This link adds you to the {team} roster as {role}.',
  loading: 'Loading…',
  pending: 'One moment…',
  join: 'Join the team',
  loginRequired: 'Sign in to join this team.',
  loginCta: 'Sign in',
  registerCta: 'Create an account',
  battleTagLabel: 'Your BattleTag',
  battleTagPlaceholder: 'Name#1234',
  battleTagHint: 'Blizzard format: name, hash, four digits.',
  specialtyLabel: 'Your role in game (optional)',
  specialtyNone: 'Not sure yet',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  remainingUses: '{count} seat(s) left on this link.',
  expiresAt: 'This link expires on {date}.',
  joinedTitle: 'Welcome!',
  joinedBody: 'You are now part of {team}.',
  alreadyMemberTitle: 'You are already in',
  alreadyMemberBody: 'You are already part of {team}.',
  goToTeamSpace: 'Go to my team space',
  errorTitle: 'Link unavailable',
  errorNotFound: 'This link is invalid, expired or already used.',
  errorNetwork: 'A network error occurred. Try again.',
  errorAction: 'You could not be added to the roster.',
  backHome: 'Back to home',
  rolePlayer: 'player',
  roleSubstitute: 'substitute',
  roleCoach: 'coach',
  roleManager: 'manager',

  // --- management panel (team space) ---------------------------------------
  panelTitle: 'Invite link',
  panelIntro:
    'A private link to share (Discord, voice chat…): whoever opens it joins the roster, no email needed.',
  panelNone: 'No active link right now.',
  panelGenerate: 'Generate a link',
  panelRegenerate: 'Regenerate',
  panelRevoke: 'Revoke',
  panelCopy: 'Copy',
  panelCopied: 'Link copied',
  panelTokenOnce: 'Copy it now: for safety it will never be shown again.',
  panelActive: 'Active link, {role}, expires on {date}.',
  panelUses: '{used} use(s) out of {max}.',
  panelUsesUnlimited: '{used} use(s), no cap.',
  panelRoleLabel: 'Granted role',
  panelMaxUsesLabel: 'Number of seats',
  panelMaxUsesUnlimited: 'Unlimited',
  panelTtlLabel: 'Valid for',
  panelTtlDays: '{count} days',
  panelConfirmRevoke: 'Revoke this link? It stops working immediately.',
  panelError: 'The link could not be updated.',
};
