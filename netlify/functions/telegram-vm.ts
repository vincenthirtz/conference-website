// Telegram webhook → pilote la VM Linux de la Freebox via l'API distante.
//
// Pourquoi : le gestionnaire de VM Freebox n'a aucun autostart. Après une
// coupure de courant la box reboote mais laisse la VM éteinte → toute la stack
// (Bibimbox, discord-bot, etc.) reste down. Un bot hébergé SUR la VM ne peut
// pas la réveiller (il est down aussi). Cette fonction tourne dans le cloud
// Netlify et joint la box via son API distante (`*.fbxos.fr`), donc elle reste
// joignable même quand la VM est éteinte (dès que la box elle-même est revenue).
//
// Commandes Telegram : /start_vm  /stop_vm  /restart_vm  /status_vm
//
// Sécurité (double barrière) :
//   1. Header `X-Telegram-Bot-Api-Secret-Token` == TELEGRAM_WEBHOOK_SECRET
//      (défini à l'enregistrement du webhook ; Telegram le renvoie à chaque hit).
//   2. chat.id de l'expéditeur ∈ TELEGRAM_ALLOWED_CHAT_IDS (liste blanche).
//
// TLS : la box sert un certif signé par la CA privée Freebox (pas une CA
// publique), on l'épingle via FREEBOX_CA_PEM ci-dessous (intermédiaire ECC,
// valide jusqu'en 2034). On utilise node:https plutôt que fetch pour pouvoir
// passer un `ca` custom sans dépendre d'undici.
//
// Variables d'environnement Netlify requises :
//   TELEGRAM_BOT_TOKEN          token @BotFather
//   TELEGRAM_WEBHOOK_SECRET     secret partagé (cf. setWebhook ?secret_token=)
//   TELEGRAM_ALLOWED_CHAT_IDS   chat_id(s) autorisés, séparés par des virgules
//   FREEBOX_APP_TOKEN           token applicatif Freebox (perm vm:true)
// Optionnelles (valeurs par défaut sinon) :
//   FREEBOX_APP_ID              défaut "fr.bibimbox.api"
//   FREEBOX_API_REMOTE_BASE     défaut "https://tpiii9e3.fbxos.fr:6750/api/v8"
//   FREEBOX_VM_ID               défaut "2"

import type { Handler } from '@netlify/functions';
import https from 'node:https';
import crypto from 'node:crypto';

import { logger } from '../../utils/logger';

