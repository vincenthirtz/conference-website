// tests/unit/staffUserCache.test.ts
//
// Éviction des caches user de utils/staff.ts (tokenUserCache /
// cookieUserCache) : setUserCacheEntry purge les entrées expirées au passage
// et borne la taille du cache (suppression des plus anciennes) — plus de
// croissance non bornée sous churn de tokens/cookies.

import { describe, it, expect } from 'vitest';

import { setUserCacheEntry } from '../../utils/staff';

type Entry = { user: { id: string } | null; expiresAt: number };

describe('setUserCacheEntry (éviction des caches user)', () => {
  it('insère une entrée normalement', () => {
    const cache = new Map<string, Entry>();
    const entry = { user: { id: 'u1' }, expiresAt: Date.now() + 60_000 };
    setUserCacheEntry(cache, 'k1', entry);
    expect(cache.get('k1')).toBe(entry);
    expect(cache.size).toBe(1);
  });

  it('purge les entrées expirées au passage', () => {
    const cache = new Map<string, Entry>();
    const now = Date.now();
    cache.set('expired-1', { user: null, expiresAt: now - 1 });
    cache.set('expired-2', { user: { id: 'old' }, expiresAt: now - 60_000 });
    cache.set('fresh', { user: { id: 'live' }, expiresAt: now + 60_000 });

    setUserCacheEntry(cache, 'new', {
      user: { id: 'new' },
      expiresAt: now + 60_000,
    });

    expect(cache.has('expired-1')).toBe(false);
    expect(cache.has('expired-2')).toBe(false);
    expect(cache.has('fresh')).toBe(true);
    expect(cache.has('new')).toBe(true);
    expect(cache.size).toBe(2);
  });

  it('borne la taille du cache en évinçant les entrées les plus anciennes', () => {
    const cache = new Map<string, Entry>();
    const expiresAt = Date.now() + 60_000;
    for (let i = 0; i < 5; i++) {
      setUserCacheEntry(cache, `k${i}`, { user: null, expiresAt }, 5);
    }
    expect(cache.size).toBe(5);

    // 6e insertion avec cap=5 → k0 (le plus ancien) est évincé.
    setUserCacheEntry(cache, 'k5', { user: null, expiresAt }, 5);
    expect(cache.size).toBe(5);
    expect(cache.has('k0')).toBe(false);
    expect(cache.has('k5')).toBe(true);
  });

  it('re-set d’une clé existante : mise à jour sans éviction parasite', () => {
    const cache = new Map<string, Entry>();
    const expiresAt = Date.now() + 60_000;
    for (let i = 0; i < 5; i++) {
      setUserCacheEntry(cache, `k${i}`, { user: null, expiresAt }, 5);
    }

    // Re-set de k0 (cache plein) : k0 est rafraîchi, aucune autre clé perdue.
    setUserCacheEntry(cache, 'k0', { user: { id: 'v2' }, expiresAt }, 5);
    expect(cache.size).toBe(5);
    expect(cache.get('k0')?.user).toEqual({ id: 'v2' });
    for (let i = 1; i < 5; i++) {
      expect(cache.has(`k${i}`)).toBe(true);
    }

    // k0 vient d'être rafraîchi → la prochaine éviction touche k1, pas k0.
    setUserCacheEntry(cache, 'k6', { user: null, expiresAt }, 5);
    expect(cache.has('k0')).toBe(true);
    expect(cache.has('k1')).toBe(false);
  });

  it('utilise le cap par défaut (1000) sans exploser', () => {
    const cache = new Map<string, Entry>();
    const expiresAt = Date.now() + 60_000;
    for (let i = 0; i < 1200; i++) {
      setUserCacheEntry(cache, `k${i}`, { user: null, expiresAt });
    }
    expect(cache.size).toBeLessThanOrEqual(1000);
    // Les plus récentes sont conservées.
    expect(cache.has('k1199')).toBe(true);
    expect(cache.has('k0')).toBe(false);
  });
});
