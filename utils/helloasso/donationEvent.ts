// utils/helloasso/donationEvent.ts
//
// UNE NOTIFICATION HELLOASSO EST-ELLE UN DON ? — le cœur PUR de la source OBS
// « alerte don » (`/overlay/don-alert`).
//
// Le webhook reçoit TOUS les paiements des comptes reliés : adhésions,
// billetterie, boutique, dons, et nos propres checkouts (page /don, abonnement
// de plan, cagnotte de tournoi). Afficher « Merci pour ce don ! » sur une
// adhésion ou un abonnement de plan serait faux à l'antenne. La décision vit
// ici, sans réseau ni base, pour être testée cas par cas.
//
// CE QUE HELLOASSO ENVOIE (notification `Payment`, cf.
// https://dev.helloasso.com/docs/notifications) : `data.order.formType`
// (`Donation`, `Membership`, `Event`, `Shop`, `CrowdFunding`, `PaymentForm`,
// `Checkout`), `data.order.formSlug`, `data.items[].type` (`Donation`,
// `MonthlyDonation`, `Membership`, `Registration`, `Payment`…) et
// `data.amount` en centimes. Aucun de ces champs n'est garanti présent : tout
// est lu défensivement, et un paiement qu'on ne sait pas classer n'est PAS un
// don (une alerte manquée vaut mieux qu'une alerte fausse).
//
// LA RÈGLE, dans l'ordre :
//   1. seul un `Payment` à l'état `Authorized`, avec un id et un montant > 0 ;
//   2. jamais un paiement corrélé à un abonnement de plan ou à une cagnotte
//      (metadata `kind` du checkout-intent, ou corrélation résolue par le
//      webhook) — nos checkouts portent tous `containsDonation: true`, leurs
//      items peuvent donc ressembler à un don ;
//   3. formulaire `Donation` → don ;
//   4. formulaire connu qui n'en est pas un (adhésion, billetterie, boutique,
//      crowdfunding, paiement) → pas un don, même avec un item « don » ajouté
//      en option : le montant contiendrait la cotisation ou le billet ;
//   5. `Checkout` non corrélé → le checkout de la page /don. Seulement sur le
//      compte de l'association (c'est lui qui l'émet), et seulement si la
//      corrélation a pu être établie (une erreur de lecture ne doit pas
//      transformer un abonnement de plan en don) ;
//   6. formulaire absent ou inconnu → don si un item est de type don.
//
// CONFIDENTIALITÉ : rien de ce module ne lit le payeur. La ligne produite ne
// porte ni nom ni email — cf. database/migrations/add_helloasso_donations.sql.

import type { HelloAssoWebhookEvent } from '../helloasso';

export type DonationContext = {
  /** Compte qui notifie : l'association (`platform`) ou un espace tiers. */
  source: 'platform' | 'tenant';
  /** Paiement rattaché à un abonnement de plan. `null` = inconnu (erreur). */
  planCorrelated: boolean | null;
  /** Paiement rattaché à une cagnotte. `null` = inconnu (erreur). */
  prizeCorrelated: boolean | null;
};

export type DonationRejectReason =
  | 'not_authorized_payment'
  | 'invalid_payment'
  | 'plan_payment'
  | 'prize_contribution'
  | 'correlation_unknown'
  | 'non_donation_form'
  | 'foreign_checkout'
  | 'no_donation_item';

export type HelloAssoForm = {
  formType: string | null;
  formSlug: string | null;
};

export type DonationClassification = HelloAssoForm &
  ({ isDonation: true } | { isDonation: false; reason: DonationRejectReason });

/** Ligne insérée dans `helloasso_donations` — volontairement sans payeur. */
export type HelloAssoDonationRow = {
  tenant_id: string;
  helloasso_payment_id: string;
  amount_cents: number;
  currency: 'EUR';
  form_type: string | null;
  form_slug: string | null;
};

const NON_DONATION_FORMS = new Set([
  'membership',
  'event',
  'shop',
  'crowdfunding',
  'paymentform',
]);

