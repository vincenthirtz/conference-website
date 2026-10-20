// @vitest-environment happy-dom
//
// Women's Library, lot 12 — le choix du décor dans les réglages de
// l'appartement (`ui/apartment/decor/DecorPicker`, monté par
// ApartmentSettings) :
//   * un groupe de boutons radio par emplacement (sol, murs, fenêtres,
//     porte), en onglets, avec vignettes et libellés traduits ;
//   * les ambiances posent un décor complet ; « revenir » rend l'enregistré ;
//   * l'aperçu suit le choix AVANT l'enregistrement ;
//   * enregistrer envoie le PATCH habituel (seulement ce qui change), et la
//     salle relue (rechargement) garde le choix.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { useState } from 'react';
import {
  LIBRARY_DOORS,
  LIBRARY_FLOORS,
  LIBRARY_WALL_FINISHES,
  LIBRARY_WINDOWS,
  type LibraryDecorChoice,
  libraryWallVariants,
  mergeApartmentDecor,
  resolveApartmentDecor,
} from '../../config/library/decor';
import type { LibraryManifest } from '../../features/player/library/engine/assets';
import type {
  ManifestDecor,
  WallStyle,
} from '../../features/player/library/engine/decor';
import ApartmentSettings from '../../features/player/library/ui/apartment/ApartmentSettings';
import DecorPicker from '../../features/player/library/ui/apartment/decor/DecorPicker';
import type { LibraryApartmentRoom } from '../../features/player/library/responses';
import type { UpdateApartmentInput } from '../../features/player/library/schemas';
import nsPlayerLibrary from '../../lib/i18n/locales/fr/playerLibrary';

const t = nsPlayerLibrary.fr;
const d = t.decor;

afterEach(cleanup);

function manifestWithSprites(): LibraryManifest {
  const frame = (src: string, span: number) => ({
    src,
    width: span ? span * 64 + 4 : 23,
    height: 500,
    anchor: { x: 2, y: 460 },
    span,
  });
  const side = (f: string, s: string) => {
    const out: WallStyle['left'] = { end: frame(`/d/${f}_${s}_end.webp`, 0) };
    for (const v of libraryWallVariants())
      out[v] = frame(`/d/${f}_${s}_${v}.webp`, v === 'plain' ? 1 : 2);
    return out;
  };
  const decor: ManifestDecor = { floors: {}, walls: {} };
  for (const f of LIBRARY_FLOORS)
    decor.floors[f] = {
      src: `/d/floor_${f}.webp`,
      width: 512,
      height: 256,
      periodTiles: 4,
      anchor: { x: 256, y: 0 },
    };
  for (const f of LIBRARY_WALL_FINISHES)
    decor.walls[f] = {
      height: 2.8,
      thickness: 0.15,
      left: side(f, 'l'),
      right: side(f, 'r'),
    };
  return {
    version: 1,
    tile: { width: 64, height: 32, meters: 0.5 },
    pixelRatio: 2,
    furniture: {},
    decor,
    avatars: {},
  };
}

const LOT4: LibraryDecorChoice = {
  floor: 'parquet',
  finish: 'library',
  window: 'classic',
  door: 'none',
};

function Controlled({
  initial = LOT4,
  manifest = null,
  onValue,
}: {
  initial?: LibraryDecorChoice;
  manifest?: LibraryManifest | null;
  onValue?: (c: LibraryDecorChoice) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <DecorPicker
      value={value}
      saved={initial}
      onChange={(c) => {
        setValue(c);
        onValue?.(c);
      }}
      width={14}
      depth={12}
      manifest={manifest}
    />
  );
}

