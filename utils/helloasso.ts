// utils/helloasso.ts
// HelloAsso API v5 client — OAuth2 client_credentials + checkout intents.
// Docs: https://dev.helloasso.com/docs
//
// Required env vars:
//   HELLOASSO_CLIENT_ID     – OAuth2 client ID
//   HELLOASSO_CLIENT_SECRET – OAuth2 client secret
//   HELLOASSO_ORG_SLUG      – Organization slug on HelloAsso

const API_BASE = 'https://api.helloasso.com';

// ─── OAuth2 token cache ────────────────────────────────────────

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

function getConfig() {
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

/**
 * Obtain an OAuth2 access token via client_credentials grant.
 * Tokens are cached in memory and refreshed 60 s before expiry.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const { clientId, clientSecret } = getConfig();

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

  cachedToken = {
    accessToken: data.access_token,
    // Refresh 60 s before actual expiry to avoid race conditions
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.accessToken;
}

// ─── Checkout intent ───────────────────────────────────────────

export type CheckoutInitRequest = {
  /** Amount in cents (e.g. 2500 = 25 €) */
  totalAmount: number;
  /** Payer info */
  payer: {
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
  const token = await getAccessToken();
  const { orgSlug } = getConfig();

  const body = {
    totalAmount: opts.totalAmount,
    initialAmount: opts.totalAmount,
    itemName: opts.itemName || 'Don pour l\'association',
    backUrl: opts.errorUrl,
    errorUrl: opts.errorUrl,
    returnUrl: opts.returnUrl,
    containsDonation: true,
    payer: {
      firstName: opts.payer.firstName,
      lastName: opts.payer.lastName,
      email: opts.payer.email,
    },
  };

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
  const token = await getAccessToken();
  const { orgSlug } = getConfig();

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
  const token = await getAccessToken();
  const { orgSlug } = getConfig();

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
  const token = await getAccessToken();
  const { orgSlug } = getConfig();

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
    [key: string]: unknown;
  };
};
