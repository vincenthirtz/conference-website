// @vitest-environment happy-dom
//
// Women's Library, lot 8 — les rayonnages et les points de la Grande salle de
// lecture (`features/player/library/readingRoom/{shelves,hotspots}.ts`).
//
// Ce que ce fichier protège :
//   - UNE SEULE SOURCE DE VÉRITÉ avec /securite : chaque rayonnage pointe une
//     section qui EXISTE sur la page (ancre et titre), les numéros sont ceux
//     de `HELPLINES` ;
//   - le guichet ouvre /support en `behavior` avec l'anonymat proposé, et
//     RIEN d'autre (aucun contexte de salle dans le lien), lu tel quel par
//     /support ;
//   - les points de la vue suivent le décor fixe : chaque rayonnage est un épi
//     de `bookshelf_double`, le guichet un `reception_desk` (absent pour
//     l'instant) ;
//   - le pont vue → panneaux ne parle qu'à qui écoute.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';

import SafetyPage from '@/pages/securite';
import { HELPLINES } from '@/components/safety/helplines';
import { SAFETY_HARASSMENT_ID } from '@/components/safety/SafetyHarassmentGuides';
import { SAFETY_HELPLINES_ID } from '@/components/safety/SafetyHelplines';
import {
  SAFETY_REPORT_HREF,
  SAFETY_REPORT_ID,
  SAFETY_REPORT_NAMED_HREF,
} from '@/components/safety/SafetyReportSection';
import { parseSupportPrefill } from '@/utils/support/prefill';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import { READING_ROOM } from '@/features/player/library/layouts/readingRoom';
import {
  GUICHET_HREF,
  GUICHET_NAMED_HREF,
  helplineNumbers,
  isReadingRoomShelfId,
  READING_ROOM_SHELF_IDS,
  SECURITE_ANCHORS,
  securiteHref,
  shelfHeadingId,
} from '@/features/player/library/readingRoom/shelves';
import {
  GUICHET_FURNITURE_KEY,
  hotspotAt,
  itemArea,
  readingRoomHotspots,
  SHELF_FURNITURE_KEY,
} from '@/features/player/library/readingRoom/hotspots';
import {
  requestReadingRoomSpot,
  subscribeReadingRoomSpots,
} from '@/features/player/library/readingRoom/spotRequests';

const ts = nsSafetyPage.fr;

afterEach(cleanup);

describe('rayonnages → /securite (une seule source)', () => {
  it('quatre rayonnages, dans l’ordre de la page', () => {
    expect(READING_ROOM_SHELF_IDS).toEqual([
      'helplines',
      'guides',
      'report',
      'charter',
    ]);
    expect(isReadingRoomShelfId('guides')).toBe(true);
    expect(isReadingRoomShelfId('guichet')).toBe(false);
    expect(isReadingRoomShelfId(undefined)).toBe(false);
  });

  it('les ancres sont celles qu’exportent les composants de /securite', () => {
    expect(SECURITE_ANCHORS.helplines).toBe(SAFETY_HELPLINES_ID);
    expect(SECURITE_ANCHORS.guides).toBe(SAFETY_HARASSMENT_ID);
    expect(SECURITE_ANCHORS.report).toBe(SAFETY_REPORT_ID);
  });

  it('chaque rayonnage mène à une section qui existe sur /securite, avec son titre', () => {
    const { container } = render(<SafetyPage />);
    const titles = {
      helplines: ts.emergencyTitle,
      guides: ts.harassTitle,
      report: ts.reportTitle,
      charter: ts.charterTitle,
    };
    for (const shelf of READING_ROOM_SHELF_IDS) {
      const anchor = SECURITE_ANCHORS[shelf];
      expect(securiteHref(shelf)).toBe(`/securite#${anchor}`);
      const section = container.querySelector(`section#${anchor}`);
      expect(section, anchor).not.toBeNull();
      const heading = container.querySelector(`#${shelfHeadingId(shelf)}`);
      expect(heading?.textContent).toBe(titles[shelf]);
    }
  });

  it('les numéros sont ceux de HELPLINES : urgences d’abord, puis écoute', () => {
    const numbers = helplineNumbers();
    expect([...numbers].sort()).toEqual(HELPLINES.map((l) => l.number).sort());
    expect(numbers.slice(0, 3)).toEqual(['17', '112', '114']);
    for (const n of ['3018', '3919', '119']) expect(numbers).toContain(n);
  });
});

