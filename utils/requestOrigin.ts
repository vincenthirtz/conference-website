// utils/requestOrigin.ts
//
// Origine publique (`https://hôte`) d'une requête, pour fabriquer des URL de
// retour absolues (paiements HelloAsso…).
//
// POURQUOI PAS `x-forwarded-proto` TEL QUEL. Derrière une chaîne de relais
// (edge Netlify → CloudFront → Caddy → Node), l'en-tête décrit le DERNIER
// saut, pas ce qu'a vu le navigateur : un saut interne en HTTP donnerait
// `http://owwomenscup.fr/...` — une URL de retour que HelloAsso peut refuser,
// et qui ferait de toute façon repasser la joueuse par une redirection. Il
// peut aussi arriver en liste (`https, http`), ce qui casse l'URL.
//
// Le site public n'existe qu'en HTTPS : on force `https`, sauf sur un hôte
// local qui annonce explicitement `http` (développement). Sur Netlify, qui
// envoie toujours `https`, le résultat est inchangé.

import type { NextApiRequest } from 'next';

function firstHeaderValue(raw: string | string[] | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? '').split(',')[0].trim().toLowerCase();
}

function isLocalHost(host: string): boolean {
  const name = host.replace(/:\d+$/, '').toLowerCase();
  return (
    name === 'localhost' ||
    name === '127.0.0.1' ||
    name === '[::1]' ||
    name.endsWith('.localhost')
  );
}

/** `https://<Host>` (ou `http://` en local explicite). */
export function requestOrigin(req: Pick<NextApiRequest, 'headers'>): string {
  const host = firstHeaderValue(req.headers.host);
  const proto =
    firstHeaderValue(req.headers['x-forwarded-proto']) === 'http' &&
    isLocalHost(host)
      ? 'http'
      : 'https';
  return `${proto}://${host}`;
}
