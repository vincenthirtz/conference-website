// tests/unit/webPushScrimPlanning.test.ts
//
// Couvre le wiring notification des 3 events scrim.planning.* :
//   - whitelists (WEB_PUSH / EMAIL / PLAYER_PUSH).
//   - renderWebPushPayload / renderEmailPayload (title/heading + body + url).
//   - playerUrlForEvent → /player/scrim-planning/<planningId> (guard null).
//   - loadCaptainManagerUserIdsForTeams : capitaine ∪ managers, dédup, tenant.
//
// Les fonctions de rendu sont pures (pas de supabase). L'audience helper lit le
// store supabase in-memory (cf. __helpers__/supabaseMock.ts).

import { describe, it, expect, beforeEach } from 'vitest';

import { store, resetSupabaseMock } from './__helpers__/supabaseMock';
import {
  WEB_PUSH_EVENT_TYPES,
  EMAIL_EVENT_TYPES,
  PLAYER_PUSH_EVENT_TYPES,
  renderWebPushPayload,
  renderEmailPayload,
  playerUrlForEvent,
} from '@/utils/webPushEvents';
import { loadCaptainManagerUserIdsForTeams } from '@/utils/notificationAudience';

const PLANNING_ID = 'plan-123';
const TENANT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

const SCRIM_EVENTS = [
  'scrim.planning.opened',
  'scrim.planning.reminder',
  'scrim.planning.validated',
] as const;

// Forme envelope { data: {...} } telle qu'émise par emitScrimPlanningEvent.
function envelope(extra: Record<string, unknown> = {}) {
  return {
    data: {
      planningId: PLANNING_ID,
      title: 'Bo3 amical',
      game: 'overwatch',
      status: 'open',
      team1: { id: 't1', name: 'Alpha', short_name: 'ALP' },
      team2: { id: 't2', name: 'Bravo', short_name: 'BRV' },
      horizonStart: '2026-07-10',
      horizonDays: 7,
      validatedSlot: null,
      scrimId: null,
      ...extra,
    },
  };
}

describe('scrim.planning.* whitelists', () => {
  it('les 3 events sont dans WEB_PUSH_EVENT_TYPES', () => {
    for (const e of SCRIM_EVENTS) {
      expect(WEB_PUSH_EVENT_TYPES).toContain(e);
    }
  });

  it('les 3 events sont dans EMAIL_EVENT_TYPES', () => {
    for (const e of SCRIM_EVENTS) {
      expect(EMAIL_EVENT_TYPES).toContain(e);
    }
  });

  it('les 3 events sont dans PLAYER_PUSH_EVENT_TYPES', () => {
    for (const e of SCRIM_EVENTS) {
      expect(PLAYER_PUSH_EVENT_TYPES).toContain(e);
    }
  });
});

describe('renderWebPushPayload — scrim.planning.*', () => {
  it('rend title/body/url pour chaque event avec le label des 2 équipes', () => {
    const expectations: Record<string, { title: string; body: string }> = {
      'scrim.planning.opened': {
        title: '🗓️ Grille de dispo ouverte',
        body: 'Alpha vs Bravo — indique tes créneaux.',
      },
      'scrim.planning.reminder': {
        title: '⏰ Dispos scrim à remplir',
        body: 'Alpha vs Bravo — il manque encore tes créneaux.',
      },
      'scrim.planning.validated': {
        title: '✅ Scrim planifié',
        body: 'Alpha vs Bravo — créneau validé.',
      },
    };
    for (const e of SCRIM_EVENTS) {
      const out = renderWebPushPayload(e, envelope());
      expect(out.title).toBe(expectations[e].title);
      expect(out.body).toBe(expectations[e].body);
      expect(out.url).toBe(`/player/scrim-planning/${PLANNING_ID}`);
    }
  });

  it('tombe sur /player si planningId absent (guard)', () => {
    const out = renderWebPushPayload(
      'scrim.planning.opened',
      envelope({ planningId: null })
    );
    expect(out.url).toBe('/player');
  });
});

describe('renderEmailPayload — scrim.planning.*', () => {
  it('rend heading/body/url pour chaque event', () => {
    for (const e of SCRIM_EVENTS) {
      const out = renderEmailPayload(e, envelope());
      expect(out.heading.length).toBeGreaterThan(0);
      expect(out.body).toContain('Alpha');
      expect(out.body).toContain('Bravo');
      expect(out.url).toBe(`/player/scrim-planning/${PLANNING_ID}`);
    }
  });
});

describe('playerUrlForEvent — scrim.planning.*', () => {
  it('renvoie /player/scrim-planning/<id>', () => {
    for (const e of SCRIM_EVENTS) {
      expect(playerUrlForEvent(e, envelope())).toBe(
        `/player/scrim-planning/${PLANNING_ID}`
      );
    }
  });

  it('renvoie null sans planningId', () => {
    expect(
      playerUrlForEvent('scrim.planning.opened', envelope({ planningId: null }))
    ).toBeNull();
  });
});

describe('loadCaptainManagerUserIdsForTeams', () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it('retourne capitaines ∪ managers des équipes, dédupliqués', async () => {
    store.teams = [
      { id: 't1', captain_id: 'cap-1', tenant_id: TENANT_A },
      { id: 't2', captain_id: 'cap-2', tenant_id: TENANT_A },
    ] as any;
    store.team_members = [
      { team_id: 't1', user_id: 'mgr-1', role: 'manager', tenant_id: TENANT_A },
      // player n'est PAS privilégié → exclu.
      { team_id: 't1', user_id: 'player-1', role: 'player', tenant_id: TENANT_A },
      // manager déjà capitaine ailleurs → dédup.
      { team_id: 't2', user_id: 'cap-1', role: 'manager', tenant_id: TENANT_A },
    ] as any;

    const ids = await loadCaptainManagerUserIdsForTeams(['t1', 't2'], TENANT_A);
    expect(ids.sort()).toEqual(['cap-1', 'cap-2', 'mgr-1'].sort());
  });

  it('scope tenant : ignore les rows d’un autre tenant', async () => {
    store.teams = [
      { id: 't1', captain_id: 'cap-1', tenant_id: TENANT_A },
      { id: 't2', captain_id: 'cap-b', tenant_id: TENANT_B },
    ] as any;
    store.team_members = [] as any;

    const ids = await loadCaptainManagerUserIdsForTeams(['t1', 't2'], TENANT_A);
    expect(ids).toEqual(['cap-1']);
  });

  it('retourne [] si aucune team id fournie', async () => {
    const ids = await loadCaptainManagerUserIdsForTeams([], TENANT_A);
    expect(ids).toEqual([]);
  });
});
