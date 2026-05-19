// Tests unit pour utils/demandes/stateMachine.ts (P2-A).
// Fonctions purées, pas de DB ni I/O — testable avec node:test direct
// via vitest harness.

import { describe, it, expect } from 'vitest';
import {
  validateDemandeTransition,
  validateDemandeBatchTransitions,
} from '../../utils/demandes/stateMachine';

describe('validateDemandeTransition', () => {
  it('pending → approved : OK', () => {
    const r = validateDemandeTransition('pending', 'approved');
    expect(r.ok).toBe(true);
  });

  it('pending → rejected : OK', () => {
    expect(validateDemandeTransition('pending', 'rejected').ok).toBe(true);
  });

  it('pending → cancelled : OK', () => {
    expect(validateDemandeTransition('pending', 'cancelled').ok).toBe(true);
  });

  it('approved → cancelled : refusé', () => {
    const r = validateDemandeTransition('approved', 'cancelled');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.code).toBe('INVALID_DEMANDE_TRANSITION');
    }
  });

  it('rejected → approved : refusé', () => {
    expect(validateDemandeTransition('rejected', 'approved').ok).toBe(false);
  });

  it('cancelled → approved : refusé', () => {
    expect(validateDemandeTransition('cancelled', 'approved').ok).toBe(false);
  });

  it('terminal → pending (reset admin) : OK', () => {
    expect(validateDemandeTransition('approved', 'pending').ok).toBe(true);
    expect(validateDemandeTransition('rejected', 'pending').ok).toBe(true);
    expect(validateDemandeTransition('cancelled', 'pending').ok).toBe(true);
  });

  it('même statut (idempotence) : OK', () => {
    expect(validateDemandeTransition('pending', 'pending').ok).toBe(true);
    expect(validateDemandeTransition('approved', 'approved').ok).toBe(true);
    expect(validateDemandeTransition('rejected', 'rejected').ok).toBe(true);
    expect(validateDemandeTransition('cancelled', 'cancelled').ok).toBe(true);
  });
});

describe('validateDemandeBatchTransitions', () => {
  it('batch valide : retourne []', () => {
    const items = [
      { id: 'a', fromStatus: 'pending' as const },
      { id: 'b', fromStatus: 'pending' as const },
    ];
    expect(validateDemandeBatchTransitions(items, 'approved')).toEqual([]);
  });

  it('batch mixte : retourne uniquement les invalides', () => {
    const items = [
      { id: 'ok', fromStatus: 'pending' as const },
      { id: 'bad', fromStatus: 'approved' as const },
    ];
    const invalid = validateDemandeBatchTransitions(items, 'rejected');
    expect(invalid).toHaveLength(1);
    expect(invalid[0].id).toBe('bad');
    expect(invalid[0].fromStatus).toBe('approved');
  });

  it('batch tous invalides : retourne tous', () => {
    const items = [
      { id: 'a', fromStatus: 'approved' as const },
      { id: 'b', fromStatus: 'rejected' as const },
    ];
    const invalid = validateDemandeBatchTransitions(items, 'cancelled');
    expect(invalid).toHaveLength(2);
  });
});