describe('DecorPicker', () => {
  it('quatre onglets, un groupe radio par emplacement, toute la liste de la config', () => {
    render(<Controlled />);
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent);
    expect(tabs).toEqual([
      d.slots.floor,
      d.slots.finish,
      d.slots.window,
      d.slots.door,
    ]);
    // Onglet « Sol » d'abord : chaque sol, nommé, le sol enregistré coché.
    expect(screen.getAllByRole('radio')).toHaveLength(LIBRARY_FLOORS.length);
    expect(
      (
        screen.getByRole('radio', {
          name: d.floors.parquet,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    for (const [slot, list] of [
      ['finish', LIBRARY_WALL_FINISHES],
      ['window', LIBRARY_WINDOWS],
      ['door', LIBRARY_DOORS],
    ] as const) {
      fireEvent.click(screen.getByRole('tab', { name: d.slots[slot] }));
      const radios = screen.getAllByRole('radio');
      expect(radios).toHaveLength(list.length);
      const names = d[
        `${slot === 'finish' ? 'finishes' : `${slot}s`}` as 'finishes'
      ] as Record<string, string>;
      for (const v of list)
        expect(screen.getByRole('radio', { name: names[v] })).toBeTruthy();
    }
  });

  it('les onglets se parcourent au clavier (flèches)', () => {
    render(<Controlled />);
    const first = screen.getByRole('tab', { name: d.slots.floor });
    fireEvent.keyDown(first, { key: 'ArrowRight' });
    expect(
      screen
        .getByRole('tab', { name: d.slots.finish })
        .getAttribute('aria-selected')
    ).toBe('true');
    fireEvent.keyDown(screen.getByRole('tab', { name: d.slots.finish }), {
      key: 'End',
    });
    expect(
      screen
        .getByRole('tab', { name: d.slots.door })
        .getAttribute('aria-selected')
    ).toBe('true');
  });

  it('un choix change la valeur ; l’aperçu le décrit avant l’enregistrement ; « revenir » rend l’enregistré', () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    fireEvent.click(screen.getByRole('radio', { name: d.floors.terrazzo }));
    fireEvent.click(screen.getByRole('tab', { name: d.slots.door }));
    fireEvent.click(screen.getByRole('radio', { name: d.doors.arched }));
    expect(onValue).toHaveBeenLastCalledWith({
      ...LOT4,
      floor: 'terrazzo',
      door: 'arched',
    });
    const preview = screen.getByTestId('library-decor-preview');
    expect(preview.getAttribute('role')).toBe('img');
    expect(preview.getAttribute('aria-label')).toContain(d.floors.terrazzo);
    expect(preview.getAttribute('aria-label')).toContain(d.doors.arched);
    expect(screen.getByText(d.changed)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: d.reset }));
    expect(onValue).toHaveBeenLastCalledWith(LOT4);
    expect(screen.queryByText(d.changed)).toBeNull();
  });

  it('une ambiance pose un décor complet et se montre pressée', () => {
    const onValue = vi.fn();
    render(<Controlled onValue={onValue} />);
    const group = screen.getByRole('group', { name: d.themesLabel });
    const esport = within(group).getByRole('button', { name: d.themes.esport });
    expect(esport.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(esport);
    expect(onValue).toHaveBeenLastCalledWith({
      floor: 'concrete',
      finish: 'esport',
      window: 'loft',
      door: 'modern',
    });
    expect(esport.getAttribute('aria-pressed')).toBe('true');
  });

  it('vignettes : les sprites du manifeste (fenêtres dans l’habillage choisi), une pastille sans manifeste', () => {
    const { unmount } = render(<Controlled />);
    expect(document.querySelectorAll('[data-thumb="placeholder"]').length).toBe(
      LIBRARY_FLOORS.length
    );
    unmount();
    render(
      <Controlled
        manifest={manifestWithSprites()}
        initial={{ ...LOT4, finish: 'navy' }}
      />
    );
    expect(document.querySelectorAll('[data-thumb="floor"]').length).toBe(
      LIBRARY_FLOORS.length
    );
    fireEvent.click(screen.getByRole('tab', { name: d.slots.window }));
    const arched = screen.getByTestId('library-decor-window-arched');
    const layers = arched.querySelectorAll('[data-thumb="window"] span span');
    expect(layers.length).toBe(2);
    expect((layers[0] as HTMLElement).style.backgroundImage).toContain(
      'navy_r_window_arched'
    );
  });
});

describe('ApartmentSettings : le décor s’enregistre par le PATCH habituel', () => {
  const room = (decor: Record<string, unknown>): LibraryApartmentRoom => ({
    id: 'room-1',
    name: null,
    access: 'private',
    listed: false,
    width: 14,
    depth: 12,
    decor: decor as LibraryApartmentRoom['decor'],
    version: 1,
  });

  it('fenêtres cintrées + porte-fenêtre → PATCH { window, door } ; la salle relue garde le choix', async () => {
    let saved = room({ floor: 'parquet', wall: 'window' });
    const onSave = vi.fn(async (input: UpdateApartmentInput) => {
      // Comme l'API : fusion, décor complet, `wall` déduit des fenêtres.
      const next = mergeApartmentDecor(
        resolveApartmentDecor(saved.decor),
        input.decor ?? {}
      );
      saved = { ...saved, decor: next };
      return { ok: true as const, data: { room: saved } };
    });
    const view = render(
      <ApartmentSettings room={saved} saving={false} onSave={onSave} />
    );
    const save = screen.getByRole('button', {
      name: t.settingsSave,
    }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: d.slots.window }));
    fireEvent.click(screen.getByRole('radio', { name: d.windows.arched }));
    fireEvent.click(screen.getByRole('tab', { name: d.slots.door }));
    fireEvent.click(screen.getByRole('radio', { name: d.doors.glazed }));
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(await screen.findByText(t.settingsSaved)).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith({
      decor: { window: 'arched', door: 'glazed' },
    });
    expect(saved.decor).toEqual({
      floor: 'parquet',
      wall: 'window',
      finish: 'library',
      window: 'arched',
      door: 'glazed',
    });

    // « Recharger » : la salle relue, remontée de zéro.
    view.unmount();
    render(<ApartmentSettings room={saved} saving={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole('tab', { name: d.slots.window }));
    expect(
      (
        screen.getByRole('radio', {
          name: d.windows.arched,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    fireEvent.click(screen.getByRole('tab', { name: d.slots.door }));
    expect(
      (screen.getByRole('radio', { name: d.doors.glazed }) as HTMLInputElement)
        .checked
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: t.settingsSave,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(true);
  });

  it('retirer les fenêtres d’un décor du lot 4 : PATCH { window: none }', async () => {
    const onSave = vi.fn(async () => ({
      ok: true as const,
      data: { room: room({}) },
    }));
    render(
      <ApartmentSettings
        room={room({ floor: 'tiles', wall: 'window' })}
        saving={false}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('tab', { name: d.slots.window }));
    fireEvent.click(screen.getByRole('radio', { name: d.windows.none }));
    fireEvent.click(screen.getByRole('tab', { name: d.slots.finish }));
    fireEvent.click(screen.getByRole('radio', { name: d.finishes.paper_deco }));
    fireEvent.click(screen.getByRole('button', { name: t.settingsSave }));
    expect(await screen.findByText(t.settingsSaved)).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith({
      decor: { window: 'none', finish: 'paper_deco' },
    });
  });

  it('décor refusé par l’API : le message de `decor_invalid`', async () => {
    const onSave = vi.fn(async () => ({
      ok: false as const,
      error: { status: 400, code: 'decor_invalid', payload: null },
    }));
    render(
      <ApartmentSettings
        room={room({ floor: 'parquet', wall: 'plain' })}
        saving={false}
        onSave={onSave}
      />
    );
    fireEvent.click(screen.getByRole('radio', { name: d.floors.oak }));
    fireEvent.click(screen.getByRole('button', { name: t.settingsSave }));
    expect(
      await screen.findByText(t.settingsErrors.decor_invalid)
    ).toBeTruthy();
  });
});
