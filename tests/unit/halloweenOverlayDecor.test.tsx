// @vitest-environment happy-dom
//
// La décoration d'Halloween des overlays OBS (components/Halloween/*Overlay*).
// Ces sources passent à l'antenne, d'où ce qui est protégé ici :
//   1. LA SAISON : mêmes dates que la page d'accueil, et une source restée
//      ouverte se retire d'elle-même à la fin ;
//   2. `?halloween=0`, l'autre organisateur, la source trop petite : rien ;
//   3. UNE PANNE DE LA DÉCORATION NE TOUCHE PAS L'OVERLAY ;
//   4. pas de bouton, pas de stockage ;
//   5. quel overlay reçoit quoi, et le calque toujours SOUS le contenu des
//      scènes plein écran (z-index), sans fond.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { halloweenDecor } from '@/config/halloweenDecor';
import { CASTER_SCENE_TYPES } from '@/types/caster';

const brand = vi.hoisted(() => ({ value: null as unknown }));
const chunk = vi.hoisted(() => ({ fails: false }));

vi.mock('@/lib/branding/TenantBrandingProvider', () => ({
  useTenantBranding: () => brand.value,
}));
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () =>
      function HalloweenOverlayDecorStub({ level }: { level: string }) {
        if (chunk.fails) throw new Error('dessins indisponibles');
        return React.createElement('div', {
          'data-testid': 'decor',
          'data-level': level,
        });
      },
  };
});

import HalloweenOverlayDecorGate from '@/components/Halloween/HalloweenOverlayDecorGate';
import HalloweenOverlayDecor from '@/components/Halloween/HalloweenOverlayDecor';
import {
  casterSceneHalloweenLevel,
  frameFitsHalloweenLevel,
  listSourceHalloweenLevel,
  MAX_SCOREBOARD_SCALE,
  matchSourceHalloweenLevel,
  urlAllowsHalloween,
} from '@/components/Halloween/halloweenOverlayLevels';

const IN_SEASON = new Date('2026-10-31T21:00:00+01:00');

function setFrame(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    value: height,
  });
}

function setSearch(search: string) {
  window.history.replaceState(null, '', `/overlay/caster/starting${search}`);
}

describe('HalloweenOverlayDecorGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(IN_SEASON);
    brand.value = null;
    chunk.fails = false;
    setFrame(1920, 1080);
    setSearch('');
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  const decor = () => screen.queryByTestId('decor');

  describe('la saison', () => {
    it('en saison : monte le niveau demandé', () => {
      render(<HalloweenOverlayDecorGate level="full" />);
      expect(decor()?.getAttribute('data-level')).toBe('full');
    });

    it.each([
      ['la veille', '2026-10-26T23:59:59+01:00'],
      ['à la fin de la saison', halloweenDecor?.visibleUntil ?? ''],
      ['en décembre', '2026-12-15T12:00:00+01:00'],
    ])('%s : rien', (_label, iso) => {
      vi.setSystemTime(new Date(iso));
      render(<HalloweenOverlayDecorGate level="full" />);
      expect(decor()).toBeNull();
    });

    it('une source restée ouverte se retire seule à la fin de la saison', () => {
      vi.setSystemTime(
        new Date(new Date(halloweenDecor?.visibleUntil ?? 0).getTime() - 30_000)
      );
      render(<HalloweenOverlayDecorGate level="full" />);
      expect(decor()).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(60_000);
      });
      expect(decor()).toBeNull();
    });
  });

  describe('ce qui la coupe, même en saison', () => {
    it('?halloween=0 retire la décoration de cette source', () => {
      setSearch('?halloween=0');
      render(<HalloweenOverlayDecorGate level="full" />);
      expect(decor()).toBeNull();
    });

    it('toute autre valeur la laisse', () => {
      setSearch('?halloween=1&source=scoreboard');
      render(<HalloweenOverlayDecorGate level="corners" />);
      expect(decor()).not.toBeNull();
    });

    it('la source d’un autre organisateur (?tenant=)', () => {
      setSearch('?tenant=autre-orga');
      render(<HalloweenOverlayDecorGate level="corners" />);
      expect(decor()).toBeNull();
    });

    it('la marque blanche', () => {
      brand.value = { name: 'Autre orga' };
      render(<HalloweenOverlayDecorGate level="full" />);
      expect(decor()).toBeNull();
    });

    it('une source trop petite', () => {
      setFrame(800, 600);
      render(<HalloweenOverlayDecorGate level="full" />);
      expect(decor()).toBeNull();
    });

    it('un overlay sans niveau', () => {
      render(<HalloweenOverlayDecorGate level={null} />);
      expect(decor()).toBeNull();
    });
  });

  it('une panne de la décoration laisse l’overlay à l’écran, sans message', () => {
    chunk.fails = true;
    const silenced = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <div>
        <p>Score : 2 - 1</p>
        <HalloweenOverlayDecorGate level="full" />
      </div>
    );
    silenced.mockRestore();

    expect(screen.getByText('Score : 2 - 1')).toBeTruthy();
    expect(decor()).toBeNull();
    expect(document.body.textContent).toBe('Score : 2 - 1');
  });
});

