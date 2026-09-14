// Logique pure de la carte « Ajuster un solde » (components/admin/tcg/tcgGrantForm.ts).
//
// POURQUOI CES CAS. Une correction de solde qui part de travers ne fait pas de
// bruit : un `0` accepté, un `1e3` lu comme 1000, une clé d'idempotence gardée
// pour une AUTRE intention (le serveur rejouerait l'ancienne réponse et
// l'écran afficherait « appliqué » pour une correction jamais écrite), ou un
// refus 409 lu comme une panne réseau (on inviterait à relancer ce qui ne
// passera jamais). Rendre le composant demanderait une bibliothèque de test DOM
// que la politique zéro dépendance interdit : ce qui compte est donc ici.

import { describe, expect, it } from 'vitest';

import {
  GRANT_MAX_ABS_AMOUNT,
  GRANT_REASON_MAX,
  adminUserLabel,
  classifyGrantError,
  grantErrorAvailableBalance,
  grantIntentSignature,
  normalizeGrantSuccess,
  parseGrantAmount,
  shouldKeepIdempotencyKey,
  shortUserId,
  validateGrantForm,
} from '@/components/admin/tcg/tcgGrantForm';

// uuid v4 valide (variante 8) : `1111-…` serait refusé par z.string().uuid().
const USER = '3f2b8c1e-5d4a-4b7e-8c9d-0a1b2c3d4e5f';

describe('parseGrantAmount', () => {
  it('accepte un entier signé, positif ou négatif', () => {
    expect(parseGrantAmount('50')).toEqual({ ok: true, amount: 50 });
    expect(parseGrantAmount('+50')).toEqual({ ok: true, amount: 50 });
    expect(parseGrantAmount('-20')).toEqual({ ok: true, amount: -20 });
    expect(parseGrantAmount('  7 ')).toEqual({ ok: true, amount: 7 });
  });

  it('refuse le vide et un signe seul comme « requis »', () => {
    for (const raw of ['', '   ', '-', '+']) {
      expect(parseGrantAmount(raw)).toEqual({ ok: false, error: 'required' });
    }
  });

  it('refuse ce que Number() accepterait mais qu’on n’a pas tapé', () => {
    for (const raw of ['1e3', '0x10', '12.5', '1,5', '10 000', 'abc']) {
      expect(parseGrantAmount(raw)).toEqual({
        ok: false,
        error: 'notInteger',
      });
    }
  });

  it('refuse zéro, y compris -0 et 000', () => {
    for (const raw of ['0', '-0', '+0', '000']) {
      expect(parseGrantAmount(raw)).toEqual({ ok: false, error: 'zero' });
    }
  });

  it('borne la valeur absolue à la limite du contrat, bornes incluses', () => {
    expect(parseGrantAmount(String(GRANT_MAX_ABS_AMOUNT))).toEqual({
      ok: true,
      amount: GRANT_MAX_ABS_AMOUNT,
    });
    expect(parseGrantAmount(String(-GRANT_MAX_ABS_AMOUNT))).toEqual({
      ok: true,
      amount: -GRANT_MAX_ABS_AMOUNT,
    });
    expect(parseGrantAmount(String(GRANT_MAX_ABS_AMOUNT + 1))).toEqual({
      ok: false,
      error: 'tooLarge',
    });
    expect(parseGrantAmount('-99999999999999999999')).toEqual({
      ok: false,
      error: 'tooLarge',
    });
  });
});

describe('validateGrantForm', () => {
  it('rend la valeur prête à envoyer, motif élagué', () => {
    expect(
      validateGrantForm({
        userId: USER,
        amount: '-30',
        reason: '  doublon du 12/09  ',
      })
    ).toEqual({
      ok: true,
      value: { userId: USER, amount: -30, reason: 'doublon du 12/09' },
    });
  });

  it('rend TOUTES les erreurs d’un coup', () => {
    expect(validateGrantForm({ userId: null, amount: '', reason: '' })).toEqual(
      {
        ok: false,
        errors: {
          userId: 'required',
          amount: 'required',
          reason: 'required',
        },
      }
    );
  });

  it('refuse un identifiant qui n’est pas un uuid', () => {
    const result = validateGrantForm({
      userId: 'marie',
      amount: '10',
      reason: 'correction',
    });
    expect(result).toEqual({ ok: false, errors: { userId: 'invalid' } });
  });

  it('mesure le motif APRÈS élagage : des espaces ne sont pas un motif', () => {
    expect(
      validateGrantForm({ userId: USER, amount: '10', reason: '     ' })
    ).toEqual({ ok: false, errors: { reason: 'required' } });
    expect(
      validateGrantForm({ userId: USER, amount: '10', reason: ' ab ' })
    ).toEqual({ ok: false, errors: { reason: 'tooShort' } });
    expect(
      validateGrantForm({ userId: USER, amount: '10', reason: 'abc' }).ok
    ).toBe(true);
    expect(
      validateGrantForm({
        userId: USER,
        amount: '10',
        reason: 'x'.repeat(GRANT_REASON_MAX + 1),
      })
    ).toEqual({ ok: false, errors: { reason: 'tooLong' } });
  });
});

/** Forme d'une AdminFetchError, sans importer le hook (et Supabase avec). */
function httpError(status: number, payload: unknown = null) {
  return Object.assign(new Error('x'), { status, payload });
}

