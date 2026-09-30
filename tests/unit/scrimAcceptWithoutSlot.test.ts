// Une demande de scrim SANS créneau (formulaire public : date facultative)
// doit rester acceptable : l'équipe qui accepte fixe la date. Avant, l'accept
// exigeait un créneau « parmi ceux proposés » — il n'y en avait aucun, donc la
// demande était inacceptable (e2e scrim-public).

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/utils/supabase', async () => {
  const m = await import('./__helpers__/supabaseMock');
  return { supabaseAdmin: m.supabaseAdmin, getServerClient: m.getServerClient };
});
vi.mock('@/utils/discord', () => ({ notifyScrimCounterProposal: vi.fn() }));
vi.mock('@/utils/scrimEvents', () => ({
  emitScrimEvent: vi.fn(async () => undefined),
}));
vi.mock('@/utils/botEvents', () => ({
  emitBotEvent: vi.fn(async () => undefined),
}));

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import { applyScrimRequestAction } from '@/utils/teams/scrimRequestActions';

const TENANT = 'ce69a726-773e-4d12-b5eb-d2503aa752b4';
const TEAM = '6f1c2a3b-4d5e-4f60-8a7b-1c2d3e4f5a6b';
const DEMANDE = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const actor = { userId: 'u-captain', teamId: TEAM, teamName: 'Hôtes' };

function seedPublicDemande() {
  store.demandes = [
    {
      id: DEMANDE,
      tenant_id: TENANT,
      team_id: TEAM,
      type: 'scrim',
      status: 'pending',
      source: 'public',
      user_id: null,
      comment: null,
      payload: {
        from_team_id: null,
        from_team_name: 'Visiteuses',
        preferred_date: null,
        requester_email: 'alice@example.com',
      },
    },
  ] as any;
}

beforeEach(() => {
  resetSupabaseMock();
  seedPublicDemande();
});

describe('accept d’une demande de scrim sans créneau', () => {
  it('refuse sans date, avec un message qui dit quoi faire', async () => {
    const r = await applyScrimRequestAction({
      tenantId: TENANT,
      demandeId: DEMANDE,
      action: 'approve',
      actor,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(400);
      expect(r.error).toMatch(/aucun créneau/);
    }
  });

  it('refuse une date passée', async () => {
    const r = await applyScrimRequestAction({
      tenantId: TENANT,
      demandeId: DEMANDE,
      action: 'approve',
      slot: new Date(Date.now() - 3_600_000).toISOString(),
      actor,
    });
    expect(r.ok).toBe(false);
  });

  it('accepte la date choisie par l’équipe et la fige comme créneau convenu', async () => {
    const slot = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const r = await applyScrimRequestAction({
      tenantId: TENANT,
      demandeId: DEMANDE,
      action: 'approve',
      slot,
      actor,
    });
    expect(r.ok, JSON.stringify(r)).toBe(true);
    const row = (store.demandes as any[]).find((d) => d.id === DEMANDE);
    expect(row.status).toBe('approved');
    expect(row.payload.preferred_date).toBe(slot);
    expect(row.payload.scrim_nego).toMatchObject({
      slots: [slot],
      agreed_slot: slot,
      proposed_by: TEAM,
    });
  });
});
