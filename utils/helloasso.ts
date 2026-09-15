// utils/helloasso.ts
// HelloAsso API v5 client — OAuth2 client_credentials + checkout intents.
// Docs: https://dev.helloasso.com/docs
//
// DEUX COMPTES POSSIBLES, ET C'EST LE CŒUR DU FICHIER DEPUIS LE 2026-09-16.
// Les identifiants d'environnement décrivent le compte de L'ASSOCIATION :
//   HELLOASSO_CLIENT_ID / HELLOASSO_CLIENT_SECRET / HELLOASSO_ORG_SLUG
// Ils encaissent ce qui NOUS est dû (adhésions, dons, abonnements de plan).
// Un espace tiers, lui, apporte les SIENS (`utils/billing/helloassoAccount.ts`,
// secrets chiffrés par tenant) : l'argent d'une cagnotte doit arriver sur le
// compte de l'organisation qui organise le tournoi, pas sur le nôtre. Chaque
// association obtient ses identifiants depuis son back-office HelloAsso
// (« Mon compte › Intégrations et API ») ; le privilège `Checkout` qu'ils
// portent suffit à créer un intent de paiement.
//
// D'où le paramètre `credentials` : le défaut reste le compte de la
// plateforme, et un appelant qui collecte POUR quelqu'un d'autre doit le dire.

const API_BASE = 'https://api.helloasso.com';

// ─── OAuth2 token cache ────────────────────────────────────────

/** Un compte HelloAsso : celui de l'association, ou celui d'un espace tiers. */
export type HelloAssoCredentials = {
  clientId: string;
  clientSecret: string;
  orgSlug: string;
};

/**
 * Jetons en cache PAR COMPTE. Une seule variable suffisait tant qu'un seul
 * compte existait ; avec plusieurs, elle rendrait le jeton d'une association à
 * une autre — c'est-à-dire un paiement encaissé au mauvais endroit.
 */
const tokenCache = new Map<
  string,
  { accessToken: string; expiresAt: number }
>();

export function getPlatformConfig(): HelloAssoCredentials {
  const clientId = process.env.HELLOASSO_CLIENT_ID;
  const clientSecret = process.env.HELLOASSO_CLIENT_SECRET;
  const orgSlug = process.env.HELLOASSO_ORG_SLUG;

  if (!clientId || !clientSecret || !orgSlug) {
    throw new Error(
      'Missing HelloAsso env vars: HELLOASSO_CLIENT_ID, HELLOASSO_CLIENT_SECRET, HELLOASSO_ORG_SLUG'
    );
  }

  return { clientId, clientSecret, orgSlug };
}

/** Le compte de la plateforme est-il configuré ? (sans lever). */
export function isPlatformHelloAssoConfigured(): boolean {
  return Boolean(
    process.env.HELLOASSO_CLIENT_ID &&
      process.env.HELLOASSO_CLIENT_SECRET &&
      process.env.HELLOASSO_ORG_SLUG
  );
}

/**
 * Obtain an OAuth2 access token via client_credentials grant.
 * Tokens are cached in memory (per account) and refreshed 60 s before expiry.
 */
