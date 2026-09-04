// utils/tenants/domainVerification.ts
//
// Prouver qu'un espace possède le domaine qu'il déclare.
//
// Avant ce lot, `tenants.custom_domain` était un champ texte : n'importe quel
// espace pouvait écrire n'importe quel nom d'hôte, et le résolveur routait
// dessus. Deux conséquences — personne ne prouvait rien, et une faute de frappe
// donnait un site qui ne répond jamais, sans un mot d'explication.
//
// La preuve est un enregistrement TXT que seul le titulaire de la zone peut
// poser. Le CNAME, lui, ne prouve rien (n'importe qui peut pointer un nom vers
// nous) : il est vérifié quand même, parce que sans lui rien n'arrive — mais il
// est rapporté comme un avertissement, pas comme une preuve.

import dns from 'dns/promises';
import crypto from 'crypto';

/** Sous-domaine où se pose la preuve. */
export const PROOF_PREFIX = '_conference-verify';

/** Cible du CNAME, surchargeable par environnement (Netlify, autre). */
export function routingTarget(): string {
  return (
    process.env.CUSTOM_DOMAIN_TARGET ||
    process.env.NEXT_PUBLIC_SITE_HOST ||
    'owwomenscup.fr'
  );
}

export function generateDomainToken(): string {
  // 24 octets : assez pour n'être pas devinable, assez court pour tenir dans un
  // champ TXT sans que personne ne se batte avec le copier-coller.
  return `conference-verify=${crypto.randomBytes(24).toString('hex')}`;
}

export type DomainCheck = {
  ok: boolean;
  /** La preuve TXT est-elle publiée et correcte ? C'est elle qui autorise. */
  proofFound: boolean;
  /** Le domaine pointe-t-il chez nous ? Sans ça, rien n'arrivera. */
  routingFound: boolean;
  /** Message court, destiné à être affiché tel quel. */
  detail: string;
};

/**
 * Interroge le DNS. Ne jette jamais : un domaine inexistant, une zone
 * injoignable ou un timeout sont des RÉPONSES, pas des pannes de notre côté.
 *
 * `resolver` est injectable pour les tests — sans quoi la seule façon de tester
 * serait de posséder un domaine, ce qui n'est pas une base de test.
 */
export async function checkDomain(
  domain: string,
  expectedToken: string,
  resolver: {
    resolveTxt: (h: string) => Promise<string[][]>;
    resolveCname: (h: string) => Promise<string[]>;
  } = dns
): Promise<DomainCheck> {
  const target = routingTarget().toLowerCase();

  let proofFound = false;
  let txtError: string | null = null;
  try {
    const records = await resolver.resolveTxt(`${PROOF_PREFIX}.${domain}`);
    // Un TXT arrive en morceaux : c'est la concaténation qui fait foi.
    proofFound = records.some(
      (chunks) => chunks.join('').trim() === expectedToken
    );
  } catch (err) {
    txtError = err instanceof Error ? err.message : String(err);
  }

  let routingFound = false;
  try {
    const cname = await resolver.resolveCname(domain);
    routingFound = cname.some(
      (c) => c.toLowerCase().replace(/\.$/, '') === target
    );
  } catch {
    // Un domaine peut pointer par A/ALIAS plutôt que par CNAME (apex). On ne
    // sait pas le dire ici, donc on n'en fait jamais un motif de refus.
    routingFound = false;
  }

  if (!proofFound) {
    return {
      ok: false,
      proofFound: false,
      routingFound,
      detail: txtError
        ? `Enregistrement TXT ${PROOF_PREFIX}.${domain} introuvable.`
        : `Le TXT ${PROOF_PREFIX}.${domain} existe mais ne contient pas le jeton attendu.`,
    };
  }

  return {
    ok: true,
    proofFound: true,
    routingFound,
    detail: routingFound
      ? 'Domaine vérifié.'
      : `Domaine vérifié, mais aucun CNAME vers ${target} : le site ne répondra pas tant que le DNS ne pointe pas ici.`,
  };
}

/** Les deux enregistrements à créer, tels qu'on les montre au client. */
export function dnsInstructions(domain: string, token: string) {
  return [
    {
      type: 'TXT',
      name: `${PROOF_PREFIX}.${domain}`,
      value: token,
      why: 'Prouve que vous tenez ce domaine.',
    },
    {
      type: 'CNAME',
      name: domain,
      value: routingTarget(),
      why: 'Amène les visiteurs jusqu’ici.',
    },
  ];
}
