// Règles pures du temps réel côté écrans (utils/realtime/rooms.ts,
// docs/REALTIME-DO.md étape 3).
import { describe, expect, it } from 'vitest';
import {
  changePayload,
  parseRoomMessage,
  pickRealtimeBackend,
  presenceStateFor,
  presenceUsersFrom,
  roomFor,
  ticketPathFor,
} from '@/utils/realtime/rooms';
import { isPublicRoom, isValidRoom } from '../../realtime/protocol';

const ID = '3f2a9c1e-0000-4000-8000-000000000001';

describe('pickRealtimeBackend', () => {
  it('Supabase par défaut, Cloudflare avec l’interrupteur', () => {
    expect(pickRealtimeBackend(undefined, '')).toBe('supabase');
    expect(pickRealtimeBackend('', undefined)).toBe('supabase');
    expect(pickRealtimeBackend('autre', '')).toBe('supabase');
    expect(pickRealtimeBackend('cloudflare', '')).toBe('cloudflare');
  });

  it('l’adresse de la page l’emporte, dans les deux sens', () => {
    expect(pickRealtimeBackend(undefined, '?realtime=cloudflare')).toBe(
      'cloudflare'
    );
    expect(pickRealtimeBackend('cloudflare', '?a=1&realtime=supabase')).toBe(
      'supabase'
    );
    expect(pickRealtimeBackend('cloudflare', '?realtime=x')).toBe('cloudflare');
  });
});

describe('roomFor', () => {
  it('nomme les salons comme les déclencheurs de la base', () => {
    expect(roomFor('matches', `tournament_id=eq.${ID}`)).toBe(
      `matches:tournament:${ID}`
    );
    expect(roomFor('match_drafts', `id=eq.${ID}`)).toBe(`draft:${ID}`);
    expect(roomFor('match_draft_steps', `draft_id=eq.${ID}`)).toBe(
      `draft:${ID}`
    );
    expect(roomFor('demandes', `team_id=eq.${ID}`)).toBe(`demandes:team:${ID}`);
    expect(roomFor('caster_scenes')).toBe('caster:scenes');
    expect(roomFor('caster_scenes', `id=eq.${ID}`)).toBe(`caster:scene:${ID}`);
    expect(roomFor('caster_themes')).toBe('caster:themes');
  });

  it('sans salon prévu : null (l’écoute reste sur Supabase)', () => {
    expect(roomFor('matches')).toBeNull();
    expect(roomFor('matches', `id=eq.${ID}`)).toBeNull();
    expect(roomFor('demandes')).toBeNull();
    expect(roomFor('caster_themes', `id=eq.${ID}`)).toBeNull();
    expect(roomFor('tasks', `id=eq.${ID}`)).toBeNull();
    expect(roomFor('demandes', 'team_id=in.(a,b)')).toBeNull();
    expect(roomFor('demandes', 'team_id=eq.a b')).toBeNull();
  });

  it('chaque salon produit est valide pour le Worker', () => {
    for (const r of [
      roomFor('matches', `tournament_id=eq.${ID}`),
      roomFor('match_drafts', `id=eq.${ID}`),
      roomFor('demandes', `team_id=eq.${ID}`),
      roomFor('caster_scenes'),
      roomFor('caster_scenes', `id=eq.${ID}`),
      roomFor('caster_themes'),
    ]) {
      expect(r && isValidRoom(r), String(r)).toBe(true);
    }
  });
});

describe('ticketPathFor', () => {
  it('route de l’API pour un salon privé, rien pour un public', () => {
    expect(ticketPathFor(`demandes:team:${ID}`)).toBe(
      '/api/player/realtime/ticket'
    );
    expect(ticketPathFor(`matches:tournament:${ID}`)).toBe(
      '/api/admin/realtime/ticket'
    );
    expect(ticketPathFor('caster:presence')).toBe('/api/admin/realtime/ticket');
    for (const r of [
      `draft:${ID}`,
      'caster:scenes',
      `caster:scene:${ID}`,
      'caster:themes',
    ]) {
      expect(ticketPathFor(r), r).toBeNull();
      // Même verdict que le Worker : public ici = public là-bas.
      expect(isPublicRoom(r), r).toBe(true);
    }
  });
});

describe('parseRoomMessage', () => {
  it('lit un changement et une présence', () => {
    expect(
      parseRoomMessage(
        JSON.stringify({
          type: 'change',
          room: `draft:${ID}`,
          table: 'match_drafts',
          op: 'UPDATE',
          id: ID,
          at: 1,
        })
      )
    ).toEqual({
      type: 'change',
      table: 'match_drafts',
      op: 'UPDATE',
      id: ID,
      at: 1,
    });
    expect(
      parseRoomMessage(
        JSON.stringify({
          type: 'presence',
          users: [{ user: 's-1', state: { displayName: 'Ana' } }, 'x'],
        })
      )
    ).toEqual({
      type: 'presence',
      users: [{ user: 's-1', state: { displayName: 'Ana' } }],
    });
  });

  it('ignore pong, JSON invalide et messages inconnus', () => {
    expect(parseRoomMessage('pong')).toBeNull();
    expect(parseRoomMessage('{')).toBeNull();
    expect(
      parseRoomMessage(JSON.stringify({ type: 'change', op: 'X' }))
    ).toBeNull();
    expect(parseRoomMessage(JSON.stringify({ type: 'autre' }))).toBeNull();
    expect(parseRoomMessage(42)).toBeNull();
  });
});

describe('changePayload', () => {
  it('forme Supabase, sans aucune donnée de ligne', () => {
    const p = changePayload({
      type: 'change',
      table: 'caster_scenes',
      op: 'UPDATE',
      id: ID,
      at: Date.parse('2026-10-29T12:00:00Z'),
    });
    expect(p).toMatchObject({
      schema: 'public',
      table: 'caster_scenes',
      eventType: 'UPDATE',
      commit_timestamp: '2026-10-29T12:00:00.000Z',
      new: {},
      old: {},
    });
  });
});

describe('présence', () => {
  it('état envoyé : plat, court, sans staffId ni valeur vide', () => {
    expect(
      presenceStateFor({
        staffId: 'pirate',
        displayName: 'Ana',
        role: 'caster',
        activeScene: null,
        activeField: '',
        joinedAt: '2026-10-29T12:00:00.000Z',
        long: 'x'.repeat(150),
        'mauvaise clé': 'x',
        objet: { a: 1 },
      })
    ).toEqual({
      displayName: 'Ana',
      role: 'caster',
      joinedAt: '2026-10-29T12:00:00.000Z',
      long: 'x'.repeat(100),
    });
  });

  it('liste du bandeau : identité du ticket, une entrée par caster', () => {
    const users = presenceUsersFrom([
      {
        user: 's-2',
        state: { displayName: 'Bea', joinedAt: '2026-10-29T12:01:00Z' },
      },
      {
        user: 's-1',
        state: {
          displayName: 'Ana',
          joinedAt: '2026-10-29T12:00:00Z',
          staffId: 'pirate',
        },
      },
      { user: 's-1', state: { displayName: 'Ana (2e fenêtre)' } },
      { user: null, state: { displayName: 'anonyme' } },
    ]);
    expect(users.map((u) => [u.staffId, u.displayName])).toEqual([
      ['s-1', 'Ana'],
      ['s-2', 'Bea'],
    ]);
  });
});
