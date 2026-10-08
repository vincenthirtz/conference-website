// lib/i18n/locales/admin-en/adminBroadcastLive.ts
//
// Traductions ANGLAISES du namespace admin `adminBroadcastLive`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminBroadcastLive.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Admin – Twitch & interactions',
  heading: 'Twitch & interactions',
  subtitle:
    'What you drive on the channel during a stream: on-air status, predictions, channel points and Twitch commands. TCG drops are under Broadcast › Overlays.',
  twitchHeading: 'Twitch status',
  twitchLoading: 'Loading Twitch status…',
  twitchLive: '🔴 LIVE',
  twitchOffline: 'Offline',
  twitchViewers: '{count} viewers',
  twitchNotConfigured: 'Twitch not configured.',
  twitchCollapse: 'Collapse',
  twitchExpand: 'Expand',
  twitchPreviewTitle: 'Twitch preview of {channel}',
  twitchChatTitle: 'Twitch chat of {channel}',
  twitchOfflinePlayer: 'Offline — no preview available.',

  dropHeading: 'TCG drops',
  dropSubtitle:
    'Twitch can disable the subscription without warning: without this panel, drops would stop mid-stream with nothing to show it.',
  dropStatusHealthy: 'Operational',
  dropStatusBroken: 'Needs fixing',
  dropStatusUnknown: 'Unknown',
  dropUnreadable:
    'Twitch did not answer: we cannot tell whether the subscription is alive. “We do not know” is not “there is none”.',
  dropSecretMissing:
    'TWITCH_EVENTSUB_SECRET missing: every delivery would be rejected with a 403.',
  dropScopeMissing:
    'Scope channel:read:redemptions missing — reconnect the channel.',
  dropManageScopeMissing:
    'Scope channel:manage:redemptions missing: the site cannot create the reward — reconnect the channel.',
  dropSetupFailed: 'Setup refused: {message}',
  dropRewardMissing:
    'No channel-point reward designated: nothing to listen to.',
  dropSetupCta: 'Set up the drop',
  dropFeaturedHeading: 'Featured reward',
  dropFeaturedIntro:
    'A second, pricier Twitch reward whose pack is guaranteed to contain an association card (the Pink October logo, for instance).',
  dropFeaturedCard: 'Guaranteed card',
  dropFeaturedCost: 'Channel points cost',
  dropFeaturedCta: 'Set up',
  dropFeaturedActive: 'Live — guaranteed card: {title}',
  dropFeaturedNone: 'No published association card: create one in Admin → TCG.',
  dropFeaturedError:
    'Setup failed. If the reward was created by hand in Twitch, delete it: only a reward created by the site can be fulfilled or refunded.',
  dropSetupBusy: 'Setting up…',
  dropNoSubscription:
    'No active subscription: Twitch will send no redemption at all.',
  dropSubscriptionAiling: 'Subscription failing: {status}',
  dropHealthyDetail: '{count} active subscription(s) — drops can land.',
};
