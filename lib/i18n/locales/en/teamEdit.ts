// lib/i18n/locales/en/teamEdit.ts
//
// Traductions ANGLAISES du namespace `teamEdit`.
//
// La SOURCE DE VERITE est le francais (`../fr/teamEdit.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  headTitle: "Edit {name} | OW Women's Cup",
  eyebrow: 'Customization',
  title: 'Public page of {name}',
  viewPage: '← View the page',
  identitySection: 'Visual identity',
  logoLabel: 'Logo',
  logoHint:
    'PNG, JPEG, WebP or SVG — max 2 MB (512 KB for SVG). Square recommended (512×512).',
  bannerLabel: 'Banner',
  bannerHint:
    'PNG, JPEG, WebP or SVG — max 2 MB (512 KB for SVG). Landscape format (1500×500).',
  accentColorLabel: 'Accent color',
  secondaryColorLabel: 'Secondary color',
  secondaryColorHint:
    'Combined with the accent for gradients (logo, banner, win-rate).',
  bannerOverlayLabel: 'Banner overlay',
  bannerOverlayDefault: 'Default (black gradient)',
  bannerOverlayHint: 'Style of the layer placed over the banner image.',
  bannerFocalLabel: 'Banner framing',
  bannerFocalDefault: 'Centered (default)',
  bannerFocalHint: 'Anchor point of the image when it is cropped.',
  overlayGradient: 'Dark gradient (recommended)',
  overlayDark: 'Solid black 50%',
  overlayNone: 'None (full image)',
  overlayGrid: 'Grid',
  overlayDots: 'Dots',
  focalCenter: 'Centered',
  focalTop: 'Top',
  focalBottom: 'Bottom',
  focalLeft: 'Left',
  focalRight: 'Right',
  shortDescSection: 'Short description',
  shortDescPlaceholder: 'One sentence to introduce the team.',
  charCount: '{count}/{max} characters',
  richContentSection: 'Detailed content',
  editToggle: 'Edit',
  previewToggle: 'Preview',
  noContent: 'No content.',
  richContentPlaceholder:
    '## Our story\n\nWe are a team...\n\n- Founded in 2024\n- 5 starting players',
  markdownLabel: 'Markdown:',
  markdownHeading: '## heading',
  markdownBold: '**bold**',
  markdownItalic: '*italic*',
  markdownList: '- list',
  markdownLink: '[link](https://...)',
  pinnedSection: 'Pinned announcement',
  clear: 'Clear',
  pinnedPlaceholder: "E.g. We're recruiting a support!",
  pinnedHint:
    '{count}/{max} — banner shown above the page as long as there is text (empty = hidden).',
  pinnedUntilLabel: 'Expires on (optional)',
  pinnedUntilHint:
    'Once this date has passed, the banner disappears automatically.',
  embedSection: 'Twitch / YouTube embed',
  remove: 'Remove',
  embedPlaceholder:
    'https://www.twitch.tv/your-channel or https://youtu.be/VIDEO_ID',
  embedDetected: 'Detected: {provider} ({id})',
  embedUnrecognized:
    'URL not recognized — Twitch (twitch.tv/CHANNEL) or YouTube (youtu.be/ID, /watch?v=ID, /embed/ID).',
  embedEmpty: 'Leave empty to not show a player.',
  achievementsSection: 'Achievements',
  achievementsEmpty:
    'No achievements yet. Add a title to make it appear on the public page.',
  achievementTitlePlaceholder: 'E.g. 1st place',
  delete: 'Delete',
  achievementTournamentPlaceholder: 'Tournament (optional)',
  addAchievement: '+ Add an achievement',
  sponsorsSection: 'Sponsors',
  sponsorsEmpty: 'No sponsors. Add a name + link to show them.',
  sponsorNamePlaceholder: 'Sponsor name',
  sponsorLogoPlaceholder: 'Logo URL (https://...)',
  sponsorUrlPlaceholder: 'Site (https://...)',
  addSponsor: '+ Add a sponsor',
  socialsSection: 'Socials & contact',
  twitterLabel: 'X',
  twitterHint: 'Handle or full URL',
  discordLabel: 'Discord',
  discordHint: 'Invite link or server name',
  websiteLabel: 'Website',
  websiteHint: 'Full URL (https://...)',
  youtubeLabel: 'YouTube',
  youtubeHint: 'Handle (@channel), ID or full URL',
  twitchLabel: 'Twitch',
  twitchHint: 'Username or full URL',
  instagramLabel: 'Instagram',
  instagramHint: 'Handle (@account) or full URL',
  tiktokLabel: 'TikTok',
  tiktokHint: 'Handle (@account) or full URL',
  membersSection: 'Member profiles',
  membersCount_one: '{count} member',
  membersCount_other: '{count} members',
  membersDesc:
    'Customize how each player appears on the public page. Each profile has its own “Save” button.',
  membersEmpty: 'No members in the roster.',
  cancel: 'Cancel',
  saving: 'Saving...',
  save: 'Save',
  visualPreview: 'Visual preview',
  reset: 'Reset',
  colorHintDefault:
    'Hex format (#rgb or #rrggbb). Leave empty for the default value.',
  errorInvalidColor: 'Invalid color — use a hex (#rgb or #rrggbb).',
  errorInvalidEmbed: 'Embed: invalid YouTube or Twitch URL.',
  updateSuccess_one: 'Page updated ({count} field changed).',
  updateSuccess_other: 'Page updated ({count} fields changed).',
  noChanges: 'No changes.',
  errorUnexpected: 'Unexpected error.',
};
