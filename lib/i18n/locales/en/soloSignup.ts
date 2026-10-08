// lib/i18n/locales/en/soloSignup.ts
//
// Traductions ANGLAISES du namespace `soloSignup`.
//
// La SOURCE DE VERITE est le francais (`../fr/soloSignup.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont les
// valeurs sont de type `string`.

export default {
  badge: 'Individual sign-up',
  title: 'Sign me up',
  subtitle:
    'No team, no teammates needed: you enter on your own, under your own handle.',
  backToTournament: 'Back to the tournament page',

  formTitle: 'Your details',
  formHint: "Three fields, two minutes. You don't need an account.",

  pseudoLabel: 'Handle',
  pseudoHelp: "This is the name you'll appear under in the standings.",
  pseudoPlaceholder: 'Your in-game handle',

  battleTagLabel: 'BattleTag',
  battleTagHelp: "Format Name#1234 — that's how we invite you to the lobby.",
  battleTagPlaceholder: 'Name#1234',

  emailLabel: 'Email',
  emailHelp:
    'Used to reach you and send your sign-in link. Never shown publicly.',
  emailPlaceholder: 'you@example.com',

  extraTitle: 'Additional information',
  extraRequiredMark: '(required)',
  extraSelectPlaceholder: 'Choose…',

  captchaLabel: 'Anti-bot check',
  captchaPlaceholder: 'Your answer',

  submit: 'Sign me up',
  submitting: 'Signing up…',

  validationPseudo: 'Enter a handle of at least 2 characters.',
  validationEmail: 'Enter a valid email address.',
  validationBattleTag: 'BattleTag should look like Name#1234.',
  validationCaptcha: 'Answer the anti-bot question.',
  validationFieldRequired: 'This field is required.',

  successTitle: "You're in",
  successBody: 'Your entry for {tournament} is registered. See you on the day.',
  successPendingTitle: 'Entry submitted',
  successPendingBody:
    'Staff review entries for {tournament} one by one. You will hear from us as soon as yours is confirmed.',
  successEmailSent:
    'A sign-in link is on its way to {email}: it gives you access to your player space.',
  successAnother: 'Sign up another player',

  errGeneric: 'Sign-up failed. Try again in a moment.',
  errRateLimited: 'Too many attempts. Try again in a few minutes.',
  errCaptchaInvalid:
    'Wrong anti-bot answer. A new question is waiting for you.',
  errNameTooShort: 'That handle is too short.',
  errNameTooLong: 'That handle is too long.',
  errSlugConflict:
    'That handle is already taken for this event. Add a digit or a variant.',
  errBattletagRequired: 'A BattleTag is required to enter.',
  errBattletagInvalid: 'BattleTag should look like Name#1234.',
  errFieldErrors: 'Some fields need fixing.',
  errServiceUnavailable: 'The service is temporarily unavailable.',
  errServerError: 'Something went wrong on our side.',

  closedTitle: 'Entries are not open',
  closedBody:
    'This event is not taking entries right now. Check back a little later, or ask staff where things stand.',
  prefilledNotice:
    'Filled in from your profile: check it, answer the anti-bot question and submit.',
  // --- Pooled 5-player teams (pooled_teams) ---------------------------------
  poolSubtitle:
    'Sign up on your own: as soon as 5 players from your team have signed up, the team is entered. No team, or your team isn’t complete? Staff will place you in a team before the event.',
  poolLoading: 'Loading…',
  poolLoginTitle: 'Log in to sign up',
  poolLoginBody:
    'Your account tells us which team you play for: that’s how your team gets entered as soon as there are 5 of you.',
  poolLoginCta: 'Log in',
  poolFormTitle: 'My entry',
  poolFormHint:
    'Pick your team: it is entered as soon as {needed} of its players have signed up. Otherwise you join the waitlist and staff will place you.',
  poolTeamLabel: 'My team',
  poolNoTeam: 'I don’t have a team',
  poolTeamHelp:
    'Only teams you play for are listed (not those where you are coach or manager).',
  poolTeamLockedHelp:
    'You are already placed in an entered team: contact staff to change it.',
  poolSubmit: 'Sign me up',
  poolSave: 'Save',
  poolCancel: 'Cancel',
  poolEdit: 'Edit',
  poolWithdraw: 'Withdraw',
  poolErrNotMember: 'You are not a member of this team.',
  poolTeamJustRegistered: 'That’s 5 of you: your team is entered! 🎉',
  poolPlacedTitle: 'You’re in',
  poolPlacedBody: 'You play for {team}.',
  poolWaitTeamTitle: 'Waiting for your team',
  poolWaitTeamBody:
    '{count} / {needed} players from {team} have signed up. The team is entered automatically once there are {needed} of you: nudge your teammates!',
  poolWaitTeamFull:
    'Your team is already entered with 5 players: you stay on the waitlist, and staff may place you in another team.',
  poolWaitSoloTitle: 'You’re on the waitlist',
  poolWaitSoloBody:
    'Staff will place you in a team before the event. You’ll be notified.',
  poolRecap: 'Signed up as {pseudo} ({tag}).',
  eventCardEyebrow: 'Event',
  eventCardTitle: 'Halloween Event — {date}',
  eventCardPitch:
    'Two maps, a random ultimate in your role and virtual candy to win. Sign up in one click!',
  eventCardRecapTeam: 'You will be signed up as {pseudo} ({tag}) with {team}.',
  eventCardRecapSolo:
    'You will be signed up as {pseudo} ({tag}) — staff will place you in a team.',
  eventCardOneClick: 'Sign me up in one click',
  eventCardComplete: 'Complete my sign-up',
  eventCardMissingInfo:
    'Your username or BattleTag is missing: fill them in on the sign-up page.',
  eventCardDetails: 'See the event',
  eventCardRegistered: 'You are signed up for the Halloween Event 🎃',
  eventCardManage: 'My sign-up',
  eventCardLogoAlt: 'Halloween Event logo',
};
