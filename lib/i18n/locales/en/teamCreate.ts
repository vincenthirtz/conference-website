// lib/i18n/locales/en/teamCreate.ts
//
// Traductions ANGLAISES du namespace `teamCreate`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamCreate.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badgePublic: 'Public',
  badgeTeam: 'Team',
  title: 'Create a team',
  subtitle:
    "Add your team's key info and, if you like, fill in the whole roster (existing emails or accounts created automatically) all at once.",
  tournamentEyebrow: 'Tournament registration',
  tournamentRegisteredText:
    'Your team will be automatically registered for the tournament',
  registrationsEyebrow: 'Team registrations',
  registrationsDesc:
    'Milestones and key dates are detailed in the roadmap. Check the 2026 timeline to anticipate the next steps.',
  viewTimeline: 'View the 2026 timeline ↗',
  firstTimeEyebrow: 'First time?',
  firstTimeDesc:
    'See in pictures what you can do from your captain space: roster, applications, scrims, check-in and messaging.',
  viewGuide: 'View the captain guide ↗',
  teamInfoEyebrow: 'Team information',
  mainDetailsTitle: 'Main details',
  backHomeArrow: '← Back to home',
  backHome: 'Back to home',
  nameLabel: 'Team name',
  namePlaceholder: 'E.g. Phénix',
  shortNameLabel: 'Tag / short name',
  countryLabel: 'Country / region',
  countryPlaceholder: 'France, Europe…',
  discordLabel: 'Discord / contact (optional)',
  logoLabel: 'Logo (URL)',
  websiteLabel: 'Website (optional)',
  descriptionLabel: 'Description',
  descriptionPlaceholder: 'Quick pitch, achievements, ambitions…',
  rosterEyebrow: 'Roster (optional)',
  rosterTitle: 'Add several players',
  rosterMax: 'Up to 5 people',
  emailLabel: 'Email',
  emailPlaceholder: 'player@email.tld',
  roleLabel: 'Role',
  battleTagLabel: 'BattleTag',
  battleTagPlaceholder: 'Name#0000',
  battleTagOptionalNote: 'Optional outside tournament registration.',
  customFieldsEyebrow: 'Registration',
  customFieldsTitle: 'Additional information',
  customFieldRequiredMark: '*',
  customFieldSelectPlaceholder: 'Select…',
  customFieldRequiredError: 'This field is required.',
  specialtyLabel: 'Specialty',
  specialtyNone: 'Unspecified',
  specialtyTank: 'Tank',
  specialtyDps: 'DPS',
  specialtySupport: 'Support',
  specialtyFlex: 'Flex',
  captainLabel: 'Captain',
  captainDesignatedLabel: 'Designated captain',
  creatorRoleLegend: 'You are creating this team as',
  creatorRoleCaptain: 'Captain',
  creatorRoleCaptainHint:
    'You play on the team and lead it. You are added to the roster right away.',
  creatorRoleManager: 'Manager',
  creatorRoleManagerHint:
    'You run the team without playing on it. You handle the roster, scrims and registrations — and you can run several teams.',
  managerEmailLabel: 'Your email (manager)',
  managerEmailHint: 'This is where the link to your team space is sent.',
  managerCaptainNote:
    'Pick the captain among the players if you already know who it is: she becomes captain when she accepts her invitation. Otherwise you can designate her later from your team space.',
  removeMember: 'Remove',
  addMember: 'Add a person',
  addMemberHint:
    'We look up the user by email; if no account exists, one is created automatically before being added.',
  addStaff: 'Add staff',
  addStaffHint:
    'Playing roster is full. You can still add staff: coaches and managers do not take a roster slot.',
  captchaLabel: 'Anti-bot check',
  captchaPlaceholder: 'Answer',
  captchaRefresh: 'Another question ↻',
  submitting: 'Creating...',
  submit: 'Create the team',
  errorBattleTagRequired:
    'BattleTag required for each member (format Name#0000) when registering for a tournament.',
  errorBattleTagInvalid:
    "Invalid BattleTag format (expected: Name#0000). Leave blank if you'd rather not provide it.",
  errorCreateFailed: 'Unable to create the team',
  toastCreated:
    'Team created! Invited players must accept the invitation to join.',
  errorUnexpected: 'Unexpected error',
  resultTitle: 'Result',
  resultCreatedFallback: 'Team created',
  resultTeamLabel: 'Team:',
  resultIdLabel: 'ID:',
  resultRegistered: 'Registered for the tournament « {name} »',
  resultApplied: 'Application sent for the tournament « {name} »',
  resultAppliedDesc:
    "Until your teammates accept their invitation, registration isn't automatic: the staff reviews the application. You can follow it from your team space.",
  viewTeamPage: 'View team page ↗',
  invitedPlayers: 'Invited players',
  invitedPlayersHint:
    'They must accept the invitation from their player space to join the team.',
  memberRoleLabel: 'role:',
  memberCaptainLabel: 'captain:',
  yes: 'yes',
  no: 'no',
  resultEmpty:
    'After submission, the created team and linked members (if provided) will appear here.',
  note1:
    'Members are looked up by email in Supabase auth; an account is created if needed.',
  note2:
    "Teammates receive an invitation: they join the team once they've accepted it.",
  note3: 'Select a captain from the list if needed.',
  note4: 'The slug is generated automatically from the name.',
  stepLabel: 'Step {current} of {total}',
  stepIdentity: 'Identity',
  stepRoster: 'Roster',
  stepSubmit: 'Tournament & submit',
  next: 'Next',
  previous: 'Previous',
  roleOptionPlayer: 'Player',
  roleOptionCoach: 'Coach',
  roleOptionSub: 'Substitute',
  roleOptionManager: 'Manager',
  validationNameRequired: 'The team name is required.',
  validationNameTooShort: 'The name must be at least 2 characters.',
  validationNameTooLong: 'The name cannot exceed 100 characters.',
  validationLogoUrl: 'The logo URL is invalid (http:// or https://).',
  validationWebsiteUrl: 'The website URL is invalid (http:// or https://).',
  validationDiscordUrl: 'The Discord link is invalid (http:// or https://).',
  validationEmailInvalid: 'Invalid email address: {email}',
  validationCaptainRequired: 'Select a captain among the members.',
  validationManagerEmailRequired: 'Enter your manager email.',
  validationManagerEmailDuplicate:
    'This email already belongs to a player on the roster: use another address.',
  validationSummary: 'Please fix the following before continuing:',
  errRateLimited: 'Too many attempts. Please try again in a few minutes.',
  errHoneypot: 'Submission rejected. Reload the page and try again.',
  errCaptchaInvalid:
    'Anti-bot answer is incorrect or expired. A new question has been generated.',
  errNameRequired: 'The team name is required.',
  errNameTooShort: 'The name must be at least 2 characters.',
  errNameTooLong: 'The name cannot exceed 100 characters.',
  errDescriptionTooLong: 'The description cannot exceed 2000 characters.',
  errInvalidUrl: 'One of the URLs (logo, website or Discord) is invalid.',
  errTooManyMembers: 'A team cannot have more than 5 members.',
  errCaptainRequired: 'A captain is required for the team.',
  errMultipleCaptains: 'Only one captain can be designated.',
  errManagerEmailInvalid: 'The manager email is invalid.',
  errManagerDuplicate:
    "The manager email cannot also be a roster player's email.",
  errBattletagRequired:
    'BattleTag required for tournament registration (format Name#0000).',
  errBattletagInvalid: 'Invalid BattleTag format (expected: Name#0000).',
  errFieldErrors:
    'Some registration fields are invalid. Please fix them below.',
  errSlugConflict:
    'A team with this name already exists. Please choose another name.',
  errTenantUnknown:
    'Organization not found. Reload the page or contact the staff.',
  errServiceUnavailable:
    'Service temporarily unavailable. Please try again shortly.',
  errServerError: 'An unexpected error occurred. Please try again later.',
  partialWarningTitle: 'Tournament registration to finalize',
  partialWarningDesc:
    'Your team was created, but the tournament registration could not be completed automatically (incomplete roster or full tournament).',
  partialWarningAction:
    'Try again from your captain space or contact the staff to finalize the registration.',
  contactStaffCta: 'Contact the staff',
  accessEmailTitle: 'Access your team space',
  accessEmailSent:
    'A sign-in link has been sent to {to} to access your team space.',
  goToLogin: 'Sign in',
  previewTitle: 'Preview',
  previewLive: 'Live',
  previewNamePlaceholder: 'Your team',
  previewRosterEmpty:
    'Add players in the “Roster” step to see them appear here.',
  successHeading: 'Your team is created!',
  createAnother: 'Create another team',
};
