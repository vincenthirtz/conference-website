// utils/emailDns.ts
// Vérification d'existence du domaine email (serveur uniquement — node:dns).
// Attrape les domaines fantaisistes qui passent la validation de format
// (ex. a@a.com : syntaxe valide, mais a.com est NXDOMAIN).
//
// Politique : fail-closed uniquement quand le DNS répond de façon certaine que
// le domaine ne peut pas recevoir d'email (NXDOMAIN / aucun MX ni A/AAAA /
// null-MX RFC 7505). Toute erreur transitoire (timeout, SERVFAIL, résolveur
// injoignable) → fail-open, pour ne jamais bloquer une inscription légitime à
// cause d'un incident réseau.

import { promises as dns } from 'node:dns';

export type EmailDnsResult =
  | { ok: true }
  | { ok: false; reason: 'domain_unresolvable' };

export type EmailDnsResolver = {
  resolveMx: (domain: string) => Promise<{ exchange: string }[]>;
  resolve4: (domain: string) => Promise<string[]>;
  resolve6: (domain: string) => Promise<string[]>;
};

const DEFAULT_TIMEOUT_MS = 2_500;

// Codes DNS « négatifs certains » : le domaine/l'enregistrement n'existe pas.
const DEFINITE_MISS_CODES = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);

type LookupOutcome = 'found' | 'miss' | 'unknown';

async function attempt(
  fn: () => Promise<unknown[]>,
  timeoutMs: number
): Promise<LookupOutcome> {
  try {
    const records = await Promise.race([
      fn(),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), timeoutMs)
      ),
    ]);
    if (records === 'timeout') return 'unknown';
    return (records as unknown[]).length > 0 ? 'found' : 'miss';
  } catch (err) {
    const code = (err as { code?: string }).code || '';
    return DEFINITE_MISS_CODES.has(code) ? 'miss' : 'unknown';
  }
}

/**
 * Vérifie que le domaine d'une adresse email existe et peut recevoir du
 * courrier : MX présent, sinon repli A/AAAA (RFC 5321). `resolver` est
 * injectable pour les tests.
 */
export async function checkEmailDomainDns(
  email: string,
  opts: { resolver?: EmailDnsResolver; timeoutMs?: number } = {}
): Promise<EmailDnsResult> {
  const at = email.lastIndexOf('@');
  const domain = at === -1 ? '' : email.slice(at + 1).toLowerCase();
  if (!domain) return { ok: false, reason: 'domain_unresolvable' };

  const resolver = opts.resolver ?? dns;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  let mxRecords: { exchange: string }[] | null = null;
  try {
    const raced = await Promise.race([
      resolver.resolveMx(domain),
      new Promise<'timeout'>((resolve) =>
        setTimeout(() => resolve('timeout'), timeoutMs)
      ),
    ]);
    if (raced !== 'timeout') mxRecords = raced;
  } catch (err) {
    const code = (err as { code?: string }).code || '';
    if (!DEFINITE_MISS_CODES.has(code)) return { ok: true }; // transitoire → fail-open
    mxRecords = [];
  }

  if (mxRecords === null) return { ok: true }; // timeout → fail-open

  if (mxRecords.length > 0) {
    // Null-MX (RFC 7505) : « MX 0 . » déclare explicitement que le domaine
    // ne reçoit pas d'email.
    const usable = mxRecords.some(
      (r) => r.exchange && r.exchange !== '.' && r.exchange !== ''
    );
    return usable ? { ok: true } : { ok: false, reason: 'domain_unresolvable' };
  }

  // Pas de MX : repli RFC 5321 sur un enregistrement d'adresse.
  const [v4, v6] = await Promise.all([
    attempt(() => resolver.resolve4(domain), timeoutMs),
    attempt(() => resolver.resolve6(domain), timeoutMs),
  ]);
  if (v4 === 'found' || v6 === 'found') return { ok: true };
  if (v4 === 'miss' && v6 === 'miss') {
    return { ok: false, reason: 'domain_unresolvable' };
  }
  return { ok: true }; // incertain → fail-open
}
