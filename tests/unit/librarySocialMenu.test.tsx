// @vitest-environment happy-dom
//
// Women's Library, lot 5 — le menu d'un avatar (`AvatarContextMenu`) et le
// signalement (`ReportDialog`) : du pur affichage, les gestes arrivent par
// les props.
//   * menu : `role="menu"`, flèches / Début / Fin, Échap et Tab ferment, le
//     focus revient au déclencheur ; « Expulser » SEULEMENT chez soi ;
//   * bloquer : une confirmation qui dit ce que fait un blocage et que
//     l'autre n'en est pas avertie ; le focus va à « Annuler » ;
//   * expulser : 30 min par défaut, la durée choisie part ;
//   * signaler : dialogue modal titré, focus piégé, Échap ferme, motifs avec
//     aide, compteur, confidentialité, référence au succès, message au refus.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { useRef, useState } from 'react';
import AvatarContextMenu, {
  type AvatarContextMenuProps,
} from '../../features/player/library/ui/social/AvatarContextMenu';
import ReportDialog, {
  type ReportDialogProps,
} from '../../features/player/library/ui/social/ReportDialog';
import nsSocial from '../../lib/i18n/locales/fr/playerLibrarySocial';
import { format } from '../../lib/i18n/useT';
import { LIBRARY_REPORT_DETAILS_MAX } from '../../features/player/library/socialSchemas';

afterEach(cleanup);

const t = nsSocial.fr;
const IRIS = {
  userId: '00000000-0000-4000-8000-000000000011',
  nickname: 'Iris',
};
const ROOM_ID = '00000000-0000-4000-8000-0000000000b1';
const UNTIL = '2026-10-20T15:30:00.000Z';

type MenuOverrides = Partial<AvatarContextMenuProps>;

/** Un déclencheur (la ligne de l'avatar) qui ouvre le menu, comme l'écran. */
function MenuHarness(props: MenuOverrides & { initiallyOpen?: boolean }) {
  const [open, setOpen] = useState(props.initiallyOpen ?? false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <div>
      <button ref={trigger} type="button" onClick={() => setOpen(true)}>
        open-menu
      </button>
      <button type="button">elsewhere</button>
      {open && (
        <AvatarContextMenu
          target={IRIS}
          room={{ kind: 'hall', isOwner: false }}
          onBlock={async (userId) => ({
            ok: true,
            data: { userId, blocked: true },
          })}
          onKick={async (userId) => ({
            ok: true,
            data: { kicked: true, userId, until: UNTIL },
          })}
          onReport={() => {}}
          {...props}
          onClose={() => {
            props.onClose?.();
            setOpen(false);
          }}
          returnFocusRef={trigger}
        />
      )}
    </div>
  );
}

function openMenu(props: MenuOverrides = {}) {
  render(<MenuHarness {...props} />);
  const trigger = screen.getByRole('button', { name: 'open-menu' });
  trigger.focus();
  fireEvent.click(trigger);
  return { trigger, menu: screen.getByRole('menu') };
}

