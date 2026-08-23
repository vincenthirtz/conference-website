// lib/analytics/attribution.ts
//
// Attribution d'inscription : d'où vient la joueuse qui vient de créer un
// compte ? Sans ça, on peut compter les inscriptions mais pas savoir quel
// canal les produit — donc pas savoir où investir.
//
// Deux niveaux, volontairement distincts pour rester propre côté RGPD :
//
//   1. SANS consentement — on lit les `utm_*` de l'URL AU MOMENT de la
//      soumission du formulaire. Aucune écriture, aucune persistance : c'est
//      une donnée que la personne envoie elle-même avec son formulaire.
//      Ne capte que les arrivées directes sur /register (ou /team/create).
//   2. AVEC consentement `analytics` — on mémorise la PREMIÈRE touche
//      (utm_*, referrer, page d'atterrissage) en `sessionStorage`, ce qui
//      permet d'attribuer une inscription survenue trois pages plus loin.
//
// Le referrer n'est conservé qu'au niveau du HÔTE (`twitch.tv`), jamais l'URL
// complète : c'est le signal utile, sans le détail de navigation.

import { hasAnalyticsConsent } from './consent';

export type Attribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  /** Hôte du referrer uniquement (jamais l'URL complète). */
  referrer?: string;
  /** Chemin de la page d'atterrissage (jamais la query). */
  landing?: string;
  /** Date ISO de la première touche. */
  at?: string;
};

export const ATTRIBUTION_STORAGE_KEY = 'signup_attribution';

/** Borne la taille de chaque champ : ces valeurs partent en metadata de compte. */
const MAX_FIELD = 120;

function clean(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, MAX_FIELD);
  return trimmed.length ? trimmed : undefined;
}

/** Hôte d'une URL de referrer, ou `undefined` si vide/illisible/interne. */
function referrerHost(
  referrer: string | null | undefined,
  selfHost?: string
): string | undefined {
  if (!referrer) return undefined;
  try {
    const host = new URL(referrer).host;
    // Une navigation interne n'est pas une source d'acquisition.
    if (!host || (selfHost && host === selfHost)) return undefined;
    return clean(host);
  } catch {
    return undefined;
  }
}

/**
 * Extrait une attribution d'une URL + d'un referrer. Pure — c'est le cœur
 * testable.
 *
 * Retourne `null` quand il n'y a strictement rien à retenir (ni utm, ni
 * referrer externe) : on ne stocke pas une attribution vide, sinon la première
 * touche « directe » écraserait une vraie source arrivée plus tard.
 */
export function parseAttribution(
  href: string,
  referrer?: string | null
): Attribution | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  const q = url.searchParams;
  const attribution: Attribution = {
    source: clean(q.get('utm_source')),
    medium: clean(q.get('utm_medium')),
    campaign: clean(q.get('utm_campaign')),
    content: clean(q.get('utm_content')),
    term: clean(q.get('utm_term')),
    referrer: referrerHost(referrer, url.host),
  };

  const hasSignal = Object.values(attribution).some((v) => v !== undefined);
  if (!hasSignal) return null;

  attribution.landing = clean(url.pathname);
  // Champs `undefined` retirés : ils partent en JSON vers l'API.
  return Object.fromEntries(
    Object.entries(attribution).filter(([, v]) => v !== undefined)
  ) as Attribution;
}

/**
 * Mémorise la première touche (no-op sans consentement `analytics`).
 *
 * Premier arrivé, premier servi : une attribution déjà stockée n'est jamais
 * écrasée — c'est ce qui a amené la joueuse sur le site qui compte, pas la
 * dernière page qu'elle a ouverte.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  if (!hasAnalyticsConsent()) return;
  try {
    if (window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)) return;
    const parsed = parseAttribution(
      window.location.href,
      document.referrer || null
    );
    if (!parsed) return;
    window.sessionStorage.setItem(
      ATTRIBUTION_STORAGE_KEY,
      JSON.stringify({ ...parsed, at: new Date().toISOString() })
    );
  } catch {
    // sessionStorage indisponible (navigation privée, quota) → on s'en passe.
  }
}

/** Attribution de première touche mémorisée, si consentement et si présente. */
export function readStoredAttribution(): Attribution | null {
  if (typeof window === 'undefined') return null;
  if (!hasAnalyticsConsent()) return null;
  try {
    const raw = window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Attribution;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Attribution à joindre à une inscription : première touche mémorisée si elle
 * existe, sinon les `utm_*` de l'URL courante (chemin sans consentement).
 */
export function resolveSignupSource(): Attribution | null {
  if (typeof window === 'undefined') return null;
  const stored = readStoredAttribution();
  if (stored) return stored;
  return parseAttribution(window.location.href, document.referrer || null);
}
