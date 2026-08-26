// lib/i18n/locales/admin-en/adminTeamsNew.ts
//
// Traductions ANGLAISES du namespace admin `adminTeamsNew`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminTeamsNew.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: 'Admin – New team',
  backToList: 'Back to team list',
  heading: 'Create a new team',
  subtitle: 'Fill in the general information and the team members',
  mainInfoTitle: 'Main information',
  nameLabel: 'Team name',
  namePlaceholder: 'e.g. Phoenix',
  shortNameLabel: 'Tag / short name',
  shortNamePlaceholder: 'e.g. PNX',
  countryLabel: 'Country',
  countryPlaceholder: 'e.g. France',
  logoLabel: 'Team logo',
  descriptionLabel: 'Description',
  descriptionPlaceholder:
    'A few details about the team, achievements, play style, etc.',
  captainEmailLabel: 'Captain email',
  captainEmailHelp: 'The API will convert this email into captain_id.',
  membersTitle: 'Team members',
  membersSubtitle: 'Add players / staff with their email and a role',
  add: 'Add',
  memberEmailLabel: 'Email (auth.users)',
  roleLabel: 'Role',
  removeMemberTitle: 'Remove this member',
  membersHelp:
    'The API will create the rows in team_members with the role and user_id matching each email.',
  summaryTitle: 'Team summary',
  summaryName: 'Name',
  summaryTag: 'Tag',
  summaryCountry: 'Country',
  summaryCaptain: 'Captain',
  summaryMembers: 'Members',
  summaryHelp:
    'You can edit the team and its members later via the admin interface.',
  actionsTitle: 'Actions',
  actionsHint: 'Double-check the emails (they must exist in auth.users).',
  creating: 'Creating...',
  submit: 'Create team',
  cancel: 'Cancel',
  toastCreated: 'Team created successfully',
  errUnexpected: 'Unexpected error',
  emailExamplePlaceholder: 'player@example.com',
};
