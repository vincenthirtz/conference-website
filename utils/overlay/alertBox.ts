// utils/overlay/alertBox.ts
//
// LA BOÎTE D'ALERTES : ce qui s'annonce à l'antenne, dans quel ordre, et avec
// quelle phrase.
//
// Pure — aucun DOM, aucun réseau, `now` injecté. La source (`/overlay/alertes`)
// ne fait qu'habiller ce que ce module décide, et l'API ne fait que lire.
//
// DEUX FLUX, UNE SEULE FILE. Les events Twitch viennent de
// `stream_alert_events` (webhook EventSub), les dons de `helloasso_donations`
// (webhook HelloAsso). Ils n'ont ni la même table ni le même espace
// d'identifiants — d'où le préfixage (`tw:` / `don:`) : deux lignes portant le
// même UUID dans deux tables ne doivent pas se faire passer l'une pour l'autre
// dans le registre des alertes déjà vues.
//
// CE MODULE REPREND LA DISCIPLINE DE `donAlert.ts`, dont il généralise la file :
// pas de rafale à l'ouverture de la source, pas de doublon, pas d'alerte
// périmée. Ces trois propriétés sont les seules qui comptent vraiment en
// direct, et ce sont celles que les tests protègent.

import { formatEuros } from '@/utils/overlay/donAlert';

/* ── Les types d'alerte ────────────────────────────────────────────────── */

/**
 * Dans l'ordre où l'éditeur les présente. `donation` est ici alors qu'il ne
 * vient pas de Twitch : pour la régie, c'est une alerte comme une autre.
 */
export const ALERT_KINDS = [
  'follow',
  'sub',
  'resub',
  'gift',
  'cheer',
  'raid',
  'donation',
] as const;

export type AlertKind = (typeof ALERT_KINDS)[number];

/** Les seuls types qu'un webhook Twitch peut déposer en base. */
export const TWITCH_ALERT_KINDS: readonly AlertKind[] = [
  'follow',
  'sub',
  'resub',
  'gift',
  'cheer',
  'raid',
];

