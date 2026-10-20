// @vitest-environment happy-dom
//
// Women's Library, lot 13 — l'éditeur de l'avatar composé
// (features/player/library/ui/avatar/AvatarChooser.tsx), rendu seul, avec un
// enregistrement simulé. Ce que ces cas protègent :
//   * le départ : le look enregistré, sinon celui de l'avatar d'origine ;
//   * des choix ACCESSIBLES : des radios nommées (couleurs comprises, par leur
//     nom), groupées par calque ;
//   * n'envoyer que ce qui change (`look` seul, pseudo seul) ;
//   * au hasard, avatars d'origine, annulation, et le refus `look_invalid`.
// L'aperçu (canvas, chargé à la demande) est remplacé par un témoin qui
// montre le look compact reçu.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';

vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () =>
      function LookPreviewStub(props: { code: string; label: string }) {
        return React.createElement('div', {
          'data-testid': 'look-preview',
          'data-code': props.code,
          'aria-label': props.label,
          role: 'img',
        });
      },
  };
});

import AvatarChooser from '../../features/player/library/ui/avatar/AvatarChooser';
import {
  decodeLibraryLook,
  encodeLibraryLook,
  LIBRARY_AVATAR_PRESETS,
  type LibraryAvatarLook,
} from '../../config/library/avatarLook';
import type { LibraryAvatarView } from '../../features/player/library/responses';
import nsPlayerLibrary from '../../lib/i18n/locales/fr/playerLibrary';
import { format } from '../../lib/i18n/useT';
import { renderPlayer } from './__helpers__/playerHarness';

const t = nsPlayerLibrary.fr;
const l = t.look;
const IDS = ['a01', 'a02', 'a03'];

afterEach(cleanup);

function setup(
  avatar: LibraryAvatarView,
  result: { ok: true } | { ok: false; code: string } = { ok: true }
) {
  const onSave = vi.fn(async () =>
    result.ok
      ? ({ ok: true, data: { avatar } } as const)
      : ({ ok: false, error: { status: 400, code: result.code } } as const)
  );
  renderPlayer(
    <AvatarChooser
      avatar={avatar}
      avatarIds={IDS}
      manifest={null}
      saving={false}
      onSave={onSave}
    />
  );
  return { onSave };
}

const previewLook = () =>
  decodeLibraryLook(
    screen.getByTestId('look-preview').getAttribute('data-code')
  ) as LibraryAvatarLook;

const group = (field: string) => screen.getByTestId(`library-look-${field}`);
const radio = (field: string, name: string) =>
  within(group(field)).getByRole('radio', { name }) as HTMLInputElement;

describe('l’éditeur d’avatar', () => {
  it('part du look de l’avatar d’origine, choix cochés et nommés', () => {
    setup({ nickname: 'Lune', avatarId: 'a03', look: {} });
    const a03 = LIBRARY_AVATAR_PRESETS.a03;
    expect(previewLook()).toEqual(a03);
    expect(radio('skin', l.skins.s1).checked).toBe(true);
    expect(radio('hair', l.hairs.long).checked).toBe(true);
    expect(radio('hairColor', l.hairColors.honey).checked).toBe(true);
    expect(radio('outfit', l.outfits.longsleeve).checked).toBe(true);
    expect(radio('outfitColor', l.outfitColors.sky).checked).toBe(true);
    expect(radio('bottomColor', l.outfitColors.beige).checked).toBe(true);
    // Chaque groupe a son nom ; l'aperçu est décrit.
    expect(
      screen.getByRole('group', { name: new RegExp(`^${l.fields.skin}`) })
    ).toBeTruthy();
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain(
      l.hairs.long
    );
    // Rien n'a changé : pas d'enregistrement possible.
    expect(
      (screen.getByRole('button', { name: t.avatarSave }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('part du look ENREGISTRÉ quand il y en a un', () => {
    const saved = { ...LIBRARY_AVATAR_PRESETS.a02, hair: 'afro' as const };
    setup({ nickname: 'Lune', avatarId: 'a02', look: saved });
    expect(previewLook()).toEqual(saved);
  });

  it('change une coiffure : seul le look part, l’aperçu suit', async () => {
    const { onSave } = setup({ nickname: 'Lune', avatarId: 'a03', look: {} });
    fireEvent.click(radio('hair', l.hairs.braid));
    expect(previewLook().hair).toBe('braid');
    expect(screen.getByText(l.changed)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t.avatarSave }));
    expect(await screen.findByText(t.avatarSaved)).toBeTruthy();
    expect(onSave).toHaveBeenCalledWith({
      look: { ...LIBRARY_AVATAR_PRESETS.a03, hair: 'braid' },
    });
  });

  it('le pseudo seul part sans le look', async () => {
    const { onSave } = setup({ nickname: 'Lune', avatarId: 'a03', look: {} });
    fireEvent.change(screen.getByLabelText(t.nicknameLabel), {
      target: { value: 'Étoile' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.avatarSave }));
    await screen.findByText(t.avatarSaved);
    expect(onSave).toHaveBeenCalledWith({ nickname: 'Étoile' });
  });

  it('le foulard prend « couleur du foulard » pour sa teinte', () => {
    setup({ nickname: 'Lune', avatarId: 'a03', look: {} });
    fireEvent.click(radio('hair', l.hairs.headscarf));
    expect(
      within(group('hairColor')).getByText(l.scarfColor, { exact: false })
    ).toBeTruthy();
  });

  it('au hasard, un avatar d’origine, puis annuler', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    setup({ nickname: 'Lune', avatarId: 'a03', look: {} });
    fireEvent.click(screen.getByTestId('library-look-random'));
    expect(previewLook()).toMatchObject({
      skin: 's6',
      hair: 'headscarf',
      outfit: 'track',
      outfitColor: 'purple',
    });
    random.mockRestore();

    const a01 = screen.getByRole('button', {
      name: format(l.presetOption, { n: 1 }),
    });
    fireEvent.click(a01);
    expect(previewLook()).toEqual(LIBRARY_AVATAR_PRESETS.a01);
    expect(a01.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: l.reset }));
    expect(encodeLibraryLook(previewLook())).toBe(
      encodeLibraryLook(LIBRARY_AVATAR_PRESETS.a03)
    );
    expect(screen.queryByRole('button', { name: l.reset })).toBeNull();
  });

  it('un refus look_invalid est traduit', async () => {
    setup(
      { nickname: 'Lune', avatarId: 'a03', look: {} },
      { ok: false, code: 'look_invalid' }
    );
    fireEvent.click(radio('outfitColor', l.outfitColors.coral));
    fireEvent.click(screen.getByRole('button', { name: t.avatarSave }));
    expect(await screen.findByText(t.avatarErrors.look_invalid)).toBeTruthy();
  });

  it('les couleurs se choisissent au clavier dans leur groupe', () => {
    setup({ nickname: 'Lune', avatarId: 'a03', look: {} });
    const radios = within(group('bottomColor')).getAllByRole('radio');
    // Un seul groupe radio par calque : les flèches y circulent (natif).
    const names = new Set(radios.map((r) => (r as HTMLInputElement).name));
    expect(names.size).toBe(1);
    expect(radios).toHaveLength(16);
    fireEvent.click(radios[1]);
    expect(previewLook().bottomColor).toBe('black');
  });
});
