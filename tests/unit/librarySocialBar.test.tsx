// @vitest-environment happy-dom
//
// Women's Library, lot 5 — la barre des signes (`EmoteBar`), le mode discret
// (`DiscreetToggle`) et la notice qui remplace la salle (`SocialNotice`).
//   * la barre propose ce que la salle PERMET (salle de lecture : deux emotes
//     douces, aucune phrase), s'éteint avec sa raison, et un envoi refusé
//     (cadence) donne un mot discret, jamais un toast ;
//   * barre d'outils : un seul arrêt de tabulation, flèches / Début / Fin ;
//   * le mode discret n'existe que dans la salle de lecture et explique ce
//     qu'il fait ;
//   * les notices : dates au format du site, lien vers /support pour une
//     bannie, et AUCUN mot qui laisserait deviner un blocage.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import EmoteBar from '../../features/player/library/ui/social/EmoteBar';
import DiscreetToggle from '../../features/player/library/ui/social/DiscreetToggle';
import SocialNotice from '../../features/player/library/ui/social/SocialNotice';
import type { SocialNoticeModel } from '../../features/player/library/socialModel';
import nsSocial from '../../lib/i18n/locales/fr/playerLibrarySocial';
import enSocial from '../../lib/i18n/locales/en/playerLibrarySocial';
import { formatSiteDate } from '../../utils/timezone';

afterEach(cleanup);

const t = nsSocial.fr;
const UNTIL = '2026-10-20T15:30:00.000Z';

