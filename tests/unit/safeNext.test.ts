import { describe, expect, it } from 'vitest';
import { safeNext } from '@/utils/auth/safeNext';

describe('safeNext (anti open-redirect)', () => {
  it('accepte un chemin interne, requête comprise', () => {
    expect(safeNext('/player')).toBe('/player');
    expect(safeNext('/rejoindre/abc123')).toBe('/rejoindre/abc123');
    expect(safeNext('/player/join-team?tab=scrim&team=x')).toBe(
      '/player/join-team?tab=scrim&team=x'
    );
  });

  it('refuse les URL absolues et protocol-relative', () => {
    expect(safeNext('https://evil.example')).toBeNull();
    expect(safeNext('//evil.example')).toBeNull();
    expect(safeNext('javascript:alert(1)')).toBeNull();
  });

  it('refuse les antislashs (normalisés en « // » par les navigateurs)', () => {
    expect(safeNext('/\\evil.example')).toBeNull();
    expect(safeNext('/foo\\bar')).toBeNull();
  });

  it('refuse ce qui n’est pas une chaîne', () => {
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(null)).toBeNull();
    expect(safeNext(['/player'])).toBeNull();
    expect(safeNext('')).toBeNull();
  });
});
