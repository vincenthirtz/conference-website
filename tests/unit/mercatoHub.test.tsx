// @vitest-environment happy-dom
//
// Hub mercato (/mercato) — côté écran, contre des réponses figées des routes
// publiques (les routes et la logique des filtres sont testées dans
// conference-api : tests/unit/mercato*.test.ts ; formes de
// utils/freePlayers.ts / utils/teamOpenings.ts, copies synchronisées).
//
// Ce que ces cas protègent :
//   1. La limite des 50 mots est visible en direct, et bloque l'envoi.
//   2. Le formulaire joueuse envoie les champs du mercato (et pas `roles`,
//      déduit par l'API), genre « préfère ne pas dire » par défaut.
//   3. Les listes appliquent les filtres du hub ; le genre n'est affiché que
//      s'il a été choisi ; une équipe « mixte » répond à tout genre.
//   4. Les anciennes URL mènent au bon onglet ; l'onglet se lit dans l'URL.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import path from 'node:path';
import { useState } from 'react';

const router = vi.hoisted(() => ({
  pathname: '/mercato',
  query: {} as Record<string, string>,
  isReady: true,
  replace: vi.fn(),
  push: vi.fn(),
}));
vi.mock('next/router', () => ({ useRouter: () => router }));
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({ user: null, token: null, loading: false }),
}));

import nsMercato from '@/lib/i18n/locales/fr/mercato';
import { WordLimitedTextarea } from '@/components/Mercato/MercatoFields';
import JoinAsPlayerForm from '@/components/FreePlayers/JoinAsPlayerForm';
import FreePlayersList from '@/components/FreePlayers/FreePlayersList';
import TeamOpeningsList from '@/components/TeamOpenings/TeamOpeningsList';
import MercatoPage from '@/pages/mercato';
import type { PublicFreePlayer } from '@/utils/freePlayers';
import type { PublicTeamOpening } from '@/utils/teamOpenings';

const tm = nsMercato.fr;
const words = (n: number) =>
  Array.from({ length: n }, (_, i) => `mot${i}`).join(' ');

type Call = { url: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let players: PublicFreePlayer[] = [];
let openings: PublicTeamOpening[] = [];

function json(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })
  );
}

