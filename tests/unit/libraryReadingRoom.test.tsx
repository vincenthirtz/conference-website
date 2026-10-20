// @vitest-environment happy-dom
//
// Women's Library, lot 8 — la Grande salle de lecture sous la scène
// (`ui/readingRoom/ReadingRoomExtras`, monté dans l'emplacement « Lot 8 » de
// `ui/room/RoomExtras`). Le chemin COMPLET sans canvas :
//   * seulement dans la salle de lecture (ni hall, ni QG, ni appartement) ;
//   * l'arrivée discrète expliquée, sans compteur ni liste de présentes ;
//   * chaque rayonnage ouvre un panneau de lecture nommé, qui rend la section
//     de /securite et y renvoie (nouvel onglet) ; Échap ferme et rend le
//     focus ;
//   * le guichet ouvre /support pré-rempli (behavior, anonymat proposé) ;
//   * la sortie rapide : un clic, ou Échap ×2 — même panneau ouvert ;
//   * un appui sur un point de la vue ouvre le même panneau ;
//   * AUCUNE TRACE : ni réseau, ni stockage, ni mesure d'audience.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';

import RoomExtras from '@/features/player/library/ui/room/RoomExtras';
import ReadingRoomExtras from '@/features/player/library/ui/readingRoom/ReadingRoomExtras';
import { requestReadingRoomSpot } from '@/features/player/library/readingRoom/spotRequests';
import {
  GUICHET_HREF,
  GUICHET_NAMED_HREF,
  READING_ROOM_SHELF_IDS,
} from '@/features/player/library/readingRoom/shelves';
import type {
  LibraryRoomKind,
  LibraryRoomView,
} from '@/features/player/library/socialResponses';
import { QUICK_EXIT_URL } from '@/components/safety/quickExit';
import nsReadingRoom from '@/lib/i18n/locales/fr/playerLibraryReadingRoom';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import nsSocial from '@/lib/i18n/locales/fr/playerLibrarySocial';

const t = nsReadingRoom.fr;
const ts = nsSafetyPage.fr;

const TITLES = {
  helplines: ts.emergencyTitle,
  guides: ts.harassTitle,
  report: ts.reportTitle,
  charter: ts.charterTitle,
} as const;

function roomOf(kind: LibraryRoomKind): LibraryRoomView {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    kind,
    name: null,
    access: 'open',
    width: 40,
    depth: 30,
    decor: {} as LibraryRoomView['decor'],
    version: 1,
    isOwner: false,
    tenantId: '00000000-0000-4000-8000-0000000000bb',
  };
}

let fetchSpy: ReturnType<typeof vi.spyOn>;
let storageSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockImplementation(async () => new Response(null, { status: 204 }));
  storageSpy = vi.spyOn(Storage.prototype, 'setItem');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const quickExitLink = () =>
  screen.getByRole('link', { name: ts.quickExitAria });

describe('l’emplacement « Lot 8 » de RoomExtras', () => {
  it('la salle de lecture : arrivée, rayonnages, guichet, sortie rapide', () => {
    render(<RoomExtras room={roomOf('reading_room')} />);
    expect(
      screen.getByRole('heading', { level: 2, name: t.welcome.title })
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: t.shelves.title })
    ).toBeTruthy();
    expect(
      screen.getByRole('heading', { level: 2, name: t.guichet.title })
    ).toBeTruthy();
    expect(quickExitLink().getAttribute('href')).toBe(QUICK_EXIT_URL);
  });

  it.each(['hall', 'team_hq', 'apartment'] as const)(
    '%s : rien de la salle de lecture',
    (kind) => {
      const { container } = render(<RoomExtras room={roomOf(kind)} />);
      expect(container.querySelector('[data-reading-room]')).toBeNull();
      expect(screen.queryByRole('link', { name: ts.quickExitAria })).toBeNull();
      expect(screen.queryByText(t.shelves.title)).toBeNull();
    }
  );
});

