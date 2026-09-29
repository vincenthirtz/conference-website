// Messagerie entre capitaines et réseau — fonctions pures des modules du lot
// P15 (docs/PLAN-industrialisation-joueur.md) : identifiant de conversation
// (garde anti-injection de filtre PostgREST), regroupement de la boîte,
// mise à jour locale de l'annuaire après un suivi.

import { describe, expect, it } from 'vitest';
import {
  conversationKey,
  groupConversations,
  parseConversationId,
} from '../../features/player/messages/service';
import { applyFollowChange } from '../../features/player/network/hooks/useDiscovery';
import type { CaptainMessageRow } from '../../features/player/messages/schemas';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';

describe('identifiant de conversation', () => {
  it('déterministe, quel que soit l’ordre des équipes', () => {
    expect(conversationKey(B, A)).toBe(`${A}_${B}`);
    expect(conversationKey(A, B)).toBe(`${A}_${B}`);
  });

  it('refuse tout ce qui n’est pas deux UUID (400)', () => {
    for (const bad of [
      '',
      'invalid-id',
      `${A}`,
      `${A}_${B}_${C}`,
      `${A}_x),team_id.eq.${B}`,
      undefined,
    ]) {
      expect(() => parseConversationId(bad)).toThrow(
        'Invalid conversation ID.'
      );
    }
    expect(parseConversationId(`${A}_${B}`)).toEqual([`${A}_${B}`, A, B]);
  });
});

describe('boîte de réception', () => {
  const row = (
    over: Partial<CaptainMessageRow> & { from: string; at: string }
  ): CaptainMessageRow => ({
    id: `m-${over.at}`,
    user_id: 'u',
    team_id: over.team_id ?? A,
    comment: over.comment ?? 'hello',
    status: over.status ?? 'pending',
    created_at: over.at,
    payload: {
      from_team_id: over.from,
      from_team_name: `Team ${over.from.slice(0, 1)}`,
      target_team_name: 'Target',
      ...(over.payload ?? {}),
    },
  });

  it('regroupe par conversation, compte les non-lus ENTRANTS seulement', () => {
    const convs = groupConversations(
      [
        // Plus récents d'abord (ordre de la lecture).
        row({ from: B, team_id: A, at: '2026-09-03' }),
        row({ from: A, team_id: B, at: '2026-09-02' }),
        row({ from: B, team_id: A, at: '2026-09-01', status: 'approved' }),
        row({ from: C, team_id: A, at: '2026-08-01' }),
      ],
      A
    );
    expect(convs.map((c) => c.otherTeamId)).toEqual([B, C]);
    expect(convs[0]).toMatchObject({
      conversationId: `${A}_${B}`,
      messageCount: 3,
      unreadCount: 1,
    });
    expect(convs[0].lastMessage.created_at).toBe('2026-09-03');
  });
});

describe('annuaire : suivi local', () => {
  const page = (players: Array<{ id: string; f: boolean; n: number }>) => ({
    pageParams: [0],
    pages: [
      {
        total: players.length,
        limit: 24,
        offset: 0,
        players: players.map((p) => ({
          authUserId: p.id,
          displayName: p.id,
          avatarUrl: null,
          tagline: null,
          discordUsername: null,
          isFollowing: p.f,
          followerCount: p.n,
        })),
      },
    ],
  });

  it('« Découvrir » : compteur ajusté, la fiche reste', () => {
    const next = applyFollowChange(
      page([{ id: 'x', f: false, n: 0 }]),
      'discover',
      'x',
      true
    );
    expect(next?.pages[0].players[0]).toMatchObject({
      isFollowing: true,
      followerCount: 1,
    });
  });

  it('« Je suis » : se désabonner retire la fiche et le total', () => {
    const next = applyFollowChange(
      page([
        { id: 'x', f: true, n: 1 },
        { id: 'y', f: true, n: 4 },
      ]),
      'following',
      'x',
      false
    );
    expect(next?.pages[0].players.map((p) => p.authUserId)).toEqual(['y']);
    expect(next?.pages[0].total).toBe(1);
  });
});