describe('HalloweenOverlayDecor — les dessins', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    cleanup();
  });

  const count = (selector: string) =>
    document.querySelectorAll(selector).length;

  it('ni bouton ni stockage, muette pour les lecteurs d’écran', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    const write = vi.spyOn(Storage.prototype, 'setItem');
    render(<HalloweenOverlayDecor level="full" />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(count('button, a, input')).toBe(0);
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
    expect(
      document
        .querySelector('[data-test="halloween-overlay-decor"]')
        ?.getAttribute('aria-hidden')
    ).toBe('true');
  });

  it('full : tout le décor, deux chauves-souris seulement', () => {
    render(<HalloweenOverlayDecor level="full" />);
    expect(count('.hw-web')).toBe(2);
    expect(count('.hw-spider')).toBe(2);
    expect(count('.hw-bat')).toBe(2);
    expect(count('.hw-witch')).toBe(1);
    expect(count('.hw-mummy')).toBe(1);
    expect(count('.hw-ghost')).toBe(1);
    expect(count('.hw-pumpkin')).toBe(2);
  });

  it('edges : rien de ce qui traverse l’image', () => {
    render(<HalloweenOverlayDecor level="edges" />);
    expect(count('.hw-web')).toBe(2);
    expect(count('.hw-spider')).toBe(2);
    expect(count('.hw-bat')).toBe(0);
    expect(count('.hw-witch')).toBe(0);
    expect(count('.hw-mummy')).toBe(1);
    expect(count('.hw-ghost')).toBe(1);
  });

  it('corners : deux toiles, rien qui bouge', () => {
    render(<HalloweenOverlayDecor level="corners" />);
    expect(count('.hw-web')).toBe(2);
    expect(count('.hw-spider')).toBe(0);
    expect(count('.hw-bat, .hw-witch, .hw-mummy, .hw-ghost, .hw-pumpkin')).toBe(
      0
    );
  });
});

