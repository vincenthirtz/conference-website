// lib/i18n/locales/en/guideManageTeam.ts
//
// Traductions ANGLAISES du namespace `guideManageTeam`.
//
// La SOURCE DE VERITE est le francais (`../fr/guideManageTeam.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Captain guide',
  heroTitle: 'Manage your team in a few clicks',
  heroSubtitle:
    'Roster, applications, scrims, check-in, messaging: everything is in your space. Here is a concrete overview of each step, with screenshots of the real interface.',
  createTeam: 'Create my team',
  goToSpace: 'Go to my space',
  stepLabel: 'Step {number}',
  alsoTitle: 'And also…',
  ctaTitle: 'Ready to take the armband?',
  ctaDesc:
    'Registration is free, the form takes two minutes and you can adjust the roster at any time.',
  readFaq: 'Read the captain FAQ',
  step1Title: 'Register your team',
  step1Desc:
    "Create your team in two minutes: name, captain's BattleTag, first members. You become captain automatically.",
  step1Bullet1: 'Pick a name and a tag (e.g. PHX)',
  step1Bullet2: 'Enter 5 BattleTags to start the roster',
  step1Bullet3: 'You can add coaches and substitutes later',
  step2Title: 'Receive and validate applications',
  step2Desc:
    'Enable “open team” mode to receive requests. Read the message, accept or decline — the player gets a notification.',
  step2Bullet1: 'Open/closed toggle in one click',
  step2Bullet2: 'See the desired role and an intro note',
  step2Bullet3: 'Accepting automatically assigns the role',
  step3Title: 'Manage the roster and roles',
  step3Desc:
    'Adjust roles (tank/dps/support/sub/coach), pass the captain armband, copy a BattleTag in one click for lobbies.',
  step3Bullet1: 'Visible Tank / DPS / Support counter',
  step3Bullet2: '📋 button next to each BattleTag',
  step3Bullet3: 'Captain transfer in two clicks',
  step4Title: 'Chat with other captains',
  step4Desc:
    'Built-in messaging between captains to set schedules, lobbies or house rules without leaving the site.',
  step4Bullet1: 'Inbox sorted by latest activity',
  step4Bullet2: 'Unread message counter in the navbar',
  step4Bullet3: 'Active staff moderation if needed',
  step5Title: 'Check-in for the next match',
  step5Desc:
    'One hour before kickoff, the check-in button opens right in your space. No more hunting for the Draftbot email.',
  step5Bullet1: '“Next match” card at the top of the dashboard',
  step5Bullet2: 'Countdown, BO3/BO5 format, live link',
  step5Bullet3: 'Auto forfeit if no check-in at T-0',
  step6Title: 'Propose scrims',
  step6Desc:
    'Pick an opposing team, propose a time and a message. The opposing captain accepts or declines from their space.',
  step6Bullet1: 'Team search with country/spots filter',
  step6Bullet2: 'Proposal + date + comment',
  step6Bullet3: 'Once accepted, add it to your schedule',
  feature1Title: 'Notification bell',
  feature1Desc:
    'A pink badge in the navbar aggregates unread messages, pending scrims, applications and check-ins to validate.',
  feature2Title: 'Public team page',
  feature2Desc:
    'Enjoy a shareable showcase (logo, roster, achievements) to spread on social media and to sponsors.',
  feature3Title: 'Request history',
  feature3Desc:
    'All your requests (captaincy, transfers, scrims) are tracked with their status and the staff processing date.',
  feature4Title: 'Safety & moderation',
  feature4Desc:
    'Anti-harassment charter, trained staff, built-in reporting, GDPR-compliant account deletion.',
  previewNewTeamTitle: 'Create my team',
  previewFieldName: 'Name',
  previewFieldTag: 'Tag',
  previewTagHint: '3-4 letters, shown in the bracket',
  previewFieldCaptain: 'Captain',
  previewRosterInitial: 'Initial roster',
  previewRegisterTeam: 'Register my team',
  previewApplications: 'Applications',
  previewTeamOpen: 'Open team',
  previewReq1Message: 'Available 3 evenings/week, Diamond level.',
  previewReq2Message: 'Master last season, looking for a serious project.',
  previewAccept: 'Accept',
  previewDecline: 'Decline',
  previewMembers: 'members',
  previewCaptain: 'Captain',
  previewMessaging: 'Messaging',
  previewMsg1:
    'Can we push the scrim to 9pm? We have a last-minute issue on tank.',
  previewMsg2: "Captain's BattleTag for the lobby?",
  previewMsg3: 'Thanks for the scrim yesterday, you improved a lot!',
  previewTime1: '4 min ago',
  previewTime2: '1 h ago',
  previewTime3: 'yesterday',
  previewNextMatch: 'Next match',
  previewVs: 'vs',
  previewMatchDate: 'Sunday 18 May 2026 at 19:00 · in 2d 4h',
  previewViewMatch: 'View the match →',
  previewLiveCast: 'Live cast ↗',
  previewCheckinNow: 'Check in now',
  previewProposeScrim: 'Propose a scrim',
  previewOpponentTeam: 'Opposing team',
  previewOpponentValue: 'Sparkles · 5 members · 🇫🇷',
  previewProposedDate: 'Proposed date',
  previewProposedDateValue: 'Sunday 18 May 2026 at 21:00',
  previewMessage: 'Message',
  previewMessageValue:
    "Hi! We're looking for a BO3 Sunday evening, are you available?",
  previewSendRequest: 'Send the request',
};