describe('classifyGrantError', () => {
  it('lit les codes stables du contrat, qui priment sur le statut', () => {
    expect(classifyGrantError(httpError(400, { code: 'INVALID_BODY' }))).toBe(
      'invalidBody'
    );
    expect(classifyGrantError(httpError(404, { code: 'USER_NOT_FOUND' }))).toBe(
      'userNotFound'
    );
    expect(
      classifyGrantError(httpError(409, { code: 'INSUFFICIENT_BALANCE' }))
    ).toBe('insufficientBalance');
    expect(
      classifyGrantError(httpError(409, { code: 'BALANCE_CHANGED' }))
    ).toBe('balanceChanged');
  });

  it('ne conclut PAS « compte introuvable » d’un 404 sans code', () => {
    // Une route absente (déploiement incomplet) répond aussi 404.
    expect(classifyGrantError(httpError(404))).toBe('unknown');
  });

  it('se rabat sur le statut pour ce que le contrat ne nomme pas', () => {
    expect(classifyGrantError(httpError(400))).toBe('invalidBody');
    expect(classifyGrantError(httpError(401))).toBe('forbidden');
    expect(classifyGrantError(httpError(403))).toBe('forbidden');
    expect(classifyGrantError(httpError(429))).toBe('rateLimited');
    expect(classifyGrantError(httpError(500))).toBe('unknown');
    expect(classifyGrantError(httpError(409))).toBe('unknown');
  });

  it('distingue la mise en file et la coupure réseau', () => {
    expect(
      classifyGrantError(
        Object.assign(new Error('queued'), { isBgSyncQueued: true })
      )
    ).toBe('queued');
    expect(classifyGrantError(new TypeError('Failed to fetch'))).toBe(
      'network'
    );
    expect(classifyGrantError('boom')).toBe('unknown');
    expect(classifyGrantError(null)).toBe('unknown');
  });
});

describe('grantErrorAvailableBalance', () => {
  it('rend le solde disponible joint au refus, sinon null', () => {
    expect(
      grantErrorAvailableBalance(
        httpError(409, { code: 'INSUFFICIENT_BALANCE', balance: 120 })
      )
    ).toBe(120);
    expect(
      grantErrorAvailableBalance(
        httpError(409, { code: 'INSUFFICIENT_BALANCE', balance: '120' })
      )
    ).toBeNull();
    expect(grantErrorAvailableBalance(new TypeError('x'))).toBeNull();
  });
});

describe('durée de vie de la clé d’idempotence', () => {
  it('GARDE la clé quand on ignore si le serveur a écrit', () => {
    expect(shouldKeepIdempotencyKey('network')).toBe(true);
    expect(shouldKeepIdempotencyKey('queued')).toBe(true);
    expect(shouldKeepIdempotencyKey('unknown')).toBe(true);
  });

  it('RENOUVELLE la clé après un refus explicite (rien n’a été écrit)', () => {
    for (const kind of [
      'invalidBody',
      'userNotFound',
      'insufficientBalance',
      'balanceChanged',
      'forbidden',
      'rateLimited',
    ] as const) {
      expect(shouldKeepIdempotencyKey(kind)).toBe(false);
    }
  });

  it('une même intention a la même empreinte, toute différence en change', () => {
    const base = { userId: USER, amount: 50, reason: 'victoire non créditée' };
    const sig = grantIntentSignature(base);
    expect(grantIntentSignature({ ...base })).toBe(sig);
    expect(grantIntentSignature({ ...base, amount: -50 })).not.toBe(sig);
    expect(grantIntentSignature({ ...base, reason: 'autre' })).not.toBe(sig);
    expect(
      grantIntentSignature({
        ...base,
        userId: '9a8b7c6d-5e4f-4a3b-9c2d-1e0f9a8b7c6d',
      })
    ).not.toBe(sig);
  });

  it('l’empreinte ne se laisse pas confondre par un séparateur dans le motif', () => {
    // Une concaténation naïve `id|montant|motif` rendrait ces deux-là égaux.
    expect(
      grantIntentSignature({ userId: USER, amount: 1, reason: '2|x' })
    ).not.toBe(grantIntentSignature({ userId: USER, amount: 12, reason: 'x' }));
  });
});

describe('normalizeGrantSuccess', () => {
  it('lit la réponse du contrat', () => {
    expect(
      normalizeGrantSuccess({
        ok: true,
        entryId: 'e1',
        balance: 350,
        replayed: true,
      })
    ).toEqual({ entryId: 'e1', balance: 350, replayed: true });
  });

  it('n’invente pas un solde nul quand il manque', () => {
    expect(normalizeGrantSuccess({ ok: true })).toEqual({
      entryId: null,
      balance: null,
      replayed: false,
    });
    expect(normalizeGrantSuccess(null).balance).toBeNull();
    expect(normalizeGrantSuccess({ balance: Number.NaN }).balance).toBeNull();
  });
});

describe('adminUserLabel', () => {
  it('pseudo, puis BattleTag, puis email, puis identifiant tronqué', () => {
    expect(
      adminUserLabel({
        id: USER,
        displayName: 'Marie',
        battleTag: 'Marie#1234',
        email: 'm@x.fr',
      })
    ).toBe('Marie');
    expect(
      adminUserLabel({ id: USER, battleTag: 'Marie#1234', email: 'm@x.fr' })
    ).toBe('Marie#1234');
    expect(adminUserLabel({ id: USER, email: 'm@x.fr' })).toBe('m@x.fr');
    expect(adminUserLabel({ id: USER })).toBe(shortUserId(USER));
  });

  it('traite un pseudo vide ou blanc comme absent', () => {
    expect(
      adminUserLabel({ id: USER, displayName: '   ', email: 'm@x.fr' })
    ).toBe('m@x.fr');
    expect(adminUserLabel({ id: USER, displayName: '', email: null })).toBe(
      '3f2b8c1e…'
    );
  });
});