async function getAccessToken(
  credentials: HelloAssoCredentials = getPlatformConfig()
): Promise<string> {
  const cached = tokenCache.get(credentials.clientId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.accessToken;
  }

  const { clientId, clientSecret } = credentials;

  const res = await fetch(`${API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HelloAsso OAuth error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache.set(clientId, {
    accessToken: data.access_token,
    // Refresh 60 s before actual expiry to avoid race conditions
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  });

  return data.access_token;
}

// ─── Checkout intent ───────────────────────────────────────────

export type CheckoutInitRequest = {
  /** Amount in cents (e.g. 2500 = 25 €) */
  totalAmount: number;
  /**
   * Payer info. Optional: HelloAsso only pre-fills the checkout page with it.
   * Targeted plan links (owner → partner) omit it — the partner fills their own
   * details on HelloAsso's page.
   */
  payer?: {
    firstName: string;
    lastName: string;
    email: string;
  };
  /** URL the user is redirected to after payment */
  returnUrl: string;
  /** URL the user is redirected to if they cancel */
  errorUrl: string;
  /** Metadata / label shown on the HelloAsso payment page */
  itemName?: string;
  /**
   * Free-form metadata attached to the checkout-intent. HelloAsso stores it on
   * the intent and echoes it back in the payment notification (webhook) — this
   * is the documented correlation channel (`data.metadata`). Used to tie a
   * "don" back to a tenant + plan (`{ kind: 'tenant_plan', tenant_id, plan }`).
   * @see https://dev.helloasso.com/docs/checkout — "metadata"
   */
  metadata?: Record<string, unknown>;
  /**
   * Compte qui ENCAISSE. Absent = celui de l'association (environnement).
   * Une cagnotte d'espace tiers passe le sien : l'argent doit arriver chez
   * l'organisation qui organise le tournoi.
   */
  credentials?: HelloAssoCredentials;
};

export type CheckoutInitResponse = {
  id: number;
  redirectUrl: string;
};

/**
 * Create a checkout intent on HelloAsso.
 * Returns the redirect URL where the user completes the payment.
 *
 * @see https://dev.helloasso.com/docs/checkout
 */
export async function createCheckoutIntent(
  opts: CheckoutInitRequest
): Promise<CheckoutInitResponse> {
  const credentials = opts.credentials ?? getPlatformConfig();
  const token = await getAccessToken(credentials);
  const { orgSlug } = credentials;

  const body: Record<string, unknown> = {
    totalAmount: opts.totalAmount,
    initialAmount: opts.totalAmount,
    itemName: opts.itemName || "Don pour l'association",
    backUrl: opts.errorUrl,
    errorUrl: opts.errorUrl,
    returnUrl: opts.returnUrl,
    containsDonation: true,
  };
  if (opts.payer) {
    body.payer = {
      firstName: opts.payer.firstName,
      lastName: opts.payer.lastName,
      email: opts.payer.email,
    };
  }
  // Attach metadata only when provided — HelloAsso echoes it back in the
  // payment webhook (`data.metadata`) so we can correlate the don to a
  // tenant + plan. Generic dons pass no metadata → unchanged behaviour.
  if (opts.metadata && Object.keys(opts.metadata).length > 0) {
    body.metadata = opts.metadata;
  }

  const res = await fetch(
    `${API_BASE}/v5/organizations/${encodeURIComponent(orgSlug)}/checkout-intents`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HelloAsso checkout error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as { id: number; redirectUrl: string };

  return { id: data.id, redirectUrl: data.redirectUrl };
}

/* ---------------------------------------------------------------------------
 * Vérification d'un compte
 * ------------------------------------------------------------------------- */

export type HelloAssoCheck =
  | { ok: true; organizationName: string | null }
  | {
      ok: false;
      error: string;
      code: 'BAD_CREDENTIALS' | 'BAD_ORG' | 'UNREACHABLE';
    };

/**
 * Les identifiants d'une association sont-ils valides, et donnent-ils accès à
 * l'organisation annoncée ?
 *
 * DEUX QUESTIONS, PAS UNE. Une clé acceptée mais un slug d'organisation faux
 * produirait des paiements créés ailleurs — ou plus vraisemblablement un 404 au
 * premier don, devant une contributrice. On vérifie donc le jeton PUIS l'accès
 * à l'organisation.
 *
 * Ne lève jamais : l'appelant est un écran de configuration, pas un traitement.
 */
export async function verifyHelloAssoCredentials(
  credentials: HelloAssoCredentials
): Promise<HelloAssoCheck> {
  let token: string;
  try {
    // Jamais le cache : on VÉRIFIE des identifiants qu'on vient de recevoir.
    const res = await fetch(`${API_BASE}/oauth2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
      }),
    });
    if (res.status === 400 || res.status === 401) {
      return {
        ok: false,
        code: 'BAD_CREDENTIALS',
        error: 'Identifiants refusés par HelloAsso.',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        code: 'UNREACHABLE',
        error: `HelloAsso a répondu HTTP ${res.status}.`,
      };
    }
    token = ((await res.json()) as { access_token: string }).access_token;
  } catch (err) {
    return {
      ok: false,
      code: 'UNREACHABLE',
      error: `HelloAsso injoignable : ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  try {
    const res = await fetch(
      `${API_BASE}/v5/organizations/${encodeURIComponent(credentials.orgSlug)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (res.status === 403 || res.status === 404) {
      return {
        ok: false,
        code: 'BAD_ORG',
        error:
          'Ces identifiants ne donnent pas accès à cette organisation HelloAsso.',
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        code: 'UNREACHABLE',
        error: `HelloAsso a répondu HTTP ${res.status}.`,
      };
    }
    const data = (await res.json().catch(() => null)) as {
      name?: string;
    } | null;
    return { ok: true, organizationName: data?.name ?? null };
  } catch (err) {
    return {
      ok: false,
      code: 'UNREACHABLE',
      error: `HelloAsso injoignable : ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

// ─── Fetch organization data ──────────────────────────────────

export type HelloAssoMembership = {
  id: number;
  order: {
    id: number;
    date: string;
    formSlug: string;
    formType: string;
  };
  payer: {
    firstName: string;
    lastName: string;
    email: string;
  };
  user: {
    firstName: string;
    lastName: string;
  };
  amount: number;
  state: string;
  name: string;
};

export type HelloAssoPaginatedResponse<T> = {
  data: T[];
  pagination: {
    pageIndex: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
    continuationToken?: string;
  };
};

/**
 * Fetch memberships (adhésions) from a HelloAsso Membership form.
 *
 * @param formSlug - The slug of the Membership form on HelloAsso
 * @param pageIndex - Page number (1-based)
 * @param pageSize - Items per page (max 100)
 */
export async function fetchMemberships(
  formSlug: string,
  pageIndex = 1,
  pageSize = 100
): Promise<HelloAssoPaginatedResponse<HelloAssoMembership>> {
  // Lecture des données de L'ASSOCIATION (adhésions, paiements, formulaires) :
  // toujours le compte de la plateforme.
  const token = await getAccessToken();
  const { orgSlug } = getPlatformConfig();

  const params = new URLSearchParams({
    pageIndex: String(pageIndex),
    pageSize: String(Math.min(pageSize, 100)),
    withDetails: 'true',
  });

  const res = await fetch(
    `${API_BASE}/v5/organizations/${encodeURIComponent(orgSlug)}/forms/Membership/${encodeURIComponent(formSlug)}/items?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HelloAsso memberships error ${res.status}: ${text}`);
  }

  return (await res.json()) as HelloAssoPaginatedResponse<HelloAssoMembership>;
}

/**
 * Fetch all payments for the organization, optionally filtered by date range.
 */
export async function fetchPayments(opts?: {
  from?: string;
  to?: string;
  pageIndex?: number;
  pageSize?: number;
}): Promise<HelloAssoPaginatedResponse<HelloAssoMembership>> {
  // Lecture des données de L'ASSOCIATION (adhésions, paiements, formulaires) :
  // toujours le compte de la plateforme.
  const token = await getAccessToken();
  const { orgSlug } = getPlatformConfig();

  const params = new URLSearchParams({
    pageIndex: String(opts?.pageIndex ?? 1),
    pageSize: String(Math.min(opts?.pageSize ?? 100, 100)),
  });
  if (opts?.from) params.set('from', opts.from);
  if (opts?.to) params.set('to', opts.to);

  const res = await fetch(
    `${API_BASE}/v5/organizations/${encodeURIComponent(orgSlug)}/payments?${params}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HelloAsso payments error ${res.status}: ${text}`);
  }

  return (await res.json()) as HelloAssoPaginatedResponse<HelloAssoMembership>;
}

/**
 * List all forms (Membership, Event, Donation, etc.) for the organization.
 */
export async function fetchForms(): Promise<
  Array<{ formSlug: string; formType: string; title: string; state: string }>
> {
  // Lecture des données de L'ASSOCIATION (adhésions, paiements, formulaires) :
  // toujours le compte de la plateforme.
  const token = await getAccessToken();
  const { orgSlug } = getPlatformConfig();

  const res = await fetch(
    `${API_BASE}/v5/organizations/${encodeURIComponent(orgSlug)}/forms?pageSize=100`,
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HelloAsso forms error ${res.status}: ${text}`);
  }

  const json = (await res.json()) as HelloAssoPaginatedResponse<{
    formSlug: string;
    formType: string;
    title: string;
    state: string;
  }>;

  return json.data;
}

// ─── Webhook signature verification ───────────────────────────

/**
 * HelloAsso webhook event types we handle.
 */
export type HelloAssoWebhookEvent = {
  eventType: 'Payment' | 'Order' | string;
  /**
   * Checkout-intent metadata echoed at the notification root (some HelloAsso
   * configs surface it here rather than under `data.metadata`). Read
   * defensively from both places.
   */
  metadata?: Record<string, unknown>;
  data: {
    id: number;
    amount: number;
    state: string;
    payer?: {
      firstName?: string;
      lastName?: string;
      email?: string;
    };
    items?: Array<{
      name?: string;
      amount?: number;
    }>;
    /** Checkout-intent metadata echoed back by HelloAsso (primary channel). */
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
  };
};