describe('l’arrivée discrète', () => {
  it('dit qu’elle est invisible, ce que change « Être visible », le silence, l’absence de trace', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    const welcome = screen
      .getByRole('heading', { name: t.welcome.title })
      .closest('section')!;
    for (const text of [
      t.welcome.body,
      t.welcome.visible,
      t.welcome.silence,
      t.welcome.noTrace,
    ]) {
      expect(within(welcome).getByText(text)).toBeTruthy();
    }
    expect(welcome.textContent).toContain(ts.quickExitHint);
    expect(welcome.textContent).toContain(ts.exitLimit);
  });

  it('aucun compteur ni liste de présentes', () => {
    const { container } = render(
      <ReadingRoomExtras room={{ kind: 'reading_room' }} />
    );
    expect(container.querySelector('[data-library-present]')).toBeNull();
    expect(screen.queryByText(nsSocial.fr.room.presentTitle)).toBeNull();
  });
});

describe('les rayonnages', () => {
  it('un bouton par rayonnage, nommé par le titre de sa section de /securite', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    for (const shelf of READING_ROOM_SHELF_IDS) {
      const button = screen.getByRole('button', { name: TITLES[shelf] });
      expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    }
  });

  it.each(READING_ROOM_SHELF_IDS)(
    '%s : un panneau de lecture nommé, avec le lien vers sa section',
    (shelf) => {
      render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
      fireEvent.click(screen.getByRole('button', { name: TITLES[shelf] }));
      const dialog = screen.getByRole('dialog', { name: TITLES[shelf] });
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      const link = within(dialog).getByRole('link', {
        name: new RegExp(t.shelves.readOnPage),
      });
      expect(link.getAttribute('href')).toMatch(/^\/securite#/);
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toContain('noreferrer');
      // « Fermer » en tête reçoit le focus : on lit ensuite de haut en bas.
      expect(document.activeElement).toBe(
        within(dialog).getByRole('button', { name: t.shelves.close })
      );
    }
  );

  it('le rayonnage d’aide : les numéros de /securite, en liens d’appel', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    fireEvent.click(screen.getByRole('button', { name: ts.emergencyTitle }));
    const dialog = screen.getByRole('dialog', { name: ts.emergencyTitle });
    const hrefs = within(dialog)
      .getAllByRole('link')
      .map((a) => a.getAttribute('href'));
    for (const href of [
      'tel:3018',
      'tel:3919',
      'tel:17',
      'tel:112',
      'sms:114',
      'tel:119',
    ])
      expect(hrefs).toContain(href);
    expect(
      within(dialog)
        .getByRole('link', { name: new RegExp(t.shelves.readOnPage) })
        .getAttribute('href')
    ).toBe('/securite#urgences');
  });

  it('la charte : l’emplacement réservé de /securite, rien d’inventé', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    fireEvent.click(screen.getByRole('button', { name: ts.charterTitle }));
    const dialog = screen.getByRole('dialog', { name: ts.charterTitle });
    expect(within(dialog).getByText(ts.charterBody)).toBeTruthy();
  });

  it('Échap ferme et rend le focus au rayonnage', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    const button = screen.getByRole('button', { name: ts.harassTitle });
    button.focus();
    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: ts.harassTitle });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('« Fermer » ferme aussi', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    fireEvent.click(screen.getByRole('button', { name: ts.reportTitle }));
    const dialog = screen.getByRole('dialog', { name: ts.reportTitle });
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.shelves.close })
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('le guichet', () => {
  it('ouvre /support pré-rempli : comportement, anonymat proposé', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    const guichet = screen
      .getByRole('heading', { level: 2, name: t.guichet.title })
      .closest('section')!;
    const main = within(guichet).getByRole('link', { name: ts.reportCta });
    expect(main.getAttribute('href')).toBe(GUICHET_HREF);
    expect(main.getAttribute('href')).toBe(
      '/support?category=behavior&anonymous=1'
    );
    expect(
      within(guichet)
        .getByRole('link', { name: ts.reportCtaNamed })
        .getAttribute('href')
    ).toBe(GUICHET_NAMED_HREF);
    // L'aide dit que l'anonymat est coché, et que la salle n'est pas citée.
    const hint = document.getElementById(
      main.getAttribute('aria-describedby')!
    );
    expect(hint?.textContent).toContain(ts.reportCtaHint);
    expect(hint?.textContent).toContain(t.guichet.noContext);
    expect(within(guichet).getByText(ts.reportNotEmergency)).toBeTruthy();
  });
});

