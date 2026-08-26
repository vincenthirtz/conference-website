// lib/i18n/locales/admin-en/adminDashboardDiscordHealthGrid.ts
//
// Traductions ANGLAISES du namespace admin `adminDashboardDiscordHealthGrid`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminDashboardDiscordHealthGrid.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  channelMatchAnnouncements: 'Match announcements',
  channelMatchResults: 'Results',
  channelBracketUpdates: 'Bracket',
  channelGeneralAnnouncements: 'Announcements',
  channelVetoLive: 'Veto live',
  channelCheckinReminders: 'Check-in',
  channelSupportTickets: 'Support',
  channelMvpPolls: 'MVP polls',
  ageNow: 'just now',
  ageMinutes: '{n} min ago',
  ageHours: '{n}h ago',
  ageDays: '{n}d ago',
  tipOkPosted: 'Last POST {age}',
  tipOkNoHistory: 'Configured and active (no history yet)',
  tipStalePosted: 'No post for {age} while traffic is expected',
  tipStaleNoPost: 'No recent POST while traffic is expected',
  tipFailed: 'The last POST failed (non-2xx HTTP)',
  tipInactive: 'Webhook configured but disabled',
  tipMissing: 'No webhook configured for this channel',
  shortSilence: 'silence',
  shortFailed: 'failed',
  missingWarning:
    '⚠️ {count} channel(s) are missing an active webhook while traffic is expected.',
};
