// scripts/realtime-check.mjs — contrôle du Worker temps réel après
// déploiement (.github/workflows/realtime.yml, docs/REALTIME-DO.md).
//
// 1. /health répond ; une notification non signée est refusée ; un salon privé
//    sans ticket est refusé ; un salon public sans WebSocket répond 426.
// 2. Salon public de contrôle (`test:ci-…`) : connexion, ping/pong, présence
//    diffusée, notification signée reçue.
// 3. Salon privé avec un ticket signé : connexion acceptée, notification reçue.
// 4. Salons de la Women's Library (`ci-…`) : refus, présence, relais sans écho,
//    salon du serveur fermé aux écrans, publication signée reçue.
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
        inbox,
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
  for (const room of ['demandes:team:ci', 'caster:presence']) {
    const priv = await fetch(`${base}/rooms/${room}`);
    check(
      priv.status === 401,
      `salon privé sans ticket refusé (${room})`,
      String(priv.status)
    );
  }
  for (const room of ['draft:ci', 'caster:themes']) {
    const pub = await fetch(`${base}/rooms/${room}`);
    check(
      pub.status === 426,
      `salon public sans WebSocket : 426 (${room})`,
      String(pub.status)
    );
  }
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

// 4. Women's Library : le salon est dans le ticket, jamais dans l'adresse.
{
  const id = `ci-${randomBytes(4).toString('hex')}`;
  const peerRoom = `library:room:${id}`;
  const chatRoom = `library:chat:${id}`;
  const libraryUrl = (room) =>
    `${wsBase}/library?ticket=${encodeURIComponent(ticketFor(room))}`;
  const httpLibrary = (ticket) =>
    fetch(`${base}/library?ticket=${encodeURIComponent(ticket)}`);
  const publish = async (messages, secret = TICKET) => {
    const body = JSON.stringify({ messages });
    const ts = String(Date.now());
    const r = await fetch(`${base}/publish`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-realtime-timestamp': ts,
        'x-realtime-signature': hmac(secret, `publish.${ts}.${body}`),
      },
      body,
    });
    return { status: r.status, body: await r.text() };
  };
  const pong = async (c) => {
    c.inbox.length = 0;
    c.ws.send('ping');
    await c.next((m) => m === 'pong');
  };

  try {
    const none = await fetch(`${base}/library`);
    check(
      none.status === 401,
      'Library : sans ticket, refus',
      String(none.status)
    );
    const forged = await httpLibrary(
      `${ticketFor(peerRoom).slice(0, -8)}00000000`
    );
    check(
      forged.status === 401,
      'Library : ticket forgé, refus',
      String(forged.status)
    );
    const otherFamily = await httpLibrary(ticketFor('demandes:team:ci'));
    check(
      otherFamily.status === 401,
      'Library : ticket d’un autre salon, refus',
      String(otherFamily.status)
    );
    const valid = await httpLibrary(ticketFor(peerRoom));
    check(
      valid.status === 426,
      'Library : ticket valide sans WebSocket, 426',
      String(valid.status)
    );
    const named = await fetch(
      `${base}/rooms/${peerRoom}?ticket=${encodeURIComponent(ticketFor(peerRoom))}`
    );
    check(
      named.status === 404,
      'Library : pas de salon nommé dans l’adresse',
      String(named.status)
    );
    const unsigned = await fetch(`${base}/publish`, {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    });
    check(
      unsigned.status === 401,
      'publication non signée refusée',
      String(unsigned.status)
    );
    const wrongKey = await publish(
      [{ room: chatRoom, event: 'kicked', payload: {} }],
      NOTIFY
    );
    check(
      wrongKey.status === 401,
      'publication signée par un autre secret refusée',
      String(wrongKey.status)
    );
    const notLibrary = await publish([
      { room: 'demandes:team:ci', event: 'kicked', payload: {} },
    ]);
    check(
      notLibrary.status === 400,
      'publication hors Library refusée',
      String(notLibrary.status)
    );

    const a = await open(libraryUrl(peerRoom));
    const b = await open(libraryUrl(peerRoom));
    const empty = json(await a.next((m) => json(m)?.type === 'presence_state'));
    check(empty?.entries?.length === 0, 'Library : salon vide à l’arrivée');

    a.ws.send(
      JSON.stringify({
        type: 'track',
        key: 'ci-a',
        state: { userId: 'ci-a', gx: 3 },
      })
    );
    const joined = json(await b.next((m) => json(m)?.type === 'presence_join'));
    check(
      joined?.key === 'ci-a' && joined?.state?.gx === 3,
      'Library : présence reçue par l’autre écran'
    );

    a.ws.send(
      JSON.stringify({ type: 'broadcast', event: 'move', payload: { gx: 4 } })
    );
    const moved = json(await b.next((m) => json(m)?.event === 'move'));
    check(moved?.payload?.gx === 4, 'Library : déplacement relayé');
    await pong(a);
    check(
      !a.inbox.some((m) => json(m)?.type === 'broadcast'),
      'Library : pas d’écho à l’émetteur'
    );

    const c = await open(libraryUrl(peerRoom));
    const snapshot = json(
      await c.next((m) => json(m)?.type === 'presence_state')
    );
    check(
      snapshot?.entries?.some((e) => e.key === 'ci-a' && e.state?.gx === 3),
      'Library : la nouvelle venue reçoit la présence en cours'
    );

    b.inbox.length = 0;
    a.ws.close();
    const after = json(await b.next((m) => json(m)?.type === 'presence_state'));
    check(
      after?.entries?.length === 0,
      'Library : un départ retire la présence'
    );
    b.ws.close();
    c.ws.close();

    const reader = await open(libraryUrl(chatRoom));
    const writer = await open(libraryUrl(chatRoom));
    writer.ws.send(
      JSON.stringify({
        type: 'broadcast',
        event: 'kicked',
        payload: { userId: 'x' },
      })
    );
    await pong(writer);
    await pong(reader);
    check(
      !reader.inbox.some((m) => json(m)?.type === 'broadcast'),
      'Library : un salon du serveur ne s’écrit pas'
    );

    const sent = await publish([
      { room: chatRoom, event: 'kicked', payload: { userId: 'ci' } },
    ]);
    check(
      sent.status === 200 && json(sent.body)?.delivered === 2,
      'Library : publication signée acceptée',
      sent.body
    );
    const kicked = json(await reader.next((m) => json(m)?.event === 'kicked'));
    check(
      kicked?.payload?.userId === 'ci',
      'Library : événement du serveur reçu'
    );
    reader.ws.close();
    writer.ws.close();
  } catch (e) {
    check(false, 'salons de la Library', e.message);
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
