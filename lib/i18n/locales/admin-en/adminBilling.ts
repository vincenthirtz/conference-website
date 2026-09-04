// lib/i18n/locales/admin-en/adminBilling.ts
//
// Traductions ANGLAISES du namespace admin `adminBilling`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminBilling.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Billing — Subscription',
  breadcrumbAdmin: 'Admin',
  breadcrumbBilling: 'Billing',
  heading: 'Subscription',
  subheading:
    "Manage your organisation's plan: capabilities, subscription and payments.",
  loading: 'Loading billing…',
  errorLoad: 'Unable to load billing status.',
  noActiveTenant: 'No active tenant. Select a tenant to view its billing.',
  currentPlanHeading: 'Current plan',
  statusActive: 'Active',
  statusPastDue: 'Payment overdue',
  statusCanceled: 'Canceled',
  startedAtLabel: 'Subscribed on',
  expiresAtLabel: 'Expires on',
  noExpiry: 'No expiry',
  expireInDays: 'expires in {days} days',
  expired: 'Expired',
  trialBadge: 'Free trial',
  trialNotice:
    'Your space is on a free trial. When it ends, it drops back to the Discovery tier and the Discord bot stops responding — subscribe to keep it running.',
  downgradeNoticeTitle: 'Reduced access',
  downgradeNoticeMsg:
    'Your “{plan}” plan is no longer honored: capabilities have fallen back to the free tier. Renew to reactivate.',
  capabilitiesHeading: 'Included capabilities',
  capApiRead: 'API read',
  capApiWrite: 'API write',
  capDiscordBot: 'Discord bot',
  capEventOps: 'Event ops',
  capWhiteLabel: 'White label',
  capMultiTenant: 'Multi-tenant',
  capArbitration: 'Dispute arbitration',
  capRatings: 'Player ratings',
  capEventOpsFull: 'full',
  capEventOpsBasic: 'basic',
  capEventOpsNone: 'none',
  catalogHeading: 'Subscribe or change plan',
  perYear: '/ yr',
  currentBadge: 'Current plan',
  subscribe: 'Subscribe',
  renew: 'Renew',
  switchTo: 'Switch to {plan}',
  downgradeTo: 'Downgrade to {plan}',
  ownerOnlyNote: 'Only an owner can subscribe to or renew a plan.',
  associationNoticeTitle: 'Association plan',
  associationNoticeMsg:
    "This account is the association's own system — full access, not subject to billing.",
  customNoticeTitle: 'Custom-quote plan',
  customNoticeMsg:
    'Your Éditeur plan is handled on a custom-quote basis. Contact us for any changes.',
  redirecting: 'Redirecting to payment…',
  ctaError: 'Unable to generate the payment link.',
  paymentsHeading: 'Payment history',
  colDate: 'Date',
  colPlan: 'Plan',
  colAmount: 'Amount',
  colHelloasso: 'HelloAsso ref.',
  paymentsEmptyTitle: 'No payments',
  paymentsEmptyDesc: 'Payments will appear here after your first subscription.',
  graceBanner: 'Your renewal date has passed. Your features stay active for a few more days: renew to keep your Discord bot.',
  graceBannerUntil: 'Your renewal date has passed. Your features stay active until {date}: renew before then to keep your Discord bot.',
};