beforeEach(() => {
  calls = [];
  players = [];
  openings = [];
  router.query = {};
  router.replace.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const body =
        typeof init?.body === 'string' ? JSON.parse(init.body) : null;
      calls.push({ url, body });
      if (url.startsWith('/api/captcha')) {
        return json({ token: 'tok', question: '2 + 2' });
      }
      if (url.startsWith('/api/public/free-players')) {
        return init?.method === 'POST'
          ? json({ success: true })
          : json({ players, count: players.length });
      }
      if (url.startsWith('/api/public/team-openings')) {
        return json({ openings, count: openings.length });
      }
      return json({}, 404);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function player(over: Partial<PublicFreePlayer>): PublicFreePlayer {
  return {
    id: 'p',
    name: 'Nova',
    roles: [],
    level: null,
    availability: null,
    note: null,
    since: null,
    gender: null,
    rankDivision: null,
    platforms: [],
    inputs: [],
    mainRole: null,
    positions: [],
    pastTeams: null,
    goals: null,
    ...over,
  };
}

function opening(over: Partial<PublicTeamOpening>): PublicTeamOpening {
  return {
    id: 'o',
    teamName: 'Les Lionnes',
    roles: [],
    level: null,
    availability: null,
    note: null,
    since: null,
    soughtGenders: [],
    rankMin: null,
    rankMax: null,
    platforms: [],
    inputs: [],
    positions: [],
    ...over,
  };
}

describe('WordLimitedTextarea', () => {
  function Harness() {
    const [v, setV] = useState('');
    return <WordLimitedTextarea label="Objectifs" value={v} onChange={setV} />;
  }

  it('compte en direct et signale le dépassement', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Objectifs');
    fireEvent.change(field, { target: { value: words(50) } });
    expect(screen.getByText('50 / 50 mots')).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();

    fireEvent.change(field, { target: { value: words(51) } });
    expect(screen.getByText(/51 \/ 50 mots/)).toBeTruthy();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe(tm.errorGoals);
  });
});

describe('JoinAsPlayerForm', () => {
  function fillRequired() {
    fireEvent.change(screen.getByLabelText('Pseudo'), {
      target: { value: 'Nova' },
    });
    fireEvent.change(screen.getByLabelText('Ton email'), {
      target: { value: 'nova@gmail.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: tm.posMainHeal }));
  }

  it('envoie les champs du mercato, genre « préfère ne pas dire » par défaut', async () => {
    render(<JoinAsPlayerForm />);
    fillRequired();
    fireEvent.click(screen.getByRole('button', { name: tm.platformPc }));
    fireEvent.change(screen.getByLabelText(tm.goalsLabel), {
      target: { value: 'Progresser et viser la Cup' },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /Publier ma fiche/ }).closest('form')!
    );
    await waitFor(() =>
      expect(
        calls.find(
          (c) => c.url === '/api/public/free-players' && c.body !== null
        )
      ).toBeTruthy()
    );
    const sent = calls.find((c) => c.url === '/api/public/free-players')!
      .body as Record<string, unknown>;
    expect(sent).toMatchObject({
      displayName: 'Nova',
      positions: ['main_heal'],
      platforms: ['pc'],
      gender: 'undisclosed',
      level: 'unknown',
      goals: 'Progresser et viser la Cup',
    });
    expect(sent).not.toHaveProperty('roles');
  });

  it('bloque l’envoi au-delà de 50 mots', async () => {
    render(<JoinAsPlayerForm />);
    fillRequired();
    fireEvent.change(screen.getByLabelText(tm.goalsLabel), {
      target: { value: words(51) },
    });
    fireEvent.submit(
      screen.getByRole('button', { name: /Publier ma fiche/ }).closest('form')!
    );
    await waitFor(() =>
      expect(screen.getAllByRole('alert').map((a) => a.textContent)).toContain(
        tm.errorGoals
      )
    );
    expect(
      calls.some((c) => c.url === '/api/public/free-players' && c.body)
    ).toBe(false);
  });
});

describe('FreePlayersList — filtres et genre affiché', () => {
  it('filtre par genre affiché, et ne montre le genre que s’il a été choisi', async () => {
    players = [
      player({
        id: 'a',
        name: 'Alpha',
        gender: 'female',
        positions: ['hitscan'],
      }),
      player({ id: 'b', name: 'Bravo', gender: null, positions: ['tank'] }),
    ];
    const { rerender } = render(<FreePlayersList />);
    await screen.findByText('Alpha');
    expect(screen.getByText('Bravo')).toBeTruthy();
    // Un seul badge de genre : celui que « Alpha » a choisi d'afficher.
    const list = document.querySelector(
      '[data-test="mercato-players-list"]'
    ) as HTMLElement;
    expect(within(list).getAllByText(tm.genderFemale)).toHaveLength(1);

    rerender(<FreePlayersList filters={{ gender: 'female' }} />);
    await waitFor(() => expect(screen.queryByText('Bravo')).toBeNull());
    expect(screen.getByText('Alpha')).toBeTruthy();
    expect(screen.getByText('1 affichée(s) sur 2')).toBeTruthy();

    rerender(<FreePlayersList filters={{ position: 'tank' }} />);
    await waitFor(() => expect(screen.queryByText('Alpha')).toBeNull());
    expect(screen.getByText('Bravo')).toBeTruthy();
  });
});

describe('TeamOpeningsList — profils recherchés', () => {
  it('une équipe « mixte » ou sans exigence répond à tout genre', async () => {
    openings = [
      opening({ id: 'x', teamName: 'Xéna', soughtGenders: ['female'] }),
      opening({ id: 'y', teamName: 'Yuna', soughtGenders: ['mixed'] }),
      opening({ id: 'z', teamName: 'Zéphyr', soughtGenders: [] }),
    ];
    render(<TeamOpeningsList filters={{ gender: 'male' }} />);
    await screen.findByText('Yuna');
    expect(screen.getByText('Zéphyr')).toBeTruthy();
    expect(screen.queryByText('Xéna')).toBeNull();
  });

  it('affiche postes fins, profils et fourchette de rang', async () => {
    openings = [
      opening({
        positions: ['main_heal'],
        soughtGenders: ['female', 'non_binary'],
        level: 'diamond',
        rankMin: 'platinum',
        rankMax: 'master',
        platforms: ['pc'],
      }),
    ];
    render(<TeamOpeningsList />);
    await screen.findByText(tm.posMainHeal);
    expect(
      screen.getByText('Recherche : Femmes, Personnes non-binaires')
    ).toBeTruthy();
    expect(
      screen.getByText('Rang moyen : Diamant · De Platine à Maître · PC')
    ).toBeTruthy();
  });
});

describe('page /mercato', () => {
  it('ouvre l’onglet demandé par l’URL, et les deux formulaires restent à un clic', async () => {
    router.query = { onglet: 'equipes' };
    render(<MercatoPage />);
    expect(
      screen
        .getByRole('tab', { name: tm.tabTeams })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(
      document.querySelector('[data-test="mercato-panel-equipes"]')
    ).toBeTruthy();
    expect(
      screen.getByRole('link', { name: tm.ctaPlayer }).getAttribute('href')
    ).toBe('/mercato/joueuse');
    expect(
      screen.getByRole('link', { name: tm.ctaTeam }).getAttribute('href')
    ).toBe('/mercato/equipe');
  });

  it('par défaut : les joueuses libres', () => {
    render(<MercatoPage />);
    expect(
      screen
        .getByRole('tab', { name: tm.tabPlayers })
        .getAttribute('aria-selected')
    ).toBe('true');
    expect(
      document.querySelector('[data-test="mercato-panel-joueuses"]')
    ).toBeTruthy();
  });
});

describe('anciennes URL', () => {
  it('/rejoindre et /recrutement mènent chacune à SON onglet, pages de lien email intactes', async () => {
    const config = (await import(path.join(process.cwd(), 'next.config.js')))
      .default as { redirects: () => Promise<Array<Record<string, unknown>>> };
    const redirects = await config.redirects();
    expect(redirects).toContainEqual({
      source: '/rejoindre',
      destination: '/mercato?onglet=joueuses',
      permanent: true,
    });
    expect(redirects).toContainEqual({
      source: '/recrutement',
      destination: '/mercato?onglet=equipes',
      permanent: true,
    });
    // Correspondance exacte : /rejoindre/retrait, /recrutement/retrait… ne
    // sont pas aspirées.
    for (const r of redirects) {
      expect(String(r.source)).not.toMatch(/^\/(rejoindre|recrutement)\/:/);
    }
  });
});
