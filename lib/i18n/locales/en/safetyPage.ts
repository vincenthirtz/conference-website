// lib/i18n/locales/en/safetyPage.ts
//
// Traductions ANGLAISES du namespace `safetyPage`.
//
// La SOURCE DE VERITE est le francais (`../fr/safetyPage.ts`) : toute cle ajoutee
// la-bas doit l'etre ici avec exactement la meme structure, sans quoi le
// garde-fou de compilation `../parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  heroBadge: 'Open to everyone, no account needed',
  heroTitle: 'Help & safety',
  heroSubtitle:
    'Numbers to call when things are not okay, steps to respond to harassment, and how to report it to us.',
  validationNotice: 'Content awaiting approval by the association.',
  quickExitHint:
    'Need to leave fast? The “Quick exit” button or pressing Esc twice closes this page.',
  tocLabel: 'On this page',

  quickExitButton: 'Quick exit',
  quickExitAria: 'Quick exit: leave this page. Google opens in its place.',
  quickExitKeyHint: 'or Esc ×2',

  emergencyTitle: 'Emergencies and helplines',
  emergencyIntro:
    'These numbers work in France and are free. You can use them at any age.',
  urgentGroupTitle: 'In danger right now',
  listenGroupTitle: 'To talk and get advice',
  listenGroupIntro:
    'You can call for yourself or for someone else, even if you are not sure it is serious.',
  freeLabel: 'Free',
  availability24: '24/7',
  callAria: 'Call {number}',
  smsAria: 'Text {number}',
  smsLabel: 'By text message',

  line17Name: 'Police emergency',
  line17Body:
    'Police or gendarmerie: if you are in danger, or witness an assault.',
  line112Name: 'European emergency number',
  line112Body: 'All emergencies, anywhere in the European Union.',
  line114Name: 'Emergency by text message',
  line114Body:
    'If you cannot speak: because you are deaf or hard of hearing, or because someone might hear you.',
  line3919Name: 'Violences Femmes Info',
  line3919Body:
    'Listening and advice for women facing any kind of violence, and for the people around them. Anonymous.',
  line3018Name: 'Online harassment and abuse',
  line3018Body:
    'For young people facing cyberbullying or online abuse, and for their families. Anonymous and confidential.',
  line3018ExtraBefore: 'Also by chat on ',
  line3018ExtraAfter: ' and in the 3018 app.',
  line119Name: 'Allô Enfance en Danger (child protection)',
  line119Body:
    'If you are a child or a teenager in danger, or if you are worried about a child.',
  line3114Name: 'Suicide prevention',
  line3114Body:
    'If you are thinking about suicide, going through a crisis, or worried about someone. Healthcare professionals answer.',

  harassTitle: 'Responding to harassment',
  harassIntro:
    'It is never your fault. Here is what you can do, at your own pace.',
  reflexTitle: 'Good habits, everywhere',
  reflex1: 'You do not have to reply or justify yourself.',
  reflex2:
    'Keep evidence: screenshots showing the date, time and username, and links to the messages. Store them somewhere other than the platform, as a message can be deleted.',
  reflex3: 'Block the account and report it to the platform.',
  reflex4: 'Talk to someone you trust, or to one of the helplines above.',
  reflex5:
    'Harassment, online too, is punishable by law: you can file a complaint at a police or gendarmerie station, with your evidence.',
  gameTitle: 'In game (Overwatch)',
  game1:
    "Mute a person's voice or text chat, or the whole group, from the game.",
  game2:
    'Report the person to Blizzard from the game, during or after the match.',
  game3:
    'Block their Battle.net account to stop receiving their messages and invites.',
  game4:
    'A report to Blizzard does not notify the association. If the person plays in the Cup, report them to us too.',
  discordTitle: 'On Discord',
  discord1:
    'Block the person: their messages are hidden and they can no longer message you privately.',
  discord2:
    "Report the message to Discord from its options (right-click, or long-press on mobile): it goes to Discord's safety team.",
  discord3: 'Let the moderators of the server where it happened know.',
  discord4:
    "On the Cup's server, use the /signalement command: only you can see the bot's reply, and you can stay anonymous.",
  discordLink: 'Discord Safety Center',
  streamTitle: 'On stream (Twitch)',
  stream1: 'Block the person: they can no longer send you private messages.',
  stream2:
    "Report the account or the message to Twitch, from the chat or from the person's channel.",
  stream3:
    "If you stream, appoint moderators you trust: they can delete messages, time out or ban people from chat. AutoMod, Twitch's tool, also filters messages automatically.",
  stream4:
    'During a Cup stream, alert the chat moderators, or report it to the association.',
  twitchLink: 'Twitch Safety Center',
  newTab: '(new tab)',

  reportTitle: 'Report to the association',
  reportIntro:
    'If it involves the Cup (a player, a team, a staff member, a match, our Discord or our streams), tell us.',
  reportStep1:
    'Two ways to report: the form on the site, or the /signalement command on our Discord server.',
  reportStep2:
    'You can stay anonymous: your name, email address and account are then not recorded.',
  reportStep3:
    'Choose the severity. “High” is for safety or urgent situations: the moderation team is alerted right away on Discord. Other reports go into its queue, without an alert.',
  reportStep4:
    'A staff member takes charge of your report and looks into it. Outcomes can go as far as exclusion from Cup competitions.',
  reportStep5:
    'If you left your email address, you get an acknowledgement, and the team can write to tell you what was done. An anonymous report cannot receive a reply.',
  reportNotEmergency:
    'The association is not an emergency service. If you are in immediate danger, call 17 or 112.',
  reportCta: 'Make a report',
  reportCtaHint:
    'The form opens with the anonymous option ticked. Untick it if you want us to be able to reply.',
  reportCtaNamed: 'Report with my email address',

  charterTitle: 'The charter',
  charterBody: 'The community charter is being written.',

  exitTitle: 'Quick exit',
  exitBody:
    'The “Quick exit” button, always visible at the top of the screen, or pressing Esc twice quickly, replaces this page with Google: the Back button does not bring you back here.',
  exitLimit:
    'This does not erase your browsing history. If someone can look at your device, use private browsing or clear your history.',
};