describe('quel overlay reçoit quoi', () => {
  it('les scènes caster : chaque type a sa réponse', () => {
    const levels = Object.fromEntries(
      CASTER_SCENE_TYPES.map((type) => [type, casterSceneHalloweenLevel(type)])
    );
    expect(levels).toEqual({
      starting: 'full',
      pause: 'full',
      end: 'full',
      results: 'full',
      leaderboard: 'full',
      standings: 'full',
      bracket: 'full',
      mvp: 'full',
      match: 'corners',
      scrim: 'corners',
      player: null,
      camera: null,
      webcam: null,
    });
  });

  it('un type de scène inconnu : rien', () => {
    expect(casterSceneHalloweenLevel('scene-du-futur')).toBeNull();
    expect(casterSceneHalloweenLevel('__proto__')).toBeNull();
  });

  it('/overlay/match : le tableau de score et l’attente, pas les encarts', () => {
    expect(matchSourceHalloweenLevel('scoreboard', 1)).toBe('corners');
    expect(matchSourceHalloweenLevel('waiting', 1)).toBe('corners');
    expect(matchSourceHalloweenLevel('maps', 1)).toBeNull();
    expect(matchSourceHalloweenLevel('teams', 1)).toBeNull();
    expect(matchSourceHalloweenLevel('countdown', 1)).toBeNull();
  });

  it('/overlay/match : un tableau de score agrandi perd ses toiles', () => {
    expect(matchSourceHalloweenLevel('scoreboard', MAX_SCOREBOARD_SCALE)).toBe(
      'corners'
    );
    expect(
      matchSourceHalloweenLevel('scoreboard', MAX_SCOREBOARD_SCALE + 0.1)
    ).toBeNull();
  });

  it('/overlay/day et /overlay/standings : les marges, tant qu’elles sont libres', () => {
    expect(listSourceHalloweenLevel(1)).toBe('edges');
    expect(listSourceHalloweenLevel(0.8)).toBe('edges');
    expect(listSourceHalloweenLevel(1.1)).toBeNull();
  });

  it('les toiles ne demandent que la largeur (tableau de score en 1920×250)', () => {
    expect(frameFitsHalloweenLevel('corners', 1920, 250)).toBe(true);
    expect(frameFitsHalloweenLevel('corners', 1450, 340)).toBe(false);
    expect(frameFitsHalloweenLevel('edges', 1920, 1080)).toBe(true);
    expect(frameFitsHalloweenLevel('edges', 1920, 250)).toBe(false);
    expect(frameFitsHalloweenLevel('full', 1280, 720)).toBe(false);
  });

  it('?halloween=0 seul coupe, ?tenant= aussi', () => {
    expect(urlAllowsHalloween('')).toBe(true);
    expect(urlAllowsHalloween('?tournament=event')).toBe(true);
    expect(urlAllowsHalloween('?halloween=0')).toBe(false);
    expect(urlAllowsHalloween('?tenant=x')).toBe(false);
  });

  const read = (path: string) =>
    readFileSync(join(process.cwd(), path), 'utf8');

  it.each([
    'pages/overlay/caster/[sceneKey].tsx',
    'pages/overlay/match/[matchId].tsx',
    'pages/overlay/day.tsx',
    'pages/overlay/standings.tsx',
  ])('%s monte la porte', (page) => {
    expect(read(page)).toContain('<HalloweenOverlayDecorGate');
  });

  // /overlay/finales : une scène de 1450×340 que ses deux bandes remplissent
  // entièrement. Les autres : des encarts, ou composés sur autre chose.
  it.each([
    'pages/overlay/finales.tsx',
    'pages/overlay/scrims.tsx',
    'pages/overlay/scrim-result.tsx',
    'pages/overlay/logo.tsx',
    'pages/overlay/don.tsx',
    'pages/overlay/don-alert.tsx',
    'pages/overlay/alertes.tsx',
    'pages/overlay/mvp-public.tsx',
    'pages/overlay/partenaires.tsx',
    'pages/overlay/regie.tsx',
    'pages/overlay/tcg/[token].tsx',
  ])('%s reste nue', (page) => {
    expect(read(page)).not.toContain('Halloween');
  });

  it('les dessins restent hors du premier chargement des overlays', () => {
    const gate = read('components/Halloween/HalloweenOverlayDecorGate.tsx');
    expect(gate).toMatch(
      /dynamic\(\(\) => import\('\.\/HalloweenOverlayDecor'\)/
    );
    expect(read('components/Halloween/halloweenOverlayLevels.ts')).not.toMatch(
      /^import (?!type)/m
    );
  });
});

describe('le calque, dans la page', () => {
  const css = readFileSync(join(process.cwd(), 'styles/globals.css'), 'utf8');
  // Les règles seules : les commentaires du bloc parlent de backdrop-filter.
  const overlayBlock = css
    .slice(css.indexOf('.hw-layer--overlay {'))
    .replace(/\/\*[\s\S]*?\*\//g, '');

  it('reste sans fond ni filtre plein cadre, ne capte aucun clic', () => {
    expect(overlayBlock).not.toMatch(/background|backdrop-filter|box-shadow/);
    expect(overlayBlock).not.toMatch(/filter: (?!none)/);
    expect(css).toMatch(
      /\.hw-layer \{[^}]*overflow: hidden;[^}]*pointer-events: none;/
    );
  });

  // Le calque est en z-index 5 : tout ce qui porte du texte doit passer au-dessus.
  it('passe sous le contenu de toutes les scènes plein écran', () => {
    expect(overlayBlock).toMatch(/\.hw-layer--overlay \{\s*z-index: 5;/);
    for (const [file, root] of [
      ['Starting', 'starting'],
      ['Pause', 'pause'],
      ['End', 'end'],
      ['Results', 'results'],
      ['Leaderboard', 'leaderboard'],
      ['Standings', 'standings'],
      ['Bracket', 'bracket'],
      ['Mvp', 'mvp'],
    ]) {
      const source = readFileSync(
        join(
          process.cwd(),
          `components/overlay/caster/Caster${file}Overlay.tsx`
        ),
        'utf8'
      );
      expect(source, file).toMatch(
        new RegExp(
          `\\.caster-${root}-overlay \\.container \\{[^}]*z-index: 10;`
        )
      );
    }
    const pause = readFileSync(
      join(process.cwd(), 'components/overlay/caster/CasterPauseOverlay.tsx'),
      'utf8'
    );
    expect(pause).toMatch(
      /\.caster-pause-overlay \.marquee \{[^}]*z-index: 10;/
    );
  });
});
