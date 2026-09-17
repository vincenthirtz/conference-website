// utils/overlay/donAlert.ts
//
// La logique PURE de la source OBS « alerte don » (`/overlay/don-alert`) : les
// paramètres d'URL, le format des montants, la jauge, la file d'alertes et le
// mode démo. Sans DOM ni réseau, pour être testée telle quelle.
//
// LA FILE, ET POURQUOI « DÉJÀ VU » AU PREMIER CHARGEMENT. OBS recharge une
// source navigateur à chaque ouverture de scène, et parfois en plein direct.
// Si chaque chargement annonçait les dons des dernières 24 h, la régie verrait
// une rafale d'alertes à chaque changement de scène. Le premier chargement
// réussi marque donc tout ce qu'il reçoit comme déjà vu ; seuls les dons
// apparus ENSUITE partent en alerte, un à la fois, dans l'ordre d'arrivée.

/** Un don tel que la source le manipule (le sous-ensemble de l'API). */
export type DonAlertDonation = {
  id: string;
  amountCents: number;
  createdAt: string;
};

export type DonAlertFeed = {
  /** Au moins aussi récents que les précédents, plus récents d'abord. */
  donations: DonAlertDonation[];
  /** Horloge du serveur, pour juger de la fraîcheur d'un don. */
  serverTime: string;
};

export type DonAlertQueueState = {
  /** Un premier chargement a-t-il déjà été absorbé ? */
  primed: boolean;
  /** Ids déjà vus (bornés, plus récents en fin). */
  seen: string[];
  /** Dons en attente d'alerte, plus ancien d'abord. */
  queue: DonAlertDonation[];
};

/** Nombre d'ids gardés en mémoire : l'API n'en rend jamais plus de 20. */
export const SEEN_LIMIT = 200;
/**
 * Un don plus vieux que ça, découvert tard (source cachée pendant une heure,
 * poll en échec), n'est plus annoncé : « merci » vingt minutes après sonne
 * faux à l'antenne. Il est marqué vu, sans alerte.
 */
export const ALERT_MAX_AGE_MS = 5 * 60 * 1000;

export const DURATION_DEFAULT_S = 8;
export const DURATION_MIN_S = 3;
export const DURATION_MAX_S = 30;
export const GOAL_MIN_EUROS = 1;
export const GOAL_MAX_EUROS = 1_000_000;

export function initialQueueState(): DonAlertQueueState {
  return { primed: false, seen: [], queue: [] };
}

/**
 * Absorbe une réponse de l'API. Premier appel : tout est « déjà vu », rien ne
 * part en alerte. Ensuite : les dons inconnus rejoignent la file (du plus
 * ancien au plus récent), sauf ceux trop vieux pour être annoncés.
 */
export function ingestDonations(
  state: DonAlertQueueState,
  feed: DonAlertFeed
): DonAlertQueueState {
  const seen = new Set(state.seen);
  const fresh = feed.donations.filter((d) => d.id && !seen.has(d.id));
  if (fresh.length === 0 && state.primed) return state;

  const nowMs = Date.parse(feed.serverTime);
  const ordered = [...fresh].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)
  );
  const toQueue = state.primed
    ? ordered.filter((d) => {
        const at = Date.parse(d.createdAt);
        return (
          !Number.isFinite(nowMs) ||
          !Number.isFinite(at) ||
          nowMs - at <= ALERT_MAX_AGE_MS
        );
      })
    : [];

  return {
    primed: true,
    seen: [...state.seen, ...ordered.map((d) => d.id)].slice(-SEEN_LIMIT),
    queue: [...state.queue, ...toQueue],
  };
}

/** Retire la prochaine alerte de la file. */
export function shiftQueue(state: DonAlertQueueState): {
  next: DonAlertDonation | null;
  state: DonAlertQueueState;
} {
  if (state.queue.length === 0) return { next: null, state };
  const [next, ...rest] = state.queue;
  return { next: next ?? null, state: { ...state, queue: rest } };
}

/**
 * « 10 € », « 12,50 € » (fr-FR) ou « €10 », « €12.50 » (en) : pas de
 * centimes quand le montant est rond, deux sinon.
 */
export function formatEuros(cents: number, locale = 'fr-FR'): string {
  const safe = Number.isFinite(cents) ? Math.max(0, Math.round(cents)) : 0;
  const whole = safe % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(safe / 100);
}

/** `?goal=` en euros (1 → 1 000 000, virgule acceptée) → centimes, sinon `null`. */
export function parseGoalCents(raw: string | null | undefined): number | null {
  const value = (raw ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;
  const euros = Number.parseFloat(value);
  if (!Number.isFinite(euros)) return null;
  if (euros < GOAL_MIN_EUROS || euros > GOAL_MAX_EUROS) return null;
  return Math.round(euros * 100);
}

/** `?duration=` en secondes : 8 par défaut, borné 3 → 30. */
export function parseAlertDurationMs(raw: string | null | undefined): number {
  const n = Number.parseFloat(raw ?? '');
  const seconds = Number.isFinite(n)
    ? Math.min(DURATION_MAX_S, Math.max(DURATION_MIN_S, n))
    : DURATION_DEFAULT_S;
  return Math.round(seconds * 1000);
}

/** Part de l'objectif atteinte, bornée à [0, 1]. */
export function gaugeRatio(totalCents: number, goalCents: number): number {
  if (!Number.isFinite(totalCents) || !(goalCents > 0)) return 0;
  return Math.min(1, Math.max(0, totalCents / goalCents));
}

// ─── Mode démo (`?demo=1`) ──────────────────────────────────────────────────
// AUCUN RÉSEAU, AUCUNE DONNÉE RÉELLE : de faux dons pour régler la scène avant
// le direct. Les ids sont préfixés `demo-` et ce flux ne se mélange jamais au
// vrai (la page coupe le polling quand la démo est active).

/** Intervalle entre deux faux dons. */
export const DEMO_INTERVAL_MS = 10_000;
const DEMO_AMOUNTS_CENTS = [1000, 500, 2000, 1250, 5000, 300, 10000, 1500];

/** Le n-ième faux don (n ≥ 0), daté de `nowMs`. */
export function demoDonation(n: number, nowMs: number): DonAlertDonation {
  const i = Math.abs(Math.trunc(n));
  return {
    id: `demo-${i}`,
    amountCents: DEMO_AMOUNTS_CENTS[i % DEMO_AMOUNTS_CENTS.length] ?? 1000,
    createdAt: new Date(nowMs).toISOString(),
  };
}

/**
 * Le total affiché par la démo après `n` faux dons : il monte, puis repart de
 * zéro une fois l'objectif dépassé, pour que la jauge bouge sans fin.
 */
export function demoTotalCents(n: number, goalCents: number | null): number {
  const cap = goalCents ?? 50_000;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    total += demoDonation(i, 0).amountCents;
    if (total > cap) total = 0;
  }
  return total;
}
