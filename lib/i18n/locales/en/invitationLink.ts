// lib/i18n/locales/en/invitationLink.ts
//
// Traductions ANGLAISES du namespace `invitationLink`.
//
// La SOURCE DE VERITE est le francais (`../fr/invitationLink.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Team invitation',
  eyebrow: 'Invitation',
  heading: 'Join {team}',
  body: 'You are invited to join the team {team} as {role}.',
  captainNote: 'By accepting, you become the team captain.',
  sentTo: 'Invitation sent to {email}',
  accept: 'Accept invitation',
  reject: 'Decline',
  pending: 'One moment…',
  loading: 'Loading…',
  loginRequired: 'Sign in with the invited address to accept or decline.',
  loginDiscordWarning:
    'Heads-up: "Continue with Discord" signs you in with your Discord account address. If it differs from the invited address, the invitation will be rejected.',
  loginCta: 'Sign in',
  connectedAs: 'Signed in as {email}',
  mismatchTitle: 'This is not the invited account',
  mismatchBody:
    'This invitation is for {invited}, but you are signed in as {current}. Sign in again with the invited address — if you came in through Discord, your Discord address is probably not that one. Otherwise, ask your captain to re-invite you at the address you use here.',
  switchAccount: 'Switch account',
  acceptedTitle: 'Welcome!',
  acceptedBody: 'You are now part of the team {team}.',
  acceptedCaptainBody: 'You are now the captain of {team}.',
  rejectedTitle: 'Invitation declined',
  rejectedBody: 'The team has been notified that you decline the invitation.',
  goToTeamSpace: 'Go to my team space',
  errorTitle: 'Invitation unavailable',
  errorNotFound: 'This invitation link is invalid, expired or already used.',
  errorNetwork: 'A network error occurred. Please try again.',
  errorAction: 'The action could not be completed.',
  backHome: 'Back to home',
  rolePlayer: 'player',
  roleSubstitute: 'substitute',
  roleCoach: 'coach',
  roleManager: 'manager',
  roleCaptain: 'captain',
};
