import { describe, it, expect } from 'vitest';
import { VETO_FLOWS } from '@/types/veto';
import type { VetoFlowStep, VetoAction } from '@/types/veto';

describe('VETO_FLOWS', () => {
  it('defines flows for bo1, bo3, and bo5', () => {
    expect(VETO_FLOWS).toHaveProperty('bo1');
    expect(VETO_FLOWS).toHaveProperty('bo3');
    expect(VETO_FLOWS).toHaveProperty('bo5');
  });

  describe('bo1 flow', () => {
    const flow = VETO_FLOWS['bo1'];

    it('has 7 steps total', () => {
      expect(flow.length).toBe(7);
    });

    it('ends with a decider', () => {
      expect(flow[flow.length - 1].action).toBe('decider');
      expect(flow[flow.length - 1].side).toBeNull();
    });

    it('has 6 bans (3 per team) before the decider', () => {
      const bans = flow.filter((s) => s.action === 'ban');
      expect(bans.length).toBe(6);

      const team1Bans = bans.filter((s) => s.side === 'team1');
      const team2Bans = bans.filter((s) => s.side === 'team2');
      expect(team1Bans.length).toBe(3);
      expect(team2Bans.length).toBe(3);
    });

    it('has no picks', () => {
      const picks = flow.filter((s) => s.action === 'pick');
      expect(picks.length).toBe(0);
    });

    it('produces exactly 1 map to play (decider)', () => {
      const playable = flow.filter(
        (s) => s.action === 'pick' || s.action === 'decider'
      );
      expect(playable.length).toBe(1);
    });
  });

  describe('bo3 flow', () => {
    const flow = VETO_FLOWS['bo3'];

    it('has 7 steps total', () => {
      expect(flow.length).toBe(7);
    });

    it('ends with a decider', () => {
      expect(flow[flow.length - 1].action).toBe('decider');
    });

    it('has 4 bans and 2 picks', () => {
      const bans = flow.filter((s) => s.action === 'ban');
      const picks = flow.filter((s) => s.action === 'pick');
      expect(bans.length).toBe(4);
      expect(picks.length).toBe(2);
    });

    it('produces exactly 3 maps to play (2 picks + 1 decider)', () => {
      const playable = flow.filter(
        (s) => s.action === 'pick' || s.action === 'decider'
      );
      expect(playable.length).toBe(3);
    });

    it('alternates teams for bans and picks', () => {
      // Step 0: team1 ban, Step 1: team2 ban
      expect(flow[0]).toEqual({ action: 'ban', side: 'team1' });
      expect(flow[1]).toEqual({ action: 'ban', side: 'team2' });
      // Step 2: team1 pick, Step 3: team2 pick
      expect(flow[2]).toEqual({ action: 'pick', side: 'team1' });
      expect(flow[3]).toEqual({ action: 'pick', side: 'team2' });
      // Step 4: team1 ban, Step 5: team2 ban
      expect(flow[4]).toEqual({ action: 'ban', side: 'team1' });
      expect(flow[5]).toEqual({ action: 'ban', side: 'team2' });
    });
  });

  describe('bo5 flow', () => {
    const flow = VETO_FLOWS['bo5'];

    it('has 7 steps total', () => {
      expect(flow.length).toBe(7);
    });

    it('has 2 bans and 4 picks', () => {
      const bans = flow.filter((s) => s.action === 'ban');
      const picks = flow.filter((s) => s.action === 'pick');
      expect(bans.length).toBe(2);
      expect(picks.length).toBe(4);
    });

    it('produces exactly 5 maps to play (4 picks + 1 decider)', () => {
      const playable = flow.filter(
        (s) => s.action === 'pick' || s.action === 'decider'
      );
      expect(playable.length).toBe(5);
    });
  });

  describe('all flows', () => {
    it('all steps have valid actions', () => {
      const validActions: VetoAction[] = ['ban', 'pick', 'decider'];
      for (const [format, flow] of Object.entries(VETO_FLOWS)) {
        for (const step of flow) {
          expect(validActions).toContain(step.action);
        }
      }
    });

    it('all steps have valid sides', () => {
      const validSides = ['team1', 'team2', null];
      for (const [format, flow] of Object.entries(VETO_FLOWS)) {
        for (const step of flow) {
          expect(validSides).toContain(step.side);
        }
      }
    });

    it('decider steps always have null side', () => {
      for (const [format, flow] of Object.entries(VETO_FLOWS)) {
        const deciders = flow.filter((s) => s.action === 'decider');
        for (const d of deciders) {
          expect(d.side).toBeNull();
        }
      }
    });

    it('ban/pick steps always have a team side', () => {
      for (const [format, flow] of Object.entries(VETO_FLOWS)) {
        const nonDeciders = flow.filter((s) => s.action !== 'decider');
        for (const s of nonDeciders) {
          expect(s.side).not.toBeNull();
        }
      }
    });
  });
});

describe('veto step simulation', () => {
  it('bo3 veto needs exactly 7 maps in pool to complete', () => {
    const flow = VETO_FLOWS['bo3'];
    // 4 bans + 2 picks + 1 decider = 7 unique maps needed
    expect(flow.length).toBe(7);

    // Simulate: each step uses a unique map
    const pool = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const used = new Set<string>();
    const picked: string[] = [];

    for (let i = 0; i < flow.length; i++) {
      const available = pool.filter((m) => !used.has(m));
      expect(available.length).toBeGreaterThan(0);

      const chosen = available[0];
      used.add(chosen);

      if (flow[i].action === 'pick' || flow[i].action === 'decider') {
        picked.push(chosen);
      }
    }

    expect(picked.length).toBe(3); // bo3 = 3 maps to play
    expect(used.size).toBe(7); // all maps used
  });

  it('bo5 veto needs exactly 7 maps in pool to complete', () => {
    const flow = VETO_FLOWS['bo5'];
    expect(flow.length).toBe(7);

    const pool = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const used = new Set<string>();
    const picked: string[] = [];

    for (let i = 0; i < flow.length; i++) {
      const available = pool.filter((m) => !used.has(m));
      expect(available.length).toBeGreaterThan(0);

      const chosen = available[0];
      used.add(chosen);

      if (flow[i].action === 'pick' || flow[i].action === 'decider') {
        picked.push(chosen);
      }
    }

    expect(picked.length).toBe(5); // bo5 = 5 maps to play
    expect(used.size).toBe(7);
  });
});