describe('AvatarContextMenu — le menu', () => {
  it('porte le pseudo, se nomme, et donne le focus à la première entrée', () => {
    const { menu } = openMenu();
    expect(screen.getByText('Iris')).toBeTruthy();
    expect(menu.getAttribute('aria-label')).toBe(
      format(t.menu.label, { nickname: 'Iris' })
    );
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      t.menu.block,
      t.menu.report,
    ]);
    expect(document.activeElement).toBe(items[0]);
  });

  it('« Expulser » seulement dans SON appartement', () => {
    const cases: Array<[AvatarContextMenuProps['room'], boolean]> = [
      [{ kind: 'apartment', isOwner: true }, true],
      [{ kind: 'apartment', isOwner: false }, false],
      [{ kind: 'hall', isOwner: true }, false],
      [{ kind: 'reading_room', isOwner: false }, false],
    ];
    for (const [room, kick] of cases) {
      const { unmount } = render(<MenuHarness initiallyOpen room={room} />);
      expect(
        screen.queryByRole('menuitem', { name: t.menu.kick }) !== null
      ).toBe(kick);
      unmount();
    }
  });

  it('flèches haut / bas (en boucle), Début, Fin', () => {
    const { menu } = openMenu({ room: { kind: 'apartment', isOwner: true } });
    const items = within(menu).getAllByRole('menuitem');
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'End' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[2]);
    fireEvent.keyDown(document.activeElement as Element, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);
  });

  it('Échap ferme et rend le focus au déclencheur', async () => {
    const onClose = vi.fn();
    const { trigger } = openMenu({ onClose });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('Tab ferme le menu (le focus revient au déclencheur)', async () => {
    const { trigger } = openMenu();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('un appui hors du menu le ferme', () => {
    const onClose = vi.fn();
    openMenu({ onClose });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'elsewhere' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('« Signaler » confie le signalement au parent', () => {
    const onReport = vi.fn();
    openMenu({ onReport });
    fireEvent.click(screen.getByRole('menuitem', { name: t.menu.report }));
    expect(onReport).toHaveBeenCalledWith(IRIS);
  });
});

describe('AvatarContextMenu — bloquer', () => {
  it('la confirmation dit ce que fait un blocage, et qu’elle n’est pas avertie', () => {
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.menu.block }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(
      within(dialog).getByRole('heading', {
        name: format(t.menu.blockTitle, { nickname: 'Iris' }),
      })
    ).toBeTruthy();
    expect(dialog.textContent).toContain(t.menu.blockBody);
    expect(dialog.textContent).toContain(
      format(t.menu.blockSilent, { nickname: 'Iris' })
    );
    // Le geste le moins lourd a le focus.
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: t.menu.cancel })
    );
  });

  it('Échap revient au menu, sur « Bloquer »', () => {
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.menu.block }));
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole('menuitem', { name: t.menu.block })
    );
  });

  it('Tab tourne dans la confirmation', () => {
    openMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: t.menu.block }));
    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', {
      name: t.menu.blockConfirm,
    });
    confirm.focus();
    fireEvent.keyDown(confirm, { key: 'Tab' });
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: t.menu.cancel })
    );
  });

  it('confirmé : `onBlock(userId)`, puis le message de fin', async () => {
    const onBlock = vi.fn(async (userId: string) => ({
      ok: true as const,
      data: { userId, blocked: true },
    }));
    openMenu({ onBlock });
    fireEvent.click(screen.getByRole('menuitem', { name: t.menu.block }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: t.menu.blockConfirm })
      );
    });
    expect(onBlock).toHaveBeenCalledWith(IRIS.userId);
    expect(screen.getByRole('status').textContent).toBe(
      format(t.menu.blockDone, { nickname: 'Iris' })
    );
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: t.menu.close })
    );
  });

  it('refusé : le message du code, on reste sur la confirmation', async () => {
    openMenu({
      onBlock: async () => ({
        ok: false,
        error: new Error('x'),
        code: 'player_not_found',
      }),
    });
    fireEvent.click(screen.getByRole('menuitem', { name: t.menu.block }));
    await act(async () => {
      fireEvent.click(
        screen.getByRole('button', { name: t.menu.blockConfirm })
      );
    });
    expect(screen.getByRole('alert').textContent).toBe(
      t.codes.player_not_found
    );
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });
});

describe('AvatarContextMenu — expulser', () => {
  it('30 min par défaut ; la durée choisie part ; la fin est datée', async () => {
    const onKick = vi.fn(async (userId: string) => ({
      ok: true as const,
      data: { kicked: true as const, userId, until: UNTIL },
    }));
    openMenu({ room: { kind: 'apartment', isOwner: true }, onKick });
    fireEvent.click(screen.getByRole('menuitem', { name: t.menu.kick }));
    const dialog = screen.getByRole('dialog');
    const thirty = within(dialog).getByRole('radio', {
      name: t.menu.kickDurations.min30,
    }) as HTMLInputElement;
    expect(thirty.checked).toBe(true);
    expect(document.activeElement).toBe(thirty);
    fireEvent.click(
      within(dialog).getByRole('radio', { name: t.menu.kickDurations.hours24 })
    );
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: t.menu.kickConfirm })
      );
    });
    expect(onKick).toHaveBeenCalledWith(IRIS.userId, 1440);
    const done = screen.getByRole('status').textContent ?? '';
    expect(done).toContain('Iris');
    expect(done).toContain('20 octobre');
  });
});

