// lib/i18n/locales/admin-en/adminOnboardingQueue.ts
//
// Traductions ANGLAISES du namespace admin `adminOnboardingQueue`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminOnboardingQueue.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  badgeEmailVerif: 'Email verif.',
  badgeBotInvite: 'Bot invite',
  badgeCompleted: 'Completed',
  badgeRejected: 'Rejected',
  badgeExpired: 'Expired',
  badgeAwaitingClaim: 'To claim',
  errorTenantRequests: 'Tenant-requests error',
  errorGuildLinks: 'Pending-guild-links error',
  errorLoad: 'Loading error',
  pageTitle: 'Admin – Onboarding queue',
  heading: 'Onboarding queue',
  subtitle:
    'Unified view of tenant requests + Discord guilds awaiting claim. Detailed actions (reject, claim, expire) stay on the dedicated pages.',
  refresh: 'Refresh',
  statTotal: 'Total',
  statTenantPending: 'Tenant requests (pending)',
  statGuildPending: 'Guild links (claim)',
  viewDedicated: 'View dedicated queue →',
  loading: 'Loading…',
  empty: 'Nothing pending. ✨',
  kindTenantRequest: 'Tenant request',
  kindGuildLink: 'Guild link',
  detail: 'Detail →',
  guildFallback: 'Guild {id}',
  ownerLabel: 'Owner: {id}',
};