describe('la sortie rapide', () => {
  it('toujours là, et un clic quitte en une action (replace)', () => {
    const onExit = vi.fn();
    render(
      <ReadingRoomExtras room={{ kind: 'reading_room' }} onExit={onExit} />
    );
    const notPrevented = fireEvent.click(quickExitLink());
    expect(onExit).toHaveBeenCalledOnce();
    expect(notPrevented).toBe(false);
  });

  it('Échap ×2 quitte la Library', () => {
    const onExit = vi.fn();
    render(
      <ReadingRoomExtras room={{ kind: 'reading_room' }} onExit={onExit} />
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('Échap ×2 marche aussi panneau ouvert : le premier ferme, le second quitte', () => {
    const onExit = vi.fn();
    render(
      <ReadingRoomExtras room={{ kind: 'reading_room' }} onExit={onExit} />
    );
    fireEvent.click(screen.getByRole('button', { name: ts.emergencyTitle }));
    const dialog = screen.getByRole('dialog', { name: ts.emergencyTitle });
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
    });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('la vraie sortie remplace la page (Retour ne ramène pas ici)', () => {
    const replace = vi.fn();
    vi.spyOn(window, 'location', 'get').mockReturnValue({
      ...window.location,
      replace,
    } as Location);
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    fireEvent.click(quickExitLink());
    expect(replace).toHaveBeenCalledWith(QUICK_EXIT_URL);
  });
});

describe('un appui dans la vue ouvre le même panneau', () => {
  it('un rayonnage', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    act(() => {
      expect(requestReadingRoomSpot('guides')).toBe(true);
    });
    expect(screen.getByRole('dialog', { name: ts.harassTitle })).toBeTruthy();
  });

  it('le guichet', () => {
    render(<ReadingRoomExtras room={{ kind: 'reading_room' }} />);
    act(() => {
      requestReadingRoomSpot('guichet');
    });
    const dialog = screen.getByRole('dialog', { name: t.guichet.title });
    expect(
      within(dialog)
        .getByRole('link', { name: ts.reportCta })
        .getAttribute('href')
    ).toBe(GUICHET_HREF);
  });

  it('hors de la salle de lecture, personne n’écoute', () => {
    render(<RoomExtras room={roomOf('hall')} />);
    let heard = true;
    act(() => {
      heard = requestReadingRoomSpot('helplines');
    });
    expect(heard).toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('aucune trace', () => {
  it('ni réseau, ni stockage, ni mesure — en ouvrant tout', () => {
    const w = window as unknown as {
      plausible?: () => void;
      umami?: { track: () => void };
    };
    w.plausible = vi.fn();
    w.umami = { track: vi.fn() };
    render(
      <ReadingRoomExtras room={{ kind: 'reading_room' }} onExit={vi.fn()} />
    );
    for (const shelf of READING_ROOM_SHELF_IDS) {
      fireEvent.click(screen.getByRole('button', { name: TITLES[shelf] }));
      fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    }
    act(() => {
      requestReadingRoomSpot('guichet');
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSpy).not.toHaveBeenCalled();
    expect(w.plausible).not.toHaveBeenCalled();
    expect(w.umami.track).not.toHaveBeenCalled();
    delete w.plausible;
    delete w.umami;
  });
});
