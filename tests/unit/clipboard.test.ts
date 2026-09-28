// utils/clipboard.ts — copier, y compris hors contexte sécurisé.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { copyText } from '../../utils/clipboard';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('copyText', () => {
  it('passe par l’API moderne quand elle existe', async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    expect(await copyText('https://x/overlay/1')).toBe(true);
    expect(writeText).toHaveBeenCalledWith('https://x/overlay/1');
  });

  it('se rabat sur execCommand quand l’API est refusée', async () => {
    vi.stubGlobal('navigator', {
      clipboard: {
        writeText: vi.fn(async () => Promise.reject(new Error('no'))),
      },
    });
    const node = {
      value: '',
      setAttribute: vi.fn(),
      select: vi.fn(),
      style: {},
    };
    vi.stubGlobal('document', {
      createElement: vi.fn(() => node),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand: vi.fn(() => true),
    });
    expect(await copyText('abc')).toBe(true);
    expect(node.value).toBe('abc');
  });

  it('dit l’échec quand tout échoue, sans lever', async () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        setAttribute() {},
        select() {},
        style: {},
      })),
      body: { appendChild() {}, removeChild() {} },
      execCommand: vi.fn(() => false),
    });
    expect(await copyText('abc')).toBe(false);
  });

  it('rien à copier : échec immédiat', async () => {
    expect(await copyText('')).toBe(false);
  });
});