const DONATION_ITEM_TYPES = new Set(['donation', 'monthlydonation']);

const METADATA_KIND_PLAN = 'tenant_plan';
const METADATA_KIND_PRIZE = 'prize_pool';

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function asText(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length > 0 ? s.slice(0, max) : null;
}

/** `order.formType` / `order.formSlug`, s'ils sont là. */
export function readHelloAssoForm(event: HelloAssoWebhookEvent): HelloAssoForm {
  const order = asRecord(asRecord(event?.data)?.order);
  return {
    formType: asText(order?.formType, 60),
    formSlug: asText(order?.formSlug),
  };
}

function metadataKind(event: HelloAssoWebhookEvent): string | null {
  const md = asRecord(event?.data?.metadata) ?? asRecord(event?.metadata);
  return asText(md?.kind, 60);
}

function hasDonationItem(event: HelloAssoWebhookEvent): boolean {
  const items = asRecord(event?.data)?.items;
  if (!Array.isArray(items)) return false;
  return items.some((item) => {
    const type = asText(asRecord(item)?.type, 60);
    return type != null && DONATION_ITEM_TYPES.has(type.toLowerCase());
  });
}

/** Montant en centimes, entier strictement positif, sinon `null`. */
function readAmountCents(event: HelloAssoWebhookEvent): number | null {
  const amount = event?.data?.amount as unknown;
  return typeof amount === 'number' && Number.isInteger(amount) && amount > 0
    ? amount
    : null;
}

function readPaymentId(event: HelloAssoWebhookEvent): string | null {
  const id = event?.data?.id as unknown;
  if (typeof id === 'number' && Number.isFinite(id)) return String(id);
  return asText(id, 64);
}

export function classifyDonation(
  event: HelloAssoWebhookEvent,
  ctx: DonationContext
): DonationClassification {
  const form = readHelloAssoForm(event);
  const no = (reason: DonationRejectReason): DonationClassification => ({
    ...form,
    isDonation: false,
    reason,
  });

  if (event?.eventType !== 'Payment' || event?.data?.state !== 'Authorized') {
    return no('not_authorized_payment');
  }
  if (readPaymentId(event) == null || readAmountCents(event) == null) {
    return no('invalid_payment');
  }

  const kind = metadataKind(event);
  if (kind === METADATA_KIND_PLAN || ctx.planCorrelated === true) {
    return no('plan_payment');
  }
  if (kind === METADATA_KIND_PRIZE || ctx.prizeCorrelated === true) {
    return no('prize_contribution');
  }
  const correlationKnown =
    ctx.planCorrelated !== null && ctx.prizeCorrelated !== null;

  const formType = form.formType?.toLowerCase() ?? null;
  if (formType === 'donation') return { ...form, isDonation: true };
  if (formType != null && NON_DONATION_FORMS.has(formType)) {
    return no('non_donation_form');
  }
  if (formType === 'checkout') {
    if (!correlationKnown) return no('correlation_unknown');
    if (ctx.source !== 'platform') return no('foreign_checkout');
    return { ...form, isDonation: true };
  }

  if (!hasDonationItem(event)) return no('no_donation_item');
  if (!correlationKnown) return no('correlation_unknown');
  return { ...form, isDonation: true };
}

/**
 * La ligne à insérer pour un don, ou `null` si le paiement n'en est pas un.
 * `tenantId` est l'espace AUTHENTIFIÉ par le webhook, jamais le payload.
 */
export function buildDonationRow(
  event: HelloAssoWebhookEvent,
  tenantId: string,
  classification: DonationClassification
): HelloAssoDonationRow | null {
  if (!classification.isDonation) return null;
  const paymentId = readPaymentId(event);
  const amountCents = readAmountCents(event);
  if (paymentId == null || amountCents == null) return null;
  return {
    tenant_id: tenantId,
    helloasso_payment_id: paymentId,
    amount_cents: amountCents,
    currency: 'EUR',
    form_type: classification.formType,
    form_slug: classification.formSlug,
  };
}