describe('EmoteBar', () => {
  it('hall : les cinq emotes et les six phrases, libellées', () => {
    render(
      <EmoteBar
        roomKind="hall"
        disabledReason={null}
        onEmote={() => true}
        onPhrase={() => true}
      />
    );
    const bar = screen.getByRole('toolbar', { name: t.emoteBar.label });
    const emotes = within(bar).getByRole('group', {
      name: t.emoteBar.emotesGroup,
    });
    const phrases = within(bar).getByRole('group', {
      name: t.emoteBar.phrasesGroup,
    });
    expect(
      within(emotes)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(
      [
        t.emotes.wave,
        t.emotes.clap,
        t.emotes.heart,
        t.emotes.laugh,
        t.emotes.dance,
      ].map((label) => expect.stringContaining(label))
    );
    expect(
      within(phrases)
        .getAllByRole('button')
        .map((b) => b.textContent)
    ).toEqual(['Salut !', 'GG', 'On joue ?', 'Merci', 'À plus', 'Bienvenue']);
  });

  it('salle de lecture : deux emotes douces, aucune phrase, et on le dit', () => {
    render(
      <EmoteBar
        roomKind="reading_room"
        disabledReason={null}
        onEmote={() => true}
        onPhrase={() => true}
      />
    );
    const bar = screen.getByRole('toolbar');
    expect(within(bar).getAllByRole('button')).toHaveLength(2);
    expect(
      within(bar).queryByRole('group', { name: t.emoteBar.phrasesGroup })
    ).toBeNull();
    const silent = screen.getByText(t.emoteBar.silentRoom);
    expect(bar.getAttribute('aria-describedby')).toContain(silent.id);
  });

  it('un clic envoie l’identifiant, jamais du texte', () => {
    const onEmote = vi.fn(() => true);
    const onPhrase = vi.fn(() => true);
    render(
      <EmoteBar
        roomKind="hall"
        disabledReason={null}
        onEmote={onEmote}
        onPhrase={onPhrase}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /Applaudir/ }));
    fireEvent.click(screen.getByRole('button', { name: 'On joue ?' }));
    expect(onEmote).toHaveBeenCalledWith('clap');
    expect(onPhrase).toHaveBeenCalledWith('play');
  });

  it('un envoi refusé (cadence) : un mot discret dans la zone status, un seul', () => {
    render(
      <EmoteBar
        roomKind="hall"
        disabledReason={null}
        onEmote={() => false}
        onPhrase={() => false}
      />
    );
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('');
    fireEvent.click(screen.getByRole('button', { name: /Saluer/ }));
    fireEvent.click(screen.getByRole('button', { name: /Saluer/ }));
    fireEvent.click(screen.getByRole('button', { name: 'GG' }));
    expect(status.textContent).toBe(t.emoteBar.tooFast);
    expect(screen.queryAllByText(t.emoteBar.tooFast)).toHaveLength(1);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('le mot discret s’efface de lui-même', () => {
    vi.useFakeTimers();
    try {
      render(
        <EmoteBar
          roomKind="hall"
          disabledReason={null}
          onEmote={() => false}
          onPhrase={() => false}
        />
      );
      fireEvent.click(screen.getByRole('button', { name: /Saluer/ }));
      expect(screen.getByRole('status').textContent).toBe(t.emoteBar.tooFast);
      act(() => {
        vi.advanceTimersByTime(2_500);
      });
      expect(screen.getByRole('status').textContent).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('éteinte (discrète) : rien ne part, la raison est dite et liée', () => {
    const onEmote = vi.fn(() => true);
    render(
      <EmoteBar
        roomKind="reading_room"
        disabledReason="discreet"
        onEmote={onEmote}
        onPhrase={() => true}
      />
    );
    const wave = screen.getByRole('button', { name: /Saluer/ });
    expect(wave.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(wave);
    expect(onEmote).not.toHaveBeenCalled();
    const reason = screen.getByText(t.emoteBar.disabled.discreet);
    expect(
      screen.getByRole('toolbar').getAttribute('aria-describedby')
    ).toContain(reason.id);
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('un seul arrêt de tabulation ; flèches (en boucle), Début, Fin', () => {
    render(
      <EmoteBar
        roomKind="hall"
        disabledReason={null}
        onEmote={() => true}
        onPhrase={() => true}
      />
    );
    const buttons = within(screen.getByRole('toolbar')).getAllByRole('button');
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    expect(buttons[0].tabIndex).toBe(0);
    buttons[0].focus();
    fireEvent.keyDown(buttons[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[1]);
    expect(buttons[1].tabIndex).toBe(0);
    expect(buttons[0].tabIndex).toBe(-1);
    fireEvent.keyDown(buttons[1], { key: 'End' });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(buttons[buttons.length - 1], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(buttons[0], { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    fireEvent.keyDown(buttons[buttons.length - 1], { key: 'Home' });
    expect(document.activeElement).toBe(buttons[0]);
  });
});

describe('DiscreetToggle', () => {
  it('rien hors de la Grande salle de lecture', () => {
    const { container } = render(
      <DiscreetToggle roomKind="hall" visible onChange={() => {}} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('discrète : l’explique, et « Être visible » se montre', () => {
    const onChange = vi.fn();
    render(
      <DiscreetToggle
        roomKind="reading_room"
        visible={false}
        onChange={onChange}
      />
    );
    const stay = screen.getByRole('radio', {
      name: t.discreet.stay,
    }) as HTMLInputElement;
    expect(stay.checked).toBe(true);
    const group = screen.getByRole('group', { name: t.discreet.legend });
    const explain = screen.getByText(t.discreet.explainDiscreet);
    expect(group.getAttribute('aria-describedby')).toBe(explain.id);
    fireEvent.click(screen.getByRole('radio', { name: t.discreet.show }));
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('visible : l’explique, et « Rester discrète » redevient discrète', () => {
    const onChange = vi.fn();
    render(
      <DiscreetToggle roomKind="reading_room" visible onChange={onChange} />
    );
    expect(screen.getByText(t.discreet.explainVisible)).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: t.discreet.stay }));
    expect(onChange).toHaveBeenCalledWith(false);
  });

  it('`canBeVisible: false` : se montrer est impossible, et on le dit', () => {
    render(
      <DiscreetToggle
        roomKind="reading_room"
        visible={false}
        canBeVisible={false}
        onChange={() => {}}
      />
    );
    const show = screen.getByRole('radio', {
      name: t.discreet.show,
    }) as HTMLInputElement;
    expect(show.disabled).toBe(true);
    expect(screen.getByText(t.discreet.cannotShow)).toBeTruthy();
  });
});

describe('SocialNotice', () => {
  const when = formatSiteDate(UNTIL, 'fr', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });

  const show = (notice: SocialNoticeModel, action?: ReactNode) =>
    render(<SocialNotice notice={notice} action={action} />);

  it('expulsée : jusqu’à quand (date du site), focus sur le titre', () => {
    show({ kind: 'kicked', until: UNTIL });
    const title = screen.getByRole('heading', { name: t.notice.kickedTitle });
    expect(document.activeElement).toBe(title);
    expect(when).toContain('20 octobre');
    expect(screen.getByText(new RegExp(when)).textContent).toContain(
      t.notice.kickedBody.split('{until}')[0]
    );
  });

  it('entrée refusée pendant une expulsion : avec ou sans échéance', () => {
    const { unmount } = show({ kind: 'kickedEnter', until: UNTIL });
    expect(screen.getByText(new RegExp(when))).toBeTruthy();
    unmount();
    show({ kind: 'kickedEnter', until: null });
    expect(screen.getByText(t.notice.kickedEnterLater)).toBeTruthy();
  });

  it('bannie : jusqu’à quand ou sans date, et le lien vers /support', () => {
    const { unmount } = show({ kind: 'banned', until: UNTIL });
    expect(screen.getByText(new RegExp(when))).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: t.notice.supportLink })
        .getAttribute('href')
    ).toBe('/support');
    unmount();
    show({ kind: 'banned', until: null });
    expect(screen.getByText(t.notice.bannedBody)).toBeTruthy();
  });

  it('salle refermée ou refusée : neutre, AUCUN mot sur un blocage (FR et EN)', () => {
    for (const kind of ['closed', 'forbidden'] as const) {
      const { container, unmount } = show({ kind });
      expect(container.textContent).not.toMatch(/bloqu|block/i);
      expect(container.querySelector('a')).toBeNull();
      unmount();
    }
    expect(screen.queryByText(/bloqu/i)).toBeNull();
    const n = enSocial.notice;
    for (const text of [n.closedTitle, n.forbiddenTitle, n.elsewhere]) {
      expect(text).not.toMatch(/block/i);
    }
    expect(enSocial.codes.room_forbidden).not.toMatch(/block/i);
    expect(t.codes.room_forbidden).not.toMatch(/bloqu/i);
  });

  it('introuvable, connexion, erreur ; le geste offert par le parent', () => {
    for (const [kind, title] of [
      ['notFound', t.notice.notFoundTitle],
      ['connection', t.notice.connectionTitle],
      ['error', t.notice.errorTitle],
    ] as const) {
      const { unmount } = show({ kind }, <button type="button">retry</button>);
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'retry' })).toBeTruthy();
      unmount();
    }
  });
});
