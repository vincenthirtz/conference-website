// utils/overlay/donationsOverlay.ts
//
// Le cœur PUR de `GET /api/overlay/donations`, lu par la source OBS « alerte
// don » (`/overlay/don-alert`) : quels dons montrer, et le total de la jauge.
//
// DEUX FENÊTRES DIFFÉRENTES, VOLONTAIREMENT :
//   - la liste des dons (les alertes) ne remonte qu'à 24 h : une source ouverte
//     le lendemain n'a rien à annoncer, et la liste reste courte ;
//   - le total (la jauge) court depuis le début du jour `?from=` à Paris, qui
//     peut être une date passée : une campagne de trois jours garde sa jauge.
//
// Aucune donnée du donateur ne transite : la table n'en contient pas, et la
// vue ci-dessous ne rend que id / montant / devise / date.

/** Au-delà, un don n'est plus « récent » pour une alerte. */
export const DONATION_LIST_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Nombre maximal de dons rendus dans la liste. */
export const DONATION_LIST_LIMIT = 20;
/** Plafond de lignes lues pour le total : une jauge, pas une comptabilité. */
export const DONATION_TOTAL_MAX_ROWS = 10_000;

export type DonationRowForOverlay = {
  id: string;
  amount_cents: number;
  currency: string | null;
  created_at: string;
};

export type OverlayDonationView = {
  id: string;
  amountCents: number;
  currency: string;
  createdAt: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DonationAfter =
  | { kind: 'none' }
  | { kind: 'id'; id: string }
  | { kind: 'time'; ms: number };

/**
 * `?after=` : l'id d'un don déjà vu, ou un horodatage ISO. `null` = illisible
 * (400). Absent → pas de filtre.
 */
export function parseDonationAfter(
  raw: string | null | undefined
): DonationAfter | null {
  const value = (raw ?? '').trim();
  if (!value) return { kind: 'none' };
  if (UUID_RE.test(value)) return { kind: 'id', id: value.toLowerCase() };
  // Une date seule (`2026-09-17`) est acceptée par Date.parse ; on exige un
  // instant, pour ne pas interpréter un jour en minuit UTC par surprise.
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return { kind: 'time', ms };
  }
  return null;
}

/** Début de la fenêtre des alertes : 24 h, ou plus tard si `after` le dit. */
export function donationListSinceMs(nowMs: number, afterMs: number | null) {
  const floor = nowMs - DONATION_LIST_WINDOW_MS;
  return afterMs != null && afterMs > floor ? afterMs : floor;
}

export function toDonationView(
  row: DonationRowForOverlay
): OverlayDonationView {
  return {
    id: row.id,
    amountCents: row.amount_cents,
    currency: row.currency || 'EUR',
    createdAt: new Date(Date.parse(row.created_at)).toISOString(),
  };
}

/**
 * Les dons à rendre : plus récents d'abord, strictement après `sinceMs`
 * (au plus tôt 24 h), coupés à `DONATION_LIST_LIMIT`.
 */
export function selectRecentDonations(
  rows: DonationRowForOverlay[],
  nowMs: number,
  afterMs: number | null = null
): OverlayDonationView[] {
  const since = donationListSinceMs(nowMs, afterMs);
  const strict = afterMs != null && afterMs >= since;
  return rows
    .filter((row) => {
      const at = Date.parse(row.created_at);
      if (!Number.isFinite(at)) return false;
      return strict ? at > since : at >= since;
    })
    .sort(
      (a, b) =>
        Date.parse(b.created_at) - Date.parse(a.created_at) ||
        b.id.localeCompare(a.id)
    )
    .slice(0, DONATION_LIST_LIMIT)
    .map(toDonationView);
}

/** Total et nombre de dons depuis le début du jour `from` (à Paris). */
export function sumDonationsSince(
  rows: Array<Pick<DonationRowForOverlay, 'amount_cents' | 'created_at'>>,
  fromStartMs: number
): { totalCents: number; count: number } {
  let totalCents = 0;
  let count = 0;
  for (const row of rows) {
    const at = Date.parse(row.created_at);
    if (!Number.isFinite(at) || at < fromStartMs) continue;
    if (!Number.isFinite(row.amount_cents) || row.amount_cents < 0) continue;
    totalCents += row.amount_cents;
    count += 1;
  }
  return { totalCents, count };
}
