// lib/i18n/locales/en/appPage.ts
//
// Traductions ANGLAISES du namespace `appPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/appPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Installable app',
  heroTitleGradient: 'Live the tournament',
  heroTitleRest: 'without missing a match',
  heroSubtitle:
    "The OW Women's Cup app installs in one click on your desktop or phone. Notifications, shortcuts, icon badge, offline mode — everything a native app does, without going through the store.",
  installedLabel: "App installed — you're already in",
  installBtn: 'Install the app',
  howToInstall: 'How to install?',
  seeFeatures: 'See the features',
  noPromptHint:
    "Your browser hasn't (yet) offered to install. Use the Chrome / Edge menu → « Install app », or check the FAQ below.",
  featuresTitle: 'What it changes',
  featuresSubtitle: 'Not a wrapper. Really the app you were waiting for.',
  feature1Title: 'Real-time notifications',
  feature1Desc:
    'Match imminent, check-in open, score reported, scrim accepted: get alerted even when the tab is closed.',
  feature2Title: 'Taskbar badge',
  feature2Desc:
    'The pinned icon shows a red badge with your number of unread notifications. No need to check the tab anymore.',
  feature3Title: 'Works offline',
  feature3Desc:
    'Wifi drops at the worst moment? Your critical actions (check-in, score) are queued and sent as soon as the connection is back.',
  feature4Title: 'Action buttons in notifications',
  feature4Desc:
    'Click "View match" or "Open ticket" directly in the notification, without having to navigate.',
  feature5Title: 'Shortcuts from the icon',
  feature5Desc:
    "Right-click the pinned icon = shortcuts menu: Tournaments, Notifications, Player space, Caster cockpit — one click and you're in the right place.",
  feature6Title: 'Screen stays awake',
  feature6Desc:
    "In the caster cockpit during a 40 min BO3 without a keystroke? The screen won't turn off as long as you're on the page.",
  feature7Title: 'No Chrome bar UI',
  feature7Desc:
    "Once installed, no more address bar or tabs: it's just the app, like a native desktop client.",
  feature8Title: 'Effortless updates',
  feature8Desc:
    'When a new version arrives, a small banner tells you. You click "Reload" whenever it suits you — no app store, no waiting.',
  audiencesTitle: 'Depending on what you do',
  audiencesSubtitle:
    'The app adapts to your role. Three entry points, a single install.',
  audience1Title: 'Players & captains',
  audience1Desc: 'Run your tournament from your phone or desktop.',
  audience1Bullet1:
    'Notifications match imminent / check-in open / score reported',
  audience1Bullet2: 'Scrim invitations and confirmations',
  audience1Bullet3: 'Taskbar icon badge for your pending actions',
  audience1Bullet4: 'Team space, captain-to-captain messaging, scrims',
  audience1Cta: 'My player space',
  audience2Title: 'Casters',
  audience2Desc: 'Stay focused on your match, the app handles the rest.',
  audience2Bullet1: "Caster cockpit: today's segments, briefing, hotkeys",
  audience2Bullet2: 'Screen stays awake during a BO without a keyboard',
  audience2Bullet3:
    'Assignment notifications, Director signals and urgent cues',
  audience2Bullet4: 'Direct shortcut to the cockpit from the pinned icon',
  audience2Cta: 'Cast cockpit',
  audience3Title: 'Staff & admins',
  audience3Desc: 'The full back-office, available as a PWA.',
  audience3Bullet1:
    'Notifications match, score reported, disputes, scrim, support',
  audience3Bullet2: 'Precise badge on the icon for actions to handle',
  audience3Bullet3: 'Action buttons directly in the notifications',
  audience3Bullet4: 'Shortcuts Tournaments / Notifs / Support / Cockpit',
  audience3Cta: 'Admin space',
  installTitle: 'How to install it?',
  installStep1Label: 'Windows / macOS',
  installStep1Body:
    'Chrome or Edge → install icon on the right of the address bar, OR menu ⋮ → "Install app".',
  installStep2Label: 'Android',
  installStep2Body:
    'Chrome → menu ⋮ → "Add to home screen". The app appears like a normal app.',
  installStep3Label: 'iOS / iPadOS',
  installStep3Body:
    'Safari → Share button ↗ → "Add to home screen". iOS ≥ 16.4 for notifications.',
  installStep4Label: 'Linux',
  installStep4Body:
    'Chrome or Edge support standalone install (menu ⋮ → "Install"). Firefox: not yet.',
  installNowBtn: 'Install now',
  faqTitle: 'Frequently asked questions',
  faqSubtitle: "Doubts? Here's what others asked.",
  faq1Q: 'Which devices does it work on?',
  faq1A:
    'Windows 11 (Edge / Chrome), macOS, Linux, Android and iOS ≥ 16.4. On iOS, some features (taskbar badge, action buttons) are limited by Apple — the essentials work everywhere.',
  faq2Q: 'How do I install?',
  faq2A:
    'From this page or any page of the site: click the install icon on the right of the address bar, or open the Chrome / Edge menu → "Install app". On Android, "Add to home screen". On iOS, share → "Add to home screen".',
  faq3Q: 'Why not a real app on the Store?',
  faq3A:
    'A PWA avoids Apple / Google Play fees, validation delays, and delivers updates in seconds (vs days on the stores). The code runs in the browser — no 80 MB download, no intrusive system permissions.',
  faq4Q: 'What about my data?',
  faq4A:
    "None. The PWA is exactly the same site, just pinned as an icon. We store your session token (Supabase auth) locally so you don't have to log in every time, and that's all.",
  faq5Q: 'How do I uninstall?',
  faq5A:
    'On Windows: right-click the taskbar icon → Uninstall. On macOS: from the app menu → Uninstall. Android: long-press the icon → Uninstall. Your data stays on the site (the PWA is just a shortcut).',
  faq6Q: 'Can I enable notifications without installing?',
  faq6A:
    'Yes — from your admin / caster / player space, the notification enablement banner also works in a regular browser. Installing just adds the taskbar icon, shortcuts and offline mode.',
};
