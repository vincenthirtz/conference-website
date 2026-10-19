// @vitest-environment happy-dom
//
// Page publique /securite — « Aide et sécurité » (Women's Library, lot 8a).
//
// Ce que ce fichier protège :
//   - la structure lue par un lecteur d'écran : un h1, un h2 par section, un
//     sommaire nommé dont chaque ancre mène à une section, pas de second
//     <main> (le _app en pose déjà un) ;
//   - chaque numéro est un lien tel:/sms: qui dit son action ;
//   - le guichet ouvre /support en « comportement » avec l'anonymat proposé ;
//   - l'avis « en cours de validation », le `noindex` et la charte vide
//     (aucun faux contenu) tant que l'association n'a pas validé.

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

import SafetyPage from '@/pages/securite';
import { HELPLINES } from '@/components/safety/helplines';
import { QUICK_EXIT_URL } from '@/components/safety/quickExit';
import nsSafetyPage from '@/lib/i18n/locales/fr/safetyPage';
import enSafetyPage from '@/lib/i18n/locales/en/safetyPage';

const t = nsSafetyPage.fr;

afterEach(cleanup);

describe('/securite — structure accessible', () => {
  it('un seul h1, puis un h2 par section, dans l’ordre du sommaire', () => {
    render(<SafetyPage />);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', { level: 1, name: t.heroTitle })
    ).toBeTruthy();
    const h2 = screen
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent);
    expect(h2).toEqual([
      t.emergencyTitle,
      t.harassTitle,
      t.reportTitle,
      t.charterTitle,
      t.exitTitle,
    ]);
  });

  it('pas de <main> dans la page : le _app pose déjà le repère principal', () => {
    const { container } = render(<SafetyPage />);
    expect(container.querySelector('main')).toBeNull();
  });

  it('le sommaire est un repère nommé dont chaque ancre mène à une section titrée', () => {
    const { container } = render(<SafetyPage />);
    const nav = screen.getByRole('navigation', { name: t.tocLabel });
    const links = within(nav).getAllByRole('link');
    expect(links).toHaveLength(5);
    for (const link of links) {
      const id = link.getAttribute('href')!.replace(/^#/, '');
      const section = container.querySelector(`section#${id}`);
      expect(section, `section #${id}`).not.toBeNull();
      const labelledBy = section!.getAttribute('aria-labelledby')!;
      expect(container.querySelector(`#${labelledBy}`)?.textContent).toBe(
        link.textContent
      );
    }
  });
});

describe('/securite — urgences et lignes d’écoute', () => {
  it('chaque numéro est un lien tel: (ou sms: pour le 114) qui dit son action', () => {
    render(<SafetyPage />);
    for (const line of HELPLINES) {
      const name =
        line.kind === 'sms'
          ? t.smsAria.replace('{number}', line.number)
          : t.callAria.replace('{number}', line.number);
      const link = screen.getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(
        `${line.kind === 'sms' ? 'sms' : 'tel'}:${line.number}`
      );
      expect(link.textContent).toBe(line.number);
    }
  });

  it('les numéros attendus sont tous là, et seulement eux', () => {
    expect(HELPLINES.map((l) => l.number)).toEqual([
      '17',
      '112',
      '114',
      '3919',
      '3018',
      '119',
      '3114',
    ]);
  });

  it('la disponibilité n’est affichée que là où elle est sûre (pas pour le 3018)', () => {
    render(<SafetyPage />);
    const card3018 = screen
      .getByRole('link', { name: t.callAria.replace('{number}', '3018') })
      .closest('li')!;
    expect(within(card3018).queryByText(t.availability24)).toBeNull();
    expect(within(card3018).getByText(t.freeLabel)).toBeTruthy();

    const card3919 = screen
      .getByRole('link', { name: t.callAria.replace('{number}', '3919') })
      .closest('li')!;
    expect(within(card3919).getByText(t.availability24)).toBeTruthy();
  });

  it('le 3018 renvoie aussi vers son tchat, dans un nouvel onglet annoncé', () => {
    render(<SafetyPage />);
    const link = screen.getByRole('link', { name: /3018\.fr/ });
    expect(link.getAttribute('href')).toBe('https://3018.fr');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain(t.newTab);
  });
});

describe('/securite — signaler à l’association', () => {
  it('le guichet ouvre /support en « comportement », anonymat proposé', () => {
    render(<SafetyPage />);
    const cta = screen.getByRole('link', { name: t.reportCta });
    expect(cta.getAttribute('href')).toBe(
      '/support?category=behavior&anonymous=1'
    );
    // L'explication du mode anonyme est reliée au bouton.
    const hintId = cta.getAttribute('aria-describedby')!;
    expect(document.getElementById(hintId)?.textContent).toBe(t.reportCtaHint);
  });

  it('une seconde voie, nominative, pour qui veut une réponse', () => {
    render(<SafetyPage />);
    expect(
      screen.getByRole('link', { name: t.reportCtaNamed }).getAttribute('href')
    ).toBe('/support?category=behavior');
  });

  it('rappelle que l’association n’est pas un service d’urgence', () => {
    render(<SafetyPage />);
    expect(screen.getByText(t.reportNotEmergency)).toBeTruthy();
  });
});

describe('/securite — en attente de validation', () => {
  it('affiche l’avis de validation en cours', () => {
    render(<SafetyPage />);
    const notice = screen.getByText(t.validationNotice);
    expect(notice.getAttribute('role')).toBe('note');
  });

  it('la charte n’est qu’un emplacement réservé', () => {
    const { container } = render(<SafetyPage />);
    const section = container.querySelector('section#charte')!;
    expect(section.querySelectorAll('p')).toHaveLength(1);
    expect(section.textContent).toContain(t.charterBody);
  });

  it('noindex, titre et description bilingues', () => {
    const seo = (SafetyPage as { seo?: Record<string, unknown> }).seo!;
    expect(seo.noindex).toBe(true);
    expect(seo.title).toEqual({ fr: 'Aide et sécurité', en: 'Help & safety' });
    expect(seo.description).toHaveProperty('en');
  });
});

describe('/securite — sortie rapide', () => {
  it('le bouton « Quitter vite » est présent et la page explique le raccourci', () => {
    render(<SafetyPage />);
    expect(
      screen.getByRole('link', { name: t.quickExitAria }).getAttribute('href')
    ).toBe(QUICK_EXIT_URL);
    expect(screen.getByText(t.exitBody)).toBeTruthy();
    expect(screen.getByText(t.exitLimit)).toBeTruthy();
  });
});

describe('safetyPage — anglais', () => {
  it('chaque clé a une traduction anglaise non vide, distincte du français', () => {
    const fr = t as Record<string, string>;
    const en = enSafetyPage as Record<string, string>;
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    // Noms propres et fragments qui ne se traduisent pas.
    const same = new Set(['line3919Name']);
    for (const key of Object.keys(fr)) {
      expect(en[key]?.trim(), key).toBeTruthy();
      if (!same.has(key)) expect(en[key], key).not.toBe(fr[key]);
    }
  });

  it('les gabarits gardent leurs marqueurs', () => {
    expect(enSafetyPage.callAria).toContain('{number}');
    expect(enSafetyPage.smsAria).toContain('{number}');
  });
});
