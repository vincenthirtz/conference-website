// Planning du staff — logique pure : « Mes dispos » (qui écrit quel créneau),
// définition partagée d'un soir de match couvert, et ajout du signal au
// résumé du badge d'alertes.

import { describe, it, expect } from 'vitest';
import {
  assertCanWriteFor,
  canWriteFor,
  samePerson,
  selfNameOf,
} from '../../features/admin/staff-planning/access';
import {
  staffedDays,
  uncoveredNights,
} from '../../features/admin/staff-planning/coverage';
import { monthStats } from '../../features/admin/staff-planning/view';
import { withStaffUncoveredNights } from '../../features/admin/dashboard/service';
import { summarizeAlerts } from '../../utils/dashboard/buildTournamentDashboard';
import { AdminError } from '../../utils/admin/errors';

describe('« Mes dispos » — access', () => {
  const me = { manageAll: false, selfName: 'Pomme' };

  it('même personne : casse et espaces de bord ignorés', () => {
    expect(samePerson('Pomme', ' pomme ')).toBe(true);
    expect(samePerson('Pomme', 'Pommes')).toBe(false);
  });

  it('nom affiché vide = pas de pseudo', () => {
    expect(selfNameOf('  ')).toBeNull();
    expect(selfNameOf(null)).toBeNull();
    expect(selfNameOf(' Iguel ')).toBe('Iguel');
  });

  it('manage_staff écrit pour tout le monde', () => {
    const all = { manageAll: true, selfName: null };
    expect(canWriteFor(all, 'Kotarah')).toBe(true);
    expect(assertCanWriteFor(all, 'Kotarah')).toBe('Kotarah');
  });

  it('un staff écrit pour lui seul, avec la graphie du planning', () => {
    expect(canWriteFor(me, 'POMME')).toBe(true);
    expect(canWriteFor(me, 'Kotarah')).toBe(false);
    expect(assertCanWriteFor(me, 'pomme')).toBe('pomme');
    expect(() => assertCanWriteFor(me, 'Kotarah')).toThrow(AdminError);
  });

  it('403 sans nom affiché, et `mfa_required` pour un gestionnaire sans aal2', () => {
    const noName = { manageAll: false, selfName: null };
    expect(() => assertCanWriteFor(noName, 'Pomme')).toThrow(/nom affiché/);
    try {
      assertCanWriteFor({ ...me, mfaMissing: true }, 'Kotarah');
      expect.unreachable();
    } catch (err) {
      expect((err as AdminError).status).toBe(403);
      expect((err as AdminError).reason).toBe('mfa_required');
    }
  });
});

describe('couverture des soirs de match — définition partagée', () => {
  const slots = [
    { slot_date: '2026-10-07', person_name: 'Pomme' },
    { slot_date: '2026-10-07', person_name: 'Iguel' },
    { slot_date: '2026-10-09', person_name: 'Iguel' },
  ];
  const nights = [
    { date: '2026-10-07', count: 2, first: '19:00' },
    { date: '2026-10-08', count: 1, first: '20:30' },
    { date: '2026-10-14', count: 1, first: '19:00' },
  ];

  it('un soir est couvert dès qu’un créneau est posé ce jour-là', () => {
    expect([...staffedDays(slots)].sort()).toEqual([
      '2026-10-07',
      '2026-10-09',
    ]);
    expect(uncoveredNights(nights, slots).map((n) => n.date)).toEqual([
      '2026-10-08',
      '2026-10-14',
    ]);
  });

  it('l’écran (monthStats) applique la même définition', () => {
    const stats = monthStats(slots as any, nights, '2026-10');
    expect(stats.uncovered).toEqual(
      uncoveredNights(nights, slots).map((n) => n.date)
    );
    expect(stats.coveredNights).toBe(1);
  });
});

describe('badge d’alertes — signal planning', () => {
  it('ajoute les soirs sans staff au total et au détail', () => {
    const base = summarizeAlerts(null);
    const out = withStaffUncoveredNights(base, 2);
    expect(out.total).toBe(base.total + 2);
    expect(out.breakdown.staffUncoveredNights).toBe(2);
    expect(out.breakdown.disputes).toBe(0);
  });

  it('zéro soir : total inchangé', () => {
    const base = summarizeAlerts(null);
    expect(withStaffUncoveredNights(base, 0).total).toBe(base.total);
  });
});
