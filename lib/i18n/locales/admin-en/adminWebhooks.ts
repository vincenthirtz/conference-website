// lib/i18n/locales/admin-en/adminWebhooks.ts
//
// Traductions ANGLAISES du namespace admin `adminWebhooks`.
//
// La SOURCE DE VERITE est le francais (`../admin-fr/adminWebhooks.ts`) : toute cle
// ajoutee la-bas doit l'etre ici avec exactement la meme structure, sans quoi
// le garde-fou de compilation `../admin-parity.ts` casse le typecheck.
//
// Ne PAS annoter `as const` : la parite se verifie contre le francais, dont
// les valeurs sont de type `string` — des types litteraux la feraient echouer.

export default {
  pageTitle: 'Webhooks — Admin',
  breadcrumbAdmin: 'Admin',
  breadcrumbTitle: 'Webhooks',
  kicker: 'Developer ecosystem',
  heading: 'Outbound webhooks',
  intro:
    'Subscribe a URL to receive our events (match finished, tournament finalised, …) as HMAC-SHA256-signed POSTs. Every request carries an X-Webhook-Signature header.',
  createHeading: 'New subscription',
  createSubtitle:
    'Pick the destination URL and the events to receive. The signing secret is shown only once.',
  urlLabel: 'Destination URL (HTTPS)',
  eventsLabel: 'Subscribed events',
  eventsHint:
    'We only send these public events. Verify the signature with the secret revealed at creation.',
  descriptionLabel: 'Description (optional)',
  descriptionPlaceholder: 'e.g. OBS overlay, Zapier integration…',
  creating: 'Creating…',
  createButton: 'Create subscription',
  listHeading: 'Subscriptions',
  loading: 'Loading…',
  emptyState: 'No subscriptions yet. Create one above.',
  statusActive: 'Active',
  statusDisabled: 'Disabled',
  lastDelivery: 'Last delivery',
  never: 'Never',
  failures: '{n} consecutive failures',
  viewDeliveries: 'Deliveries',
  hideDeliveries: 'Hide',
  disable: 'Disable',
  enable: 'Enable',
  delete: 'Delete',
  noDeliveries: 'No deliveries yet.',
  colEvent: 'Event',
  colStatus: 'Status',
  colAttempts: 'Attempts',
  colWhen: 'When',
  errorLoad: 'Failed to load subscriptions.',
  errorUrlRequired: 'URL is required.',
  errorEventsRequired: 'Select at least one event.',
  errorCreate: 'Failed to create subscription.',
  errorGeneric: 'Something went wrong.',
  toastCreated: 'Subscription created.',
  toastEnabled: 'Subscription enabled.',
  toastDisabled: 'Subscription disabled.',
  toastDeleted: 'Subscription deleted.',
  confirmDeleteTitle: 'Delete this subscription?',
  confirmDeleteSubtitle:
    'The URL will stop receiving events. This action is irreversible.',
};