describe('ReportDialog', () => {
  function Harness(
    props: Partial<ReportDialogProps> & { onClosed?: () => void }
  ) {
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    return (
      <div>
        <button ref={trigger} type="button" onClick={() => setOpen(true)}>
          open-report
        </button>
        {open && (
          <ReportDialog
            target={IRIS}
            roomId={ROOM_ID}
            onSubmit={async () => ({
              ok: true,
              data: { reported: true, referenceShort: 'ab12cd34' },
            })}
            {...props}
            onClose={() => {
              props.onClosed?.();
              setOpen(false);
            }}
            returnFocusRef={trigger}
          />
        )}
      </div>
    );
  }

  function openReport(
    props: Partial<ReportDialogProps> & { onClosed?: () => void } = {}
  ) {
    render(<Harness {...props} />);
    const trigger = screen.getByRole('button', { name: 'open-report' });
    trigger.focus();
    fireEvent.click(trigger);
    return { trigger, dialog: screen.getByRole('dialog') };
  }

  it('modal, titré, focus sur le premier motif ; chaque motif a son aide', () => {
    const { dialog } = openReport();
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(
      within(dialog).getByRole('heading', {
        name: format(t.report.title, { nickname: 'Iris' }),
      })
    ).toBeTruthy();
    const radios = within(dialog).getAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(document.activeElement).toBe(radios[0]);
    const minor = within(dialog).getByRole('radio', {
      name: new RegExp(t.report.reasons.minor.label),
    });
    const helpId = minor.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(helpId)?.textContent).toBe(
      t.report.reasons.minor.help
    );
    expect(t.report.reasons.minor.help).toMatch(/bannir/);
  });

  it('confidentialité, lien vers /securite (nouvel onglet), compteur borné', () => {
    const { dialog } = openReport();
    expect(dialog.textContent).toContain(t.report.confidential);
    const link = within(dialog).getByRole('link', {
      name: new RegExp(t.report.safetyLink),
    });
    expect(link.getAttribute('href')).toBe('/securite');
    expect(link.getAttribute('target')).toBe('_blank');
    const details = within(dialog).getByRole('textbox', {
      name: t.report.detailsLabel,
    }) as HTMLTextAreaElement;
    expect(details.maxLength).toBe(LIBRARY_REPORT_DETAILS_MAX);
    fireEvent.change(details, { target: { value: 'abc' } });
    expect(dialog.textContent).toContain(
      format(t.report.counter, { count: 3, max: LIBRARY_REPORT_DETAILS_MAX })
    );
  });

  it('pas d’envoi sans motif ; l’envoi porte la cible, la salle, le motif, les précisions nettoyées', async () => {
    const onSubmit = vi.fn(async () => ({
      ok: true as const,
      data: { reported: true as const, referenceShort: 'ab12cd34' },
    }));
    const { dialog } = openReport({ onSubmit });
    const submit = within(dialog).getByRole('button', {
      name: t.report.submit,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(
      within(dialog).getByRole('radio', {
        name: new RegExp(t.report.reasons.minor.label),
      })
    );
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: t.report.detailsLabel }),
      { target: { value: '  dans le hall  ' } }
    );
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(onSubmit).toHaveBeenCalledWith({
      userId: IRIS.userId,
      roomId: ROOM_ID,
      reason: 'minor',
      details: 'dans le hall',
    });
    expect(dialog.textContent).toContain(
      format(t.report.reference, { reference: 'ab12cd34' })
    );
    expect(document.activeElement).toBe(
      within(dialog).getByRole('button', { name: t.report.close })
    );
  });

  it('des précisions vides ne partent pas', async () => {
    const onSubmit = vi.fn(async () => ({
      ok: true as const,
      data: { reported: true as const, referenceShort: 'ab12cd34' },
    }));
    const { dialog } = openReport({ onSubmit });
    fireEvent.click(within(dialog).getAllByRole('radio')[0]);
    fireEvent.change(
      within(dialog).getByRole('textbox', { name: t.report.detailsLabel }),
      { target: { value: '   ' } }
    );
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: t.report.submit })
      );
    });
    expect(onSubmit).toHaveBeenCalledWith({
      userId: IRIS.userId,
      roomId: ROOM_ID,
      reason: 'harassment',
    });
  });

  it('refusé : le message du code, le formulaire reste', async () => {
    const { dialog } = openReport({
      onSubmit: async () => ({
        ok: false,
        error: new Error('x'),
        code: 'report_failed',
      }),
    });
    fireEvent.click(within(dialog).getAllByRole('radio')[0]);
    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: t.report.submit })
      );
    });
    expect(within(dialog).getByRole('alert').textContent).toBe(
      t.codes.report_failed
    );
    expect(within(dialog).getAllByRole('radio')).toHaveLength(4);
  });

  it('Tab et Maj+Tab tournent dans le dialogue', () => {
    const { dialog } = openReport();
    const radios = within(dialog).getAllByRole('radio');
    fireEvent.click(radios[1]);
    const submit = within(dialog).getByRole('button', {
      name: t.report.submit,
    });
    submit.focus();
    fireEvent.keyDown(submit, { key: 'Tab' });
    expect(document.activeElement).toBe(radios[0]);
    fireEvent.keyDown(radios[0], { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(submit);
  });

  it('Échap ferme et rend le focus au déclencheur', async () => {
    const onClosed = vi.fn();
    const { trigger } = openReport({ onClosed });
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    expect(onClosed).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});
