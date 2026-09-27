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
};
