// Règles du Worker temps réel (realtime/protocol.ts, docs/REALTIME-DO.md).
import { describe, expect, it } from 'vitest';
import {
  allowsPresence,
  changeMessage,
  hmacHex,
  isPublicRoom,
  isValidRoom,
  NOTIFY_MAX_SKEW_MS,
  parseNotifyBody,
  parsePresence,
  signTicket,
  verifyNotify,
  verifyTicket,
} from '../../realtime/protocol';

const SECRET = 'secret-de-test';
const NOW = Date.parse('2026-10-29T12:00:00Z');

describe('salons', () => {
  it('accepte les noms prévus', () => {
    for (const r of [
      'matches:tournament:3f2a9c1e-0000-4000-8000-000000000001',
      'draft:abc_123',
      'demandes:team:t-1',
      'caster:scenes',
      'caster:presence',
      'test:ci-42',
    ]) {
      expect(isValidRoom(r), r).toBe(true);
    }
  });

  it('refuse le reste', () => {
    for (const r of [
      '',
      'Matches:x',
      'a:b:c:d:e',
      'draft:',
      'draft:a b',
      'draft:../x',
      'draft:a/b',
      `draft:${'x'.repeat(65)}`,
    ]) {
      expect(isValidRoom(r), r).toBe(false);
    }
  });

  it('publics : scène d’overlay, draft, contrôles ; le reste est privé', () => {
    expect(isPublicRoom('caster:scene:abc')).toBe(true);
    expect(isPublicRoom('draft:abc')).toBe(true);
    expect(isPublicRoom('test:ci')).toBe(true);
    // Lisibles sans compte dans la base : l'overlay OBS suit les thèmes.
    expect(isPublicRoom('caster:scenes')).toBe(true);
    expect(isPublicRoom('caster:themes')).toBe(true);
    expect(isPublicRoom('caster:themes:x')).toBe(false);
    expect(isPublicRoom('caster:presence')).toBe(false);
    expect(isPublicRoom('demandes:team:t-1')).toBe(false);
    expect(isPublicRoom('matches:tournament:x')).toBe(false);
  });

  it('présence : salon des casters et contrôles seulement', () => {
    expect(allowsPresence('caster:presence')).toBe(true);
    expect(allowsPresence('test:ci')).toBe(true);
    expect(allowsPresence('draft:abc')).toBe(false);
  });
});

describe('notifications signées', () => {
  const body = JSON.stringify({
    room: 'draft:abc',
    table: 'match_drafts',
    op: 'UPDATE',
    id: 'abc',
  });
  const sign = async (ts: number, b = body) => hmacHex(SECRET, `${ts}.${b}`);

  it('acceptée avec la bonne signature et un horodatage récent', async () => {
    const signature = await sign(NOW);
    expect(
      await verifyNotify({
        secret: SECRET,
        body,
        timestamp: String(NOW),
        signature,
        now: NOW + 1000,
      })
    ).toBe(true);
  });

  // Vecteur calculé par Postgres (jsonb_build_object(…)::text, pgcrypto
  // hmac), comme le fait public.realtime_notify — conference-api
  // database/migrations/add_realtime_notify_triggers.sql. Même littéral des
  // deux côtés : un changement de format d'un seul côté casse ce test.
  it('acceptée telle que la base la signe (vecteur Postgres)', async () => {
    const pgBody =
      '{"id": "9b1c0d2e-0000-4000-8000-00000000000a", "op": "UPDATE", "room": "matches:tournament:3f2a9c1e-0000-4000-8000-000000000001", "table": "matches"}';
    const pgTs = '1761739200000';
    expect(
      await verifyNotify({
        secret: SECRET,
        body: pgBody,
        timestamp: pgTs,
        signature:
          '4135d66329df164ce6c441060e89e1bea21a177b19ffa94d8d93e2fb59b46212',
        now: Number(pgTs) + 1000,
      })
    ).toBe(true);
    expect(parseNotifyBody(pgBody)).toEqual({
      ok: true,
      room: 'matches:tournament:3f2a9c1e-0000-4000-8000-000000000001',
      event: {
        table: 'matches',
        op: 'UPDATE',
        id: '9b1c0d2e-0000-4000-8000-00000000000a',
      },
    });
  });

  it('refusée : corps modifié, mauvais secret, trop vieille, en-têtes absents', async () => {
    const signature = await sign(NOW);
    const ts = String(NOW);
    expect(
      await verifyNotify({
        secret: SECRET,
        body: `${body} `,
        timestamp: ts,
        signature,
        now: NOW,
      })
    ).toBe(false);
    expect(
      await verifyNotify({
        secret: 'autre',
        body,
        timestamp: ts,
        signature,
        now: NOW,
      })
    ).toBe(false);
    expect(
      await verifyNotify({
        secret: SECRET,
        body,
        timestamp: ts,
        signature,
        now: NOW + NOTIFY_MAX_SKEW_MS + 1,
      })
    ).toBe(false);
    expect(
      await verifyNotify({
        secret: SECRET,
        body,
        timestamp: null,
        signature,
        now: NOW,
      })
    ).toBe(false);
    expect(
      await verifyNotify({
        secret: SECRET,
        body,
        timestamp: ts,
        signature: 'zz',
        now: NOW,
      })
    ).toBe(false);
    expect(
      await verifyNotify({
        secret: '',
        body,
        timestamp: ts,
        signature,
        now: NOW,
      })
    ).toBe(false);
  });

  it('corps : salon, table, opération, id facultatif', () => {
    expect(parseNotifyBody(body)).toEqual({
      ok: true,
      room: 'draft:abc',
      event: { table: 'match_drafts', op: 'UPDATE', id: 'abc' },
    });
    expect(
      parseNotifyBody(
        JSON.stringify({
          room: 'caster:scenes',
          table: 'caster_scenes',
          op: 'DELETE',
        })
      )
    ).toEqual({
      ok: true,
      room: 'caster:scenes',
      event: { table: 'caster_scenes', op: 'DELETE', id: null },
    });
    expect(parseNotifyBody('pas du json')).toEqual({
      ok: false,
      error: 'json',
    });
    expect(
      parseNotifyBody(JSON.stringify({ room: 'x y', table: 't', op: 'UPDATE' }))
    ).toEqual({ ok: false, error: 'room' });
    expect(
      parseNotifyBody(
        JSON.stringify({ room: 'draft:a', table: 'T!', op: 'UPDATE' })
      )
    ).toEqual({ ok: false, error: 'table' });
    expect(
      parseNotifyBody(
        JSON.stringify({ room: 'draft:a', table: 't', op: 'TRUNCATE' })
      )
    ).toEqual({ ok: false, error: 'op' });
    expect(
      parseNotifyBody(
        JSON.stringify({ room: 'draft:a', table: 't', op: 'UPDATE', id: 'a b' })
      )
    ).toEqual({ ok: false, error: 'id' });
  });

  it('message aux écrans : aucune donnée de ligne', () => {
    const msg = JSON.parse(
      changeMessage(
        'draft:abc',
        { table: 'match_drafts', op: 'UPDATE', id: 'abc' },
        NOW
      )
    );
    expect(msg).toEqual({
      type: 'change',
      room: 'draft:abc',
      table: 'match_drafts',
      op: 'UPDATE',
      id: 'abc',
      at: NOW,
    });
  });
});

