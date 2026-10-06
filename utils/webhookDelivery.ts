// utils/webhookDelivery.ts
//
// Envoi HTTP d'UN webhook sortant — le moteur partagé par le dispatcher
// (pages/api/cron/webhook-dispatch.ts) et les gestes admin « Envoyer un test »
// / « Renvoyer » (features/admin/tenants/service/integrations.ts).
//
// Garde anti-SSRF à l'envoi : l'URL a été validée à l'écriture
// (`checkWebhookUrl`), mais un nom public peut résoudre vers une adresse
// privée, et un abonnement antérieur à la règle HTTPS peut subsister. On
// revérifie donc l'hôte, on résout le nom et on refuse toute adresse privée
// ou réservée. Les redirections ne sont PAS suivies (une 3xx vers
// http://169.254.169.254 contournerait tout ce qui précède) : une 3xx compte
// comme un échec, comme chez les grands émetteurs de webhooks.
//
// Limite connue : `fetch` résout à nouveau le nom après notre vérification
// (DNS rebinding). Fermer cette fenêtre demanderait un agent HTTP épinglé sur
// l'adresse vérifiée — hors de portée sans dépendance.

import { lookup } from 'node:dns/promises';
import { isBlockedWebhookAddress } from './webhooks';

export const WEBHOOK_DELIVERY_TIMEOUT_MS = 8_000;

export type WebhookPostResult = {
  ok: boolean;
  status: number | null;
  error: string | null;
};

/** Résout un nom d'hôte en adresses IP (injectable pour les tests). */
export type HostResolver = (host: string) => Promise<string[]>;

const defaultResolver: HostResolver = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

function refused(error: string): WebhookPostResult {
  return { ok: false, status: null, error };
}

/**
 * Vérifie que l'URL vise un hôte public, résolution DNS comprise. Renvoie
 * `null` si l'envoi est permis, sinon le motif du refus.
 */
export async function assertPublicWebhookTarget(
  url: string,
  resolve: HostResolver = defaultResolver
): Promise<string | null> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'URL invalide';
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return 'Protocole refusé';
  }
  const host = parsed.hostname.replace(/\.$/, '');
  if (!host || host.toLowerCase() === 'localhost') return 'Hôte refusé';
  if (isBlockedWebhookAddress(host)) return 'Adresse privée ou réservée';
  // IP littérale publique : rien à résoudre.
  if (host.startsWith('[') || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) {
    return null;
  }
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch (err) {
    return `Résolution DNS impossible : ${
      err instanceof Error ? err.message : String(err)
    }`.slice(0, 500);
  }
  if (addresses.length === 0) return 'Résolution DNS vide';
  if (addresses.some(isBlockedWebhookAddress)) {
    return 'Le nom résout vers une adresse privée ou réservée';
  }
  return null;
}

/**
 * POST signé vers l'URL d'un abonnement. Ne lève jamais : un refus, un
 * timeout ou une erreur réseau rendent `{ ok:false, status:null, error }`.
 */
export async function postWebhook(
  url: string,
  body: string,
  headers: Record<string, string>,
  opts: { resolve?: HostResolver; timeoutMs?: number } = {}
): Promise<WebhookPostResult> {
  const blocked = await assertPublicWebhookTarget(url, opts.resolve);
  if (blocked) return refused(blocked);

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? WEBHOOK_DELIVERY_TIMEOUT_MS
  );
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body,
      redirect: 'manual',
      signal: controller.signal,
    });
    // `redirect: 'manual'` : une 3xx arrive ici avec `ok=false` — voulu.
    return {
      ok: res.ok,
      status: res.status,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (err) {
    return refused(
      (err instanceof Error ? err.message : String(err)).slice(0, 500)
    );
  } finally {
    clearTimeout(timer);
  }
}