describe('le guichet', () => {
  it('ouvre /support en « comportement », l’anonymat proposé, et rien d’autre', () => {
    expect(GUICHET_HREF).toBe('/support?category=behavior&anonymous=1');
    expect(GUICHET_NAMED_HREF).toBe('/support?category=behavior');
    // Le même guichet que /securite.
    expect(GUICHET_HREF).toBe(SAFETY_REPORT_HREF);
    expect(GUICHET_NAMED_HREF).toBe(SAFETY_REPORT_NAMED_HREF);
  });

  it('/support lit le lien tel quel : catégorie et case anonyme, sans sujet ni message', () => {
    const query = Object.fromEntries(
      new URL(GUICHET_HREF, 'https://x.test').searchParams
    );
    expect(parseSupportPrefill(query)).toEqual({
      category: 'behavior',
      anonymous: true,
    });
  });

  it('aucun contexte de salle dans les liens du guichet', () => {
    for (const href of [GUICHET_HREF, GUICHET_NAMED_HREF]) {
      expect(href).not.toMatch(/room|library|salle|subject|message/i);
    }
  });
});

describe('les points de la vue suivent le décor fixe', () => {
  const spots = readingRoomHotspots();

  it('quatre rayonnages sur les quatre premiers épis, du plus proche de la porte', () => {
    const shelves = spots.filter((s) => s.id !== 'guichet');
    expect(shelves.map((s) => s.id)).toEqual([...READING_ROOM_SHELF_IDS]);
    const xs = shelves.map((s) => s.area.minX);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('chaque point de rayonnage couvre exactement un épi de bookshelf_double', () => {
    const stacks = READING_ROOM.items.filter(
      (it) => it.key === SHELF_FURNITURE_KEY
    );
    for (const spot of spots.filter((s) => s.id !== 'guichet')) {
      const inside = stacks.filter((it) => it.gx === spot.area.minX);
      expect(inside.length, spot.id).toBeGreaterThan(0);
      for (const item of inside) {
        const area = itemArea(item)!;
        expect(area.minY).toBeGreaterThanOrEqual(spot.area.minY);
        expect(area.maxY).toBeLessThanOrEqual(spot.area.maxY);
        expect(area.maxX).toBeLessThanOrEqual(spot.area.maxX);
      }
      // L'épi lui-même répond à un appui.
      expect(hotspotAt(spots, { i: spot.area.minX, j: spot.area.minY })).toBe(
        spot.id
      );
    }
  });

  it('le sol et les allées ne répondent pas', () => {
    expect(hotspotAt(spots, { i: 3, j: 1 })).toBeNull(); // l'arrivée
    expect(hotspotAt(spots, { i: 9, j: 12 })).toBeNull(); // l'allée transversale
  });

  it('le guichet suit le reception_desk du décor, et n’existe pas sans lui', () => {
    const hasDesk = READING_ROOM.items.some(
      (it) => it.key === GUICHET_FURNITURE_KEY
    );
    expect(spots.some((s) => s.id === 'guichet')).toBe(hasDesk);
    // Le décor a son guichet (lot 7) : on le remplace par celui-ci.
    const withDesk = readingRoomHotspots([
      ...READING_ROOM.items.filter((it) => it.key !== GUICHET_FURNITURE_KEY),
      { key: GUICHET_FURNITURE_KEY, gx: 0, gy: 3, r: 0 },
    ]);
    const guichet = withDesk.find((s) => s.id === 'guichet');
    // reception_desk : 5 × 2 cases à la rotation 0.
    expect(guichet?.area).toEqual({ minX: 0, minY: 3, maxX: 5, maxY: 5 });
    expect(hotspotAt(withDesk, { i: 4, j: 4 })).toBe('guichet');
  });

  it('un meuble inconnu du catalogue est ignoré', () => {
    expect(itemArea({ key: 'nope_unknown', gx: 0, gy: 0, r: 0 })).toBeNull();
    expect(
      readingRoomHotspots([{ key: 'nope_unknown', gx: 0, gy: 0, r: 0 }])
    ).toEqual([]);
  });
});

describe('le pont vue → panneaux', () => {
  it('personne n’écoute : la demande ne part nulle part', () => {
    expect(requestReadingRoomSpot('helplines')).toBe(false);
  });

  it('un écran abonné reçoit la demande, puis plus rien une fois désabonné', () => {
    const listener = vi.fn();
    const off = subscribeReadingRoomSpots(listener);
    expect(requestReadingRoomSpot('charter')).toBe(true);
    expect(listener).toHaveBeenCalledWith('charter');
    off();
    expect(requestReadingRoomSpot('guides')).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