describe('tickets des salons privés', () => {
  const exp = NOW / 1000 + 300;

  it('valide pour son salon, avant expiration, avec l’utilisateur', async () => {
    const ticket = await signTicket({
      secret: SECRET,
      room: 'demandes:team:t-1',
      exp,
      user: 'u-1',
    });
    expect(
      await verifyTicket({
        secret: SECRET,
        ticket,
        room: 'demandes:team:t-1',
        now: NOW,
      })
    ).toEqual({ ok: true, user: 'u-1' });
  });

  it('refusé : autre salon, expiré, falsifié, autre secret', async () => {
    const ticket = await signTicket({
      secret: SECRET,
      room: 'demandes:team:t-1',
      exp,
    });
    expect(
      await verifyTicket({
        secret: SECRET,
        ticket,
        room: 'demandes:team:t-2',
        now: NOW,
      })
    ).toEqual({ ok: false });
    expect(
      await verifyTicket({
        secret: SECRET,
        ticket,
        room: 'demandes:team:t-1',
        now: exp * 1000,
      })
    ).toEqual({ ok: false });
    expect(
      await verifyTicket({
        secret: 'autre',
        ticket,
        room: 'demandes:team:t-1',
        now: NOW,
      })
    ).toEqual({ ok: false });
    const [payload, sig] = ticket.split('.');
    const forged = `${payload.slice(0, -2)}AA.${sig}`;
    expect(
      await verifyTicket({
        secret: SECRET,
        ticket: forged,
        room: 'demandes:team:t-1',
        now: NOW,
      })
    ).toEqual({ ok: false });
    expect(
      await verifyTicket({
        secret: SECRET,
        ticket: 'n-importe-quoi',
        room: 'demandes:team:t-1',
        now: NOW,
      })
    ).toEqual({ ok: false });
  });

  it('sans utilisateur : user null', async () => {
    const ticket = await signTicket({
      secret: SECRET,
      room: 'caster:scenes',
      exp,
    });
    expect(
      await verifyTicket({
        secret: SECRET,
        ticket,
        room: 'caster:scenes',
        now: NOW,
      })
    ).toEqual({ ok: true, user: null });
  });
});

describe('présence', () => {
  it('objet plat et court', () => {
    expect(
      parsePresence(
        JSON.stringify({
          type: 'presence',
          state: { name: 'Aru', live: true, n: 2 },
        })
      )
    ).toEqual({
      state: { name: 'Aru', live: true, n: 2 },
    });
  });

  it('refuse le reste', () => {
    expect(parsePresence('ping')).toBeNull();
    expect(
      parsePresence(JSON.stringify({ type: 'autre', state: {} }))
    ).toBeNull();
    expect(
      parsePresence(
        JSON.stringify({ type: 'presence', state: { a: { b: 1 } } })
      )
    ).toBeNull();
    expect(
      parsePresence(
        JSON.stringify({ type: 'presence', state: { a: 'x'.repeat(101) } })
      )
    ).toBeNull();
    const many = Object.fromEntries(
      Array.from({ length: 11 }, (_, i) => [`k${i}`, i])
    );
    expect(
      parsePresence(JSON.stringify({ type: 'presence', state: many }))
    ).toBeNull();
    expect(
      parsePresence(JSON.stringify({ type: 'presence', state: { 'a-b': 1 } }))
    ).toBeNull();
  });
});
