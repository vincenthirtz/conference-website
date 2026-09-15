// Unit tests — `insertTeamMember` ne pose `accepted_at` que sur demande.
//
// La colonne distingue l'ACCORD de la personne (création de son équipe, demande
// approuvée, invitation acceptée) d'un ajout par un tiers. Le défaut doit rester
// « pas d'accord » : un appelant qui oublie l'option ne rattache personne.

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { insertTeamMember } from '../../utils/teams/addMember';

const TENANT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TEAM = '550e8400-e29b-41d4-a716-4466554400a1';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

beforeEach(() => {
  resetSupabaseMock();
  store.team_members = [] as any;
  store.tournament_teams = [] as any;
});

const row = (userId: string) =>
  (store.team_members as any[]).find((m) => m.user_id === userId);

describe('insertTeamMember — accepted_at', () => {
  it('sans option : pas d’accord posé (ajout par un tiers)', async () => {
    const r = await insertTeamMember({
      tenantId: TENANT,
      teamId: TEAM,
      userId: USER_A,
      role: 'player',
    });
    expect(r.ok).toBe(true);
    expect(row(USER_A).accepted_at ?? null).toBeNull();
  });

  it('avec acceptedAt : l’accord est enregistré', async () => {
    const at = '2026-09-15T10:00:00.000Z';
    const r = await insertTeamMember({
      tenantId: TENANT,
      teamId: TEAM,
      userId: USER_B,
      role: 'captain',
      acceptedAt: at,
    });
    expect(r.ok).toBe(true);
    expect(row(USER_B).accepted_at).toBe(at);
  });
});
