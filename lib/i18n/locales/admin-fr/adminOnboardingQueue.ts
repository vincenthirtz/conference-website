// lib/i18n/locales/admin-fr/adminOnboardingQueue.ts
//
// Traductions FRANCAISES du namespace `adminOnboardingQueue` — SOURCE DE VERITE.
// Le pendant anglais vit dans `../admin-en/<ns>.ts` (recompose en un chunk
// unique, charge paresseusement a la bascule FR->EN).
// Toute cle ajoutee ici doit l'etre aussi cote anglais : le garde-fou de
// compilation `../admin-parity.ts` casse le typecheck sinon.

import { adminNs } from '../../ns';

export default adminNs('adminOnboardingQueue', {
  badgeEmailVerif: 'Vérif email',
  badgeBotInvite: 'Invitation bot',
  badgeCompleted: 'Complétée',
  badgeRejected: 'Rejetée',
  badgeExpired: 'Expirée',
  badgeAwaitingClaim: 'À claim',
  errorTenantRequests: 'Erreur tenant-requests',
  errorGuildLinks: 'Erreur pending-guild-links',
  errorLoad: 'Erreur de chargement',
  pageTitle: 'Admin – Onboarding queue',
  heading: 'Onboarding queue',
  subtitle:
    'Vue unifiée des demandes de tenant + des guilds Discord en attente de claim. Les actions détaillées (reject, claim, expire) restent sur les pages dédiées.',
  refresh: 'Rafraîchir',
  statTotal: 'Total',
  statTenantPending: 'Tenant requests (pending)',
  statGuildPending: 'Guild links (claim)',
  viewDedicated: 'Voir la file dédiée →',
  loading: 'Chargement…',
  empty: 'Rien en attente. ✨',
  kindTenantRequest: 'Tenant request',
  kindGuildLink: 'Guild link',
  detail: 'Détail →',
  guildFallback: 'Guild {id}',
  ownerLabel: 'Owner: {id}',
});