// Chaîne de confiance privée Freebox. Node n'active pas le « partial chain »
// par défaut, donc épingler le seul intermédiaire ne suffit pas (il exige une
// racine auto-signée comme ancre). On embarque donc la ROOT « Freebox ECC Root
// CA » (auto-signée, valide 2015 → 2035) — le serveur envoie leaf+intermédiaire,
// la root les ancre. L'intermédiaire est ajouté en bonus au cas où la box
// n'enverrait pas la chaîne complète. Source : dev.freebox.fr/sdk/os/.
const FREEBOX_CA_PEM = `-----BEGIN CERTIFICATE-----
MIICWTCCAd+gAwIBAgIJAMaRcLnIgyukMAoGCCqGSM49BAMCMGExCzAJBgNVBAYT
AkZSMQ8wDQYDVQQIDAZGcmFuY2UxDjAMBgNVBAcMBVBhcmlzMRMwEQYDVQQKDApG
cmVlYm94IFNBMRwwGgYDVQQDDBNGcmVlYm94IEVDQyBSb290IENBMB4XDTE1MDkw
MTE4MDIwN1oXDTM1MDgyNzE4MDIwN1owYTELMAkGA1UEBhMCRlIxDzANBgNVBAgM
BkZyYW5jZTEOMAwGA1UEBwwFUGFyaXMxEzARBgNVBAoMCkZyZWVib3ggU0ExHDAa
BgNVBAMME0ZyZWVib3ggRUNDIFJvb3QgQ0EwdjAQBgcqhkjOPQIBBgUrgQQAIgNi
AASCjD6ZKn5ko6cU5Vxh8GA1KqRi6p2GQzndxHtuUmwY8RvBbhZ0GIL7bQ4f08ae
JOv0ycWjEW0fyOnAw6AYdsN6y1eNvH2DVfoXQyGoCSvXQNAUxla+sJuLGICRYiZz
mnijYzBhMB0GA1UdDgQWBBTIB3c2GlbV6EIh2ErEMJvFxMz/QTAfBgNVHSMEGDAW
gBTIB3c2GlbV6EIh2ErEMJvFxMz/QTAPBgNVHRMBAf8EBTADAQH/MA4GA1UdDwEB
/wQEAwIBhjAKBggqhkjOPQQDAgNoADBlAjA8tzEMRVX8vrFuOGDhvZr7OSJjbBr8
gl2I70LeVNGEXZsAThUkqj5Rg9bV8xw3aSMCMQCDjB5CgsLH8EdZmiksdBRRKM2r
vxo6c0dSSNrr7dDN+m2/dRvgoIpGL2GauOGqDFY=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIICTjCCAdOgAwIBAgICEzgwCgYIKoZIzj0EAwIwYTELMAkGA1UEBhMCRlIxDzAN
BgNVBAgMBkZyYW5jZTEOMAwGA1UEBwwFUGFyaXMxEzARBgNVBAoMCkZyZWVib3gg
U0ExHDAaBgNVBAMME0ZyZWVib3ggRUNDIFJvb3QgQ0EwHhcNMjQwOTExMTY1NzMw
WhcNMzQwOTA5MTY1NzMwWjBZMQswCQYDVQQGEwJGUjEPMA0GA1UECAwGRnJhbmNl
MRMwEQYDVQQKDApGcmVlYm94IFNBMSQwIgYDVQQDDBtGcmVlYm94IEVDQyBJbnRl
cm1lZGlhdGUgQ0EwdjAQBgcqhkjOPQIBBgUrgQQAIgNiAASZh/Apn56RulcNKDqV
gVqTDusvVQK9kIgJD39MzpnbsxMWv16RKs5JXGNb21z5QsmDnKcjZt9TE+BPh4l0
KDmMtAL5q+I/r0lFuJE7JohWN47rPWb7hOl2N9RDY+6HqQyjZjBkMB0GA1UdDgQW
BBT6m56/7eLixv5eBCT7XHDeHaItXTAfBgNVHSMEGDAWgBTIB3c2GlbV6EIh2ErE
MJvFxMz/QTASBgNVHRMBAf8ECDAGAQH/AgEAMA4GA1UdDwEB/wQEAwIBhjAKBggq
hkjOPQQDAgNpADBmAjEAxxMePcul3xoJAWMai6KPFNSV+MJnNxJ1dxpcWxE04E4a
ry3KEvz2sAAtrf44kR3KAjEAjRTZoi4ZHKlOML1XBo20FGkVZjWmNxVWncYiFvg8
VFlUKziUxvOt/CVZaq0j7mJS
-----END CERTIFICATE-----`;

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const ALLOWED_CHAT_IDS = (process.env.TELEGRAM_ALLOWED_CHAT_IDS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const FREEBOX_APP_TOKEN = process.env.FREEBOX_APP_TOKEN;
const FREEBOX_APP_ID = process.env.FREEBOX_APP_ID || 'fr.bibimbox.api';
const FREEBOX_API_BASE =
  process.env.FREEBOX_API_REMOTE_BASE || 'https://tpiii9e3.fbxos.fr:6750/api/v8';
const FREEBOX_VM_ID = process.env.FREEBOX_VM_ID || '2';

// --- Client HTTPS minimal vers l'API Freebox (CA épinglée) -----------------

type FreeboxResp = {
  success?: boolean;
  result?: any;
  error_code?: string;
  msg?: string;
};

function freeboxRequest(
  method: 'GET' | 'POST',
  path: string,
  opts: { session?: string; body?: unknown } = {},
): Promise<FreeboxResp> {
  const url = new URL(`${FREEBOX_API_BASE}${path}`);
  const payload = opts.body != null ? JSON.stringify(opts.body) : undefined;

  const headers: Record<string, string> = {};
  if (opts.session) headers['X-Fbx-App-Auth'] = opts.session;
  if (payload) {
    headers['Content-Type'] = 'application/json';
    headers['Content-Length'] = String(Buffer.byteLength(payload));
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        headers,
        ca: FREEBOX_CA_PEM,
        timeout: 12_000,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as FreeboxResp);
          } catch {
            reject(new Error(`Réponse Freebox non-JSON (${res.statusCode}): ${data.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('timeout Freebox')));
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function freeboxLogin(): Promise<string> {
  const challengeResp = await freeboxRequest('GET', '/login/');
  const challenge = challengeResp.result?.challenge;
  if (!challenge) throw new Error('challenge Freebox introuvable (box injoignable ?)');
  const password = crypto
    .createHmac('sha1', FREEBOX_APP_TOKEN as string)
    .update(challenge)
    .digest('hex');
  const sess = await freeboxRequest('POST', '/login/session/', {
    body: { app_id: FREEBOX_APP_ID, password },
  });
  if (!sess.success || !sess.result?.session_token) {
    throw new Error(`login Freebox échoué: ${sess.error_code || sess.msg || 'inconnu'}`);
  }
  return sess.result.session_token as string;
}

async function vmStatus(session: string): Promise<string> {
  const resp = await freeboxRequest('GET', `/vm/${FREEBOX_VM_ID}`, { session });
  if (!resp.success || !resp.result) throw new Error('lecture statut VM échouée');
  return resp.result.status as string;
}

// --- Telegram ---------------------------------------------------------------

async function telegramSend(chatId: number | string, text: string): Promise<void> {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  });
}

const HELP = [
  '🖥️ *Contrôle VM Freebox*',
  '',
  '/start\\_vm — démarrer la VM',
  '/stop\\_vm — arrêter la VM (ACPI)',
  '/restart\\_vm — redémarrer',
  '/status\\_vm — état actuel',
].join('\n');

async function runCommand(command: string): Promise<string> {
  const session = await freeboxLogin();
  const current = await vmStatus(session);

  switch (command) {
    case 'status_vm':
      return `🖥️ VM \`${FREEBOX_VM_ID}\` : *${current}*`;

    case 'start_vm':
      if (current === 'running') return `✅ VM déjà *running* — rien à faire.`;
      await freeboxRequest('POST', `/vm/${FREEBOX_VM_ID}/start`, { session });
      return `🚀 Démarrage envoyé (était *${current}*). La stack remonte toute seule ensuite.`;

    case 'stop_vm':
      if (current !== 'running') return `✅ VM déjà *${current}* — rien à faire.`;
      await freeboxRequest('POST', `/vm/${FREEBOX_VM_ID}/powerbutton`, { session });
      return `🛑 Arrêt (ACPI) envoyé.`;

    case 'restart_vm':
      if (current === 'running') {
        await freeboxRequest('POST', `/vm/${FREEBOX_VM_ID}/powerbutton`, { session });
        return `🔄 Arrêt demandé — renvoie /start\\_vm une fois *stopped*.`;
      }
      await freeboxRequest('POST', `/vm/${FREEBOX_VM_ID}/start`, { session });
      return `🚀 Démarrage envoyé (était *${current}*).`;

    default:
      return HELP;
  }
}

// --- Handler ----------------------------------------------------------------

export const handler: Handler = async (event) => {
  // Toujours répondre 200 à Telegram (sinon il rejoue l'update en boucle).
  const ok = { statusCode: 200, body: 'ok' };

  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  if (!BOT_TOKEN || !WEBHOOK_SECRET || !FREEBOX_APP_TOKEN || ALLOWED_CHAT_IDS.length === 0) {
    logger.error('[telegram-vm] configuration incomplète (env manquantes)');
    return { statusCode: 503, body: 'not configured' };
  }

  // Barrière 1 : secret du webhook
  const secret =
    event.headers['x-telegram-bot-api-secret-token'] ||
    event.headers['X-Telegram-Bot-Api-Secret-Token'];
  if (secret !== WEBHOOK_SECRET) {
    logger.warn('[telegram-vm] secret webhook invalide');
    return { statusCode: 401, body: 'unauthorized' };
  }

  let update: any;
  try {
    update = JSON.parse(event.body || '{}');
  } catch {
    return ok;
  }

  const message = update.message || update.edited_message;
  const chatId = message?.chat?.id;
  const text: string = message?.text || '';
  if (!chatId || !text) return ok;

  // Barrière 2 : liste blanche
  if (!ALLOWED_CHAT_IDS.includes(String(chatId))) {
    logger.warn(`[telegram-vm] chat_id non autorisé: ${chatId}`);
    await telegramSend(chatId, '⛔ Non autorisé.');
    return ok;
  }

  // /start_vm@MonBot  → start_vm
  const command = text.trim().replace(/^\//, '').split(/[@\s]/)[0].toLowerCase();

  try {
    const reply = await runCommand(command);
    await telegramSend(chatId, reply);
  } catch (err) {
    logger.error('[telegram-vm] erreur commande:', err);
    const msg = err instanceof Error ? err.message : String(err);
    await telegramSend(chatId, `❌ Échec : ${msg}`);
  }

  return ok;
};
