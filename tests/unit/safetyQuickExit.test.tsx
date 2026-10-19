// @vitest-environment happy-dom
//
// Sortie rapide de /securite : le bouton « Quitter vite » et le raccourci
// Échap ×2. Ce qui compte : la page est REMPLACÉE (location.replace, pas de
// retour possible), le raccourci ne part ni sur un seul appui, ni sur deux
// appuis trop espacés, ni quand on tape dans un champ.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import SafetyQuickExit from '@/components/safety/SafetyQuickExit';
import {
  DOUBLE_ESCAPE_WINDOW_MS,
  QUICK_EXIT_URL,
  createDoubleEscapeDetector,
  isEditableTarget,
  quickExit,
} from '@/components/safety/quickExit';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';

const t = nsSafetyPage.fr;

afterEach(cleanup);

describe('quickExit', () => {
  it('remplace la page courante par la page neutre', () => {
    const replace = vi.fn();
    quickExit({ replace });
    expect(replace).toHaveBeenCalledWith(QUICK_EXIT_URL);
  });

  it('la page neutre est en https, hors du site', () => {
    expect(QUICK_EXIT_URL).toMatch(/^https:\/\//);
    expect(QUICK_EXIT_URL).not.toMatch(/owwomenscup/);
  });
});

describe('createDoubleEscapeDetector', () => {
  it('un seul appui ne déclenche pas', () => {
    const isDouble = createDoubleEscapeDetector(1000);
    expect(isDouble(10_000)).toBe(false);
  });

  it('deux appuis dans la fenêtre déclenchent', () => {
    const isDouble = createDoubleEscapeDetector(1000);
    isDouble(10_000);
    expect(isDouble(10_900)).toBe(true);
  });

  it('deux appuis trop espacés ne déclenchent pas', () => {
    const isDouble = createDoubleEscapeDetector(1000);
    isDouble(10_000);
    expect(isDouble(11_500)).toBe(false);
  });

  it('repart de zéro après un déclenchement', () => {
    const isDouble = createDoubleEscapeDetector(1000);
    isDouble(10_000);
    expect(isDouble(10_100)).toBe(true);
    expect(isDouble(10_200)).toBe(false);
  });
});

describe('isEditableTarget', () => {
  it('reconnaît les champs de saisie', () => {
    expect(isEditableTarget(document.createElement('input'))).toBe(true);
    expect(isEditableTarget(document.createElement('textarea'))).toBe(true);
    expect(isEditableTarget(document.createElement('select'))).toBe(true);
    expect(isEditableTarget(document.createElement('a'))).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });
});

describe('<SafetyQuickExit />', () => {
  let now = 1_000_000;
  beforeEach(() => {
    now = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('un lien visible, nommé, vers la page neutre — même sans JavaScript', () => {
    render(<SafetyQuickExit onExit={vi.fn()} />);
    const link = screen.getByRole('link', { name: t.quickExitAria });
    expect(link.getAttribute('href')).toBe(QUICK_EXIT_URL);
    expect(link.textContent).toContain(t.quickExitButton);
    // Pas de referrer : la page neutre n'apprend pas d'où l'on vient.
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('le clic passe par la sortie (replace), pas par la navigation du lien', () => {
    const onExit = vi.fn();
    render(<SafetyQuickExit onExit={onExit} />);
    const link = screen.getByRole('link', { name: t.quickExitAria });
    const notPrevented = fireEvent.click(link);
    expect(onExit).toHaveBeenCalledOnce();
    expect(notPrevented).toBe(false);
  });

  it('Échap ×2 rapide quitte la page', () => {
    const onExit = vi.fn();
    render(<SafetyQuickExit onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
    now += DOUBLE_ESCAPE_WINDOW_MS - 100;
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).toHaveBeenCalledOnce();
  });

  it('Échap ×2 trop lent, ou une autre touche, ne fait rien', () => {
    const onExit = vi.fn();
    render(<SafetyQuickExit onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    now += DOUBLE_ESCAPE_WINDOW_MS + 500;
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('une touche maintenue (repeat) ne compte pas comme un second appui', () => {
    const onExit = vi.fn();
    render(<SafetyQuickExit onExit={onExit} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape', repeat: true });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('Échap dans un champ de saisie est laissé au champ', () => {
    const onExit = vi.fn();
    render(
      <>
        <input aria-label="champ" />
        <SafetyQuickExit onExit={onExit} />
      </>
    );
    const input = screen.getByLabelText('champ');
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
  });

  it('l’écouteur clavier est retiré au démontage', () => {
    const onExit = vi.fn();
    const { unmount } = render(<SafetyQuickExit onExit={onExit} />);
    unmount();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onExit).not.toHaveBeenCalled();
  });
});