export function isAlertKind(value: unknown): value is AlertKind {
  return (
    typeof value === 'string' &&
    (ALERT_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Une alerte, quelle que soit sa provenance.
 *
 * `amount` porte un sens différent selon `kind` (bits, mois, abonnements
 * offerts, spectateurs, centimes d'euro) — c'est `formatAlertAmount` qui sait
 * le dire, et c'est le seul endroit où cette connaissance vit.
 */
export type StreamAlert = {
  /** Préfixé par source : `tw:<uuid>` ou `don:<uuid>`. */
  id: string;
  kind: AlertKind;
  /** Pseudo Twitch, ou `null` (don, ou sub anonyme). */
  actorName: string | null;
  amount: number | null;
  tier: string | null;
  createdAt: string;
};

/* ── Les phrases par défaut ────────────────────────────────────────────── */

/**
 * Ce qui s'affiche tant que la régie n'a rien écrit.
 *
 * `{name}` et `{amount}` sont les deux seuls jetons interpolés. Un espace qui
 * n'a jamais ouvert l'éditeur doit avoir des alertes qui marchent — d'où des
 * défauts complets ici plutôt qu'une ligne obligatoire en base.
 */
export const DEFAULT_ALERT_MESSAGES: Record<AlertKind, string> = {
  follow: '{name} nous suit !',
  sub: '{name} vient de s’abonner !',
  resub: '{name} se réabonne pour {amount} !',
  gift: '{name} offre {amount} !',
  cheer: '{name} envoie {amount} !',
  raid: '{name} débarque avec {amount} !',
  donation: 'Merci pour ce don de {amount} !',
};

/** Quand Twitch ne donne pas de nom (sub ou gift anonyme). */
export const ANONYMOUS_ACTOR = 'Quelqu’un';

/* ── Les règles d'annonce ──────────────────────────────────────────────── */

export type AlertRule = {
  kind: AlertKind;
  enabled: boolean;
  message: string | null;
  minAmount: number | null;
};

export type AlertRuleMap = Partial<Record<AlertKind, AlertRule>>;

/**
 * La règle qui s'applique, règle absente comprise.
 *
 * UNE LIGNE ABSENTE VAUT « ACTIVÉ », pas « désactivé » : sans ça, installer la
 * source sur un espace neuf donnerait une boîte muette, et il faudrait deviner
 * qu'il manque sept lignes en base.
 */
export function resolveRule(rules: AlertRuleMap, kind: AlertKind): AlertRule {
  return (
    rules[kind] ?? {
      kind,
      enabled: true,
      message: null,
      minAmount: null,
    }
  );
}

/**
 * L'alerte passe-t-elle le filtre de la régie ?
 *
 * Le seuil ne s'applique QU'AUX types qui portent une quantité : un follow n'a
 * pas de montant, et un `min_amount` posé par erreur sur `follow` ne doit pas
 * éteindre les follows.
 */
export function alertPassesRule(alert: StreamAlert, rule: AlertRule): boolean {
  if (!rule.enabled) return false;
  if (rule.minAmount == null || rule.minAmount <= 0) return true;
  if (alert.amount == null) return true;
  return alert.amount >= rule.minAmount;
}

/* ── Mise en forme ─────────────────────────────────────────────────────── */

function plural(n: number, one: string, many: string): string {
  return n > 1 ? many : one;
}

/**
 * La quantité, dite comme on la dirait à l'antenne.
 *
 * C'est ici, et nulle part ailleurs, que `amount` reprend son sens : la colonne
 * est volontairement unique en base (cf. la migration), le type en donne la
 * lecture.
 */
export function formatAlertAmount(
  kind: AlertKind,
  amount: number | null,
  locale = 'fr-FR'
): string {
  if (amount == null) return '';
  switch (kind) {
    case 'cheer':
      return `${amount.toLocaleString(locale)} bits`;
    case 'resub':
      return `${amount} ${plural(amount, 'mois', 'mois')}`;
    case 'gift':
      return `${amount} ${plural(amount, 'abonnement', 'abonnements')}`;
    case 'raid':
      return `${amount} ${plural(amount, 'spectateur', 'spectateurs')}`;
    case 'donation':
      // Les dons sont stockés en CENTIMES, comme partout ailleurs.
      return formatEuros(amount, locale);
    default:
      return String(amount);
  }
}

/**
 * La phrase finale, prête à être posée dans la bande de l'habillage.
 *
 * Rendue en TEXTE par la source, jamais en HTML : `message` vient de la régie
 * et `{name}` d'un tiers (Twitch). Aucun des deux n'est de confiance.
 */
export function renderAlertMessage(
  alert: StreamAlert,
  rules: AlertRuleMap,
  locale = 'fr-FR'
): string {
  const rule = resolveRule(rules, alert.kind);
  const template = rule.message?.trim() || DEFAULT_ALERT_MESSAGES[alert.kind];
  const name = (alert.actorName ?? '').trim() || ANONYMOUS_ACTOR;
  const amount = formatAlertAmount(alert.kind, alert.amount, locale);
  return template.replaceAll('{name}', name).replaceAll('{amount}', amount);
}

/* ── La fusion des deux flux ───────────────────────────────────────────── */

export type TwitchEventRow = {
  id: string;
  kind: string;
  actor_name: string | null;
  amount: number | null;
  tier: string | null;
  created_at: string;
};

export type DonationRow = {
  id: string;
  amount_cents: number;
  created_at: string;
};

/**
 * Les deux tables en une seule liste, plus récente d'abord.
 *
 * Le tri départage les ex æquo par identifiant : deux alertes à la même
 * milliseconde doivent sortir dans le même ordre à chaque lecture, sinon la
 * file rejouerait l'une ou l'autre selon l'humeur du tri.
 */
export function mergeAlertSources(
  events: TwitchEventRow[],
  donations: DonationRow[]
): StreamAlert[] {
  const merged: StreamAlert[] = [];

  for (const row of events) {
    if (!isAlertKind(row.kind)) continue; // type inconnu : on n'invente pas
    merged.push({
      id: `tw:${row.id}`,
      kind: row.kind,
      actorName: row.actor_name ?? null,
      amount: row.amount ?? null,
      tier: row.tier ?? null,
      createdAt: row.created_at,
    });
  }

  for (const row of donations) {
    merged.push({
      id: `don:${row.id}`,
      kind: 'donation',
      actorName: null, // jamais : cf. la migration des dons
      amount: row.amount_cents,
      tier: null,
      createdAt: row.created_at,
    });
  }

  merged.sort((a, b) => {
    const d = b.createdAt.localeCompare(a.createdAt);
    return d !== 0 ? d : b.id.localeCompare(a.id);
  });
  return merged;
}

/* ── La file d'attente ─────────────────────────────────────────────────── */

/** Au-delà, une alerte découverte sur le tard n'a plus rien à annoncer. */
export const ALERT_MAX_AGE_MS = 5 * 60 * 1000;
/** Bornes du registre « déjà vu ». Un direct long ne doit pas gonfler sans fin. */
export const SEEN_LIMIT = 300;

export type AlertQueueState = {
  /** Faux tant que le premier flux n'a pas été absorbé. */
  primed: boolean;
  seen: string[];
  queue: StreamAlert[];
};

export function initialAlertQueue(): AlertQueueState {
  return { primed: false, seen: [], queue: [] };
}

export type AlertFeed = {
  alerts: StreamAlert[];
  /** L'horloge du SERVEUR : celle du poste de régie peut être fausse. */
  serverTime: string;
};

/**
 * Absorbe un flux et dit ce qu'il reste à annoncer.
 *
 * TROIS GARDE-FOUS, et ce sont les trois seules choses qui comptent :
 *
 * 1. PAS DE RAFALE À L'OUVERTURE. Au tout premier flux, tout est marqué vu et
 *    RIEN n'est mis en file. Sans ça, ajouter la source dans OBS — ou changer
 *    de scène, ce qui la recharge — rejouerait tous les subs de la soirée.
 * 2. PAS DE DOUBLON. Un identifiant déjà vu ne revient jamais, même si le
 *    serveur le renvoie à chaque poll (ce qu'il fait, sur une fenêtre).
 * 3. PAS D'ALERTE PÉRIMÉE. Une alerte plus vieille que ALERT_MAX_AGE_MS est
 *    marquée vue SANS être annoncée : au retour d'une coupure réseau, on
 *    reprend le direct, on ne rattrape pas un quart d'heure d'historique.
 *
 * Renvoie l'état INCHANGÉ (même référence) quand rien n'a bougé, pour ne pas
 * déclencher de rendu inutile dans une page qui tourne six heures.
 */
export function ingestAlerts(
  state: AlertQueueState,
  feed: AlertFeed,
  rules: AlertRuleMap = {}
): AlertQueueState {
  const seen = new Set(state.seen);
  const fresh = feed.alerts.filter((a) => a.id && !seen.has(a.id));
  if (fresh.length === 0 && state.primed) return state;

  const nowMs = Date.parse(feed.serverTime);
  // Plus ancienne d'abord : une file s'annonce dans l'ordre où c'est arrivé.
  const ordered = [...fresh].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt)
  );

  const toQueue = state.primed
    ? ordered.filter((alert) => {
        if (!alertPassesRule(alert, resolveRule(rules, alert.kind)))
          return false;
        const at = Date.parse(alert.createdAt);
        // Horodatage illisible : on annonce plutôt que de taire. Une alerte en
        // trop se voit et se corrige ; une alerte manquante ne se voit pas.
        if (!Number.isFinite(at) || !Number.isFinite(nowMs)) return true;
        return nowMs - at <= ALERT_MAX_AGE_MS;
      })
    : [];

  return {
    primed: true,
    seen: [...state.seen, ...ordered.map((a) => a.id)].slice(-SEEN_LIMIT),
    queue: [...state.queue, ...toQueue],
  };
}

/** Retire la première alerte de la file, sans muter l'état reçu. */
export function shiftAlertQueue(state: AlertQueueState): {
  next: StreamAlert | null;
  state: AlertQueueState;
} {
  if (state.queue.length === 0) return { next: null, state };
  const [next, ...rest] = state.queue;
  return { next, state: { ...state, queue: rest } };
}

/* ── Réglages ──────────────────────────────────────────────────────────── */

/** Durée par défaut : celle de l'animation d'habillage, bornes comprises. */
export const ALERT_DURATION_DEFAULT_MS = 19_000;
export const ALERT_DURATION_MIN_MS = 3_000;
export const ALERT_DURATION_MAX_MS = 60_000;

export function clampAlertDurationMs(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return ALERT_DURATION_DEFAULT_MS;
  return Math.min(
    ALERT_DURATION_MAX_MS,
    Math.max(ALERT_DURATION_MIN_MS, Math.round(raw))
  );
}

export function clampVolume(raw: number | null | undefined): number {
  if (raw == null || !Number.isFinite(raw)) return 70;
  return Math.min(100, Math.max(0, Math.round(raw)));
}
