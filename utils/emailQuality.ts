// utils/emailQuality.ts
// Durcissement de la validation email au-delà du simple format zod
// (`z.string().email()` accepte n'importe quel domaine plausible, ex. a@a.com) :
// - syntaxe stricte : longueurs RFC (local ≤ 64, total ≤ 254), pas de points
//   doublés, domaine avec TLD alphabétique d'au moins 2 caractères ;
// - blocage des domaines placeholder (example.com, TLD réservés RFC 2606/6761)
//   et des fournisseurs d'emails jetables connus (yopmail, mailinator…).
// Module pur, sans dépendance Node : importable côté client comme serveur.
// La vérification DNS (MX/A) — serveur uniquement — vit dans utils/emailDns.ts.

export type EmailQualityReason = 'syntax' | 'blocked_domain';

export type EmailQualityResult =
  | { ok: true }
  | { ok: false; reason: EmailQualityReason };

export const EMAIL_QUALITY_MESSAGES: Record<EmailQualityReason, string> = {
  syntax: 'Adresse email invalide.',
  blocked_domain:
    'Ce domaine email n’est pas accepté. Utilise une adresse email réelle.',
};

// Syntaxe stricte : local-part RFC 5322 usuel (sans quoted-string), domaine en
// labels alphanumériques (tirets internes), TLD final alphabétique ≥ 2.
const STRICT_EMAIL_REGEX =
  /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i;

// TLD réservés à la documentation/aux tests (RFC 2606, RFC 6761) : jamais
// joignables par email.
const RESERVED_TLDS = new Set([
  'test',
  'example',
  'invalid',
  'localhost',
  'local',
  'internal',
]);

// Domaines placeholder + fournisseurs d'adresses jetables les plus répandus.
// Un sous-domaine d'une entrée est bloqué aussi (ex. foo.yopmail.com).
const BLOCKED_DOMAINS = new Set([
  // Placeholder / documentation
  'example.com',
  'example.org',
  'example.net',
  'email.com', // placeholder fréquent dans les formulaires
  // Jetables
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
  'jetable.org',
  'jetable.com',
  'mailinator.com',
  'guerrillamail.com',
  'sharklasers.com',
  'grr.la',
  '10minutemail.com',
  'temp-mail.org',
  'tempmail.com',
  'tempmail.dev',
  'tempinbox.com',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.fr',
  'getnada.com',
  'maildrop.cc',
  'dispostable.com',
  'mohmal.com',
  'emailondeck.com',
  'fakeinbox.com',
  'mytemp.email',
  'mail-temporaire.fr',
  'mailcatch.com',
  'spamgourmet.com',
]);

/** Normalisation canonique appliquée partout (stockage, comparaison). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at === -1 ? '' : email.slice(at + 1);
}

function isBlockedDomain(domain: string): boolean {
  if (BLOCKED_DOMAINS.has(domain)) return true;
  for (const blocked of BLOCKED_DOMAINS) {
    if (domain.endsWith('.' + blocked)) return true;
  }
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return RESERVED_TLDS.has(tld);
}

/**
 * Vérifications synchrones (syntaxe stricte + blocklist). Ne fait AUCUN appel
 * réseau : pour la vérification d'existence du domaine, voir
 * `checkEmailDomainDns` (utils/emailDns.ts, serveur uniquement).
 */
export function checkEmailQuality(rawEmail: string): EmailQualityResult {
  const email = normalizeEmail(rawEmail);
  const at = email.lastIndexOf('@');
  const local = at === -1 ? '' : email.slice(0, at);
  const domain = domainOf(email);

  if (
    email.length > 254 ||
    local.length === 0 ||
    local.length > 64 ||
    !STRICT_EMAIL_REGEX.test(email)
  ) {
    return { ok: false, reason: 'syntax' };
  }

  if (isBlockedDomain(domain)) {
    return { ok: false, reason: 'blocked_domain' };
  }

  return { ok: true };
}
