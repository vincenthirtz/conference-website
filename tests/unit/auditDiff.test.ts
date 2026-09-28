// utils/admin/auditDiff.ts — ce que le journal staff retient d'un geste (L8).

import { describe, it, expect } from 'vitest';
import {
  REDACTED,
  auditPayloadFromStates,
  diffRecords,
  snapshotRecord,
} from '../../utils/admin/auditDiff';

describe('diffRecords', () => {
  it('ne retient que les champs qui ont bougé', () => {
    expect(
      diffRecords(
        { label: 'Old', channel: 'foo', badge: null, is_active: true },
        { label: 'New', channel: 'foo', badge: 'Cast', is_active: true }
      )
    ).toEqual({
      badge: { from: null, to: 'Cast' },
      label: { from: 'Old', to: 'New' },
    });
  });

  it('ignore les colonnes techniques', () => {
    expect(
      diffRecords(
        { id: 'a', updated_at: '1', created_at: '1', tenant_id: 't', x: 1 },
        { id: 'a', updated_at: '2', created_at: '1', tenant_id: 't', x: 1 }
      )
    ).toEqual({});
  });

  it('null et undefined valent « rien » ; objets comparés par valeur', () => {
    expect(diffRecords({ a: null, b: [1, 2] }, { b: [1, 2] })).toEqual({});
    expect(diffRecords({ o: { k: 1 } }, { o: { k: 2 } })).toEqual({
      o: { from: { k: 1 }, to: { k: 2 } },
    });
  });

  it('ne recopie jamais une valeur sensible', () => {
    expect(
      diffRecords(
        { webhook_secret: 'old-s3cret', api_key: 'k1' },
        { webhook_secret: 'new-s3cret', api_key: 'k1' }
      )
    ).toEqual({ webhook_secret: { from: REDACTED, to: REDACTED } });
    expect(snapshotRecord({ access_token: 'tok', name: 'x' })).toEqual({
      access_token: REDACTED,
      name: 'x',
    });
  });
});

describe('auditPayloadFromStates', () => {
  it('mise à jour → changes ; création → after ; suppression → before', () => {
    expect(auditPayloadFromStates({ a: 1 }, { a: 2 })).toEqual({
      changes: { a: { from: 1, to: 2 } },
    });
    expect(auditPayloadFromStates(null, { id: 'x', a: 1 })).toEqual({
      after: { a: 1 },
    });
    expect(auditPayloadFromStates({ id: 'x', a: 1 }, undefined)).toEqual({
      before: { a: 1 },
    });
    expect(auditPayloadFromStates(null, null)).toEqual({});
  });
});
