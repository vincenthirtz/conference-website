// scripts/realtime-check.mjs — contrôle du Worker temps réel après
// déploiement (.github/workflows/realtime.yml, docs/REALTIME-DO.md).
//
// 1. /health répond ; une notification non signée est refusée ; un salon privé
//    sans ticket est refusé ; un salon public sans WebSocket répond 426.
// 2. Salon public de contrôle (`test:ci-…`) : connexion, ping/pong, présence
//    diffusée, notification signée reçue.
// 3. Salon privé avec un ticket signé : connexion acceptée, notification reçue.
//
// Secrets lus dans l'environnement : REALTIME_NOTIFY_SECRET,
// REALTIME_TICKET_SECRET. Usage : node scripts/realtime-check.mjs <url>

import { appendFileSync } from 'node:fs';
import { createHmac, randomBytes } from 'node:crypto';

const base = (process.argv[2] ?? '').replace(/\/+$/, '');
const NOTIFY = process.env.REALTIME_NOTIFY_SECRET ?? '';
const TICKET = process.env.REALTIME_TICKET_SECRET ?? '';
if (!base || !NOTIFY || !TICKET) {
  console.error(
    'Usage : REALTIME_NOTIFY_SECRET=… REALTIME_TICKET_SECRET=… node scripts/realtime-check.mjs <url>'
  );
  process.exit(2);
}
const wsBase = base.replace(/^http/, 'ws');
const hmac = (secret, data) =>
  createHmac('sha256', secret).update(data).digest('hex');

const lines = [];
let bad = 0;
const check = (ok, label, detail = '') => {
  if (!ok) bad++;
  const line = `${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`;
  console.log(line);
  lines.push(`- ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`);
  return ok;
};

async function notify(room, table, op, id, { sign = true } = {}) {
  const body = JSON.stringify({ room, table, op, id });
  const ts = String(Date.now());
  const headers = { 'content-type': 'application/json' };
  if (sign) {
    headers['x-realtime-timestamp'] = ts;
    headers['x-realtime-signature'] = hmac(NOTIFY, `${ts}.${body}`);
  }
  const r = await fetch(`${base}/notify`, { method: 'POST', headers, body });
  return { status: r.status, body: await r.text() };
}

function ticketFor(room, user) {
  const payload = Buffer.from(
    JSON.stringify({
      r: room,
      exp: Math.floor(Date.now() / 1000) + 300,
      ...(user ? { u: user } : {}),
    })
  ).toString('base64url');
  return `${payload}.${hmac(TICKET, payload)}`;
}

/** Ouvre une WebSocket et collecte ses messages ; rejette sur erreur. */
function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    ws.addEventListener('message', (e) => {
      const data = String(e.data);
      inbox.push(data);
      for (const w of [...waiters])
        if (w.test(data)) {
          waiters.splice(waiters.indexOf(w), 1);
          w.resolve(data);
        }
    });
    ws.addEventListener('open', () =>
      resolve({
        ws,
        next(test, ms = 8000) {
          const found = inbox.find(test);
          if (found) return Promise.resolve(found);
          return new Promise((res, rej) => {
            const w = { test, resolve: res };
            waiters.push(w);
            setTimeout(() => rej(new Error('délai dépassé')), ms);
          });
        },
      })
    );
    ws.addEventListener('error', () => reject(new Error('connexion refusée')));
  });
}

const json = (s) => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

// 1. Refus et santé
{
  const h = await fetch(`${base}/health`);
  check(
    h.status === 200 && (await h.text()) === 'ok',
    '/health',
    String(h.status)
  );
  const unsigned = await notify('test:ci', 'matches', 'UPDATE', 'x', {
    sign: false,
  });
  check(
    unsigned.status === 401,
    'notification non signée refusée',
    String(unsigned.status)
  );
  const priv = await fetch(`${base}/rooms/demandes:team:ci`);
  check(
    priv.status === 401,
    'salon privé sans ticket refusé',
    String(priv.status)
  );
  const pub = await fetch(`${base}/rooms/draft:ci`);
  check(
    pub.status === 426,
    'salon public sans WebSocket : 426',
    String(pub.status)
  );
}

// 2. Salon public de contrôle
{
  const room = `test:ci-${randomBytes(4).toString('hex')}`;
  try {
    const c = await open(`${wsBase}/rooms/${room}`);
    c.ws.send('ping');
    check((await c.next((m) => m === 'pong')) === 'pong', 'ping → pong');
    c.ws.send(JSON.stringify({ type: 'presence', state: { name: 'ci' } }));
    const p = json(await c.next((m) => json(m)?.type === 'presence'));
    check(
      p?.users?.some((u) => u.state?.name === 'ci'),
      'présence diffusée'
    );
    const n = await notify(room, 'matches', 'UPDATE', 'ci-1');
    check(
      n.status === 200 && json(n.body)?.delivered >= 1,
      'notification signée acceptée',
      n.body
    );
    const ch = json(await c.next((m) => json(m)?.type === 'change'));
    check(
      ch?.room === room &&
        ch?.table === 'matches' &&
        ch?.op === 'UPDATE' &&
        ch?.id === 'ci-1' &&
        !('new' in ch),
      'changement reçu, sans données de ligne'
    );
    c.ws.close();
  } catch (e) {
    check(false, 'salon public de contrôle', e.message);
  }
}

// 3. Salon privé avec ticket
{
  const room = `demandes:team:ci-${randomBytes(4).toString('hex')}`;
  try {
    const c = await open(
      `${wsBase}/rooms/${room}?ticket=${encodeURIComponent(ticketFor(room, 'ci-user'))}`
    );
    check(true, 'salon privé avec ticket : connexion acceptée');
    await notify(room, 'demandes', 'INSERT', 'ci-2');
    const ch = json(await c.next((m) => json(m)?.type === 'change'));
    check(
      ch?.table === 'demandes' && ch?.id === 'ci-2',
      'changement reçu dans le salon privé'
    );
    c.ws.close();
  } catch (e) {
    check(false, 'salon privé avec ticket', e.message);
  }
}

lines.push(
  '',
  bad === 0 ? '**Tout est conforme.**' : `**${bad} contrôle(s) en écart.**`
);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    [`# Temps réel — ${base}`, '', ...lines, ''].join('\n')
  );
}
process.exit(bad === 0 ? 0 : 1);
