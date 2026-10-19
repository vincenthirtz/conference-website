// @vitest-environment happy-dom
//
// Formulaire /support, côté site, pour les deux changements du lot 8a
// (Women's Library) :
//   - le captcha que /api/support/ticket exige désormais en mode web : chargé
//     à la première interaction, envoyé avec le ticket, redemandé après un
//     refus — sans jamais effacer le message ;
//   - le Bearer de la session joueuse, envoyé SEULEMENT pour un signalement
//     non anonyme. Anonyme : aucun en-tête ne relie la personne au ticket.
// Plus le pré-remplissage `anonymous=1` posé par le guichet de /securite.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';

let routerQuery: Record<string, string> = {};
vi.mock('next/router', () => ({
  useRouter: () => ({ isReady: true, query: routerQuery }),
}));

let sessionToken: string | null = null;
vi.mock('@/hooks/useSession', () => ({
  useSession: () => ({
    user: null,
    token: sessionToken,
    loading: false,
    lastEvent: null,
  }),
}));

import SupportPage from '@/pages/support';
import nsSupportPage from '@/lib/i18n/locales/fr/supportPage';

const t = nsSupportPage.fr;

type Call = { url: string; init?: RequestInit };
let calls: Call[] = [];
let captchaSeq = 0;
let captchaFails = false;
let ticketResponse: { status: number; body: unknown } = {
  status: 201,
  body: {
    success: true,
    ticketId: 'abcdef12-0000',
    referenceShort: 'abcdef12',
  },
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  routerQuery = {};
  sessionToken = null;
  calls = [];
  captchaSeq = 0;
  captchaFails = false;
  ticketResponse = {
    status: 201,
    body: {
      success: true,
      ticketId: 'abcdef12-0000',
      referenceShort: 'abcdef12',
    },
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/captcha') {
        if (captchaFails) return jsonResponse(503, { error: 'indisponible' });
        captchaSeq += 1;
        return jsonResponse(200, {
          token: `tok-${captchaSeq}`,
          question: `${captchaSeq} + 3`,
        });
      }
      return jsonResponse(ticketResponse.status, ticketResponse.body);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const captchaCalls = () => calls.filter((c) => c.url === '/api/captcha');
const ticketCalls = () => calls.filter((c) => c.url === '/api/support/ticket');

function headersOf(call: Call): Record<string, string> {
  return (call.init?.headers ?? {}) as Record<string, string>;
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init?.body));
}

/** Rend le formulaire, déclenche le chargement du captcha, remplit le message. */
async function renderAndFill(opts: { email?: string } = {}) {
  const view = render(<SupportPage />);
  const message = screen.getByPlaceholderText(t.messagePlaceholder);
  fireEvent.focus(message);
  fireEvent.change(message, {
    target: { value: 'Insultes répétées dans le chat vocal après le match.' },
  });
  if (opts.email !== undefined) {
    fireEvent.change(screen.getByPlaceholderText(t.emailPlaceholder), {
      target: { value: opts.email },
    });
  }
  const captcha = await screen.findByLabelText(/1 \+ 3/);
  fireEvent.change(captcha, { target: { value: '4' } });
  return view;
}

async function submit(container: HTMLElement) {
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!);
  });
}

describe('/support — pré-remplissage depuis /securite', () => {
  it('?category=behavior&anonymous=1 : comportement sélectionné, case anonyme cochée', () => {
    routerQuery = { category: 'behavior', anonymous: '1' };
    const { container } = render(<SupportPage />);
    expect((container.querySelector('#anon') as HTMLInputElement).checked).toBe(
      true
    );
    expect(
      (
        container.querySelector(
          'input[name="category"][value="behavior"]'
        ) as HTMLInputElement
      ).checked
    ).toBe(true);
    // Anonyme : les champs nom / e-mail disparaissent.
    expect(screen.queryByPlaceholderText(t.emailPlaceholder)).toBeNull();
  });

  it('sans anonymous : la case reste décochée', () => {
    routerQuery = { category: 'behavior' };
    const { container } = render(<SupportPage />);
    expect((container.querySelector('#anon') as HTMLInputElement).checked).toBe(
      false
    );
  });
});

describe('/support — anonymat et session', () => {
  it('anonyme, même connectée : aucun en-tête Authorization, aucune identité', async () => {
    routerQuery = { category: 'behavior', anonymous: '1' };
    sessionToken = 'player-access-token';
    const { container } = await renderAndFill();
    await submit(container);

    expect(ticketCalls()).toHaveLength(1);
    const call = ticketCalls()[0];
    expect(headersOf(call)).not.toHaveProperty('Authorization');
    const body = bodyOf(call);
    expect(body.isAnonymous).toBe(true);
    expect(body.name).toBeNull();
    expect(body.email).toBeNull();
    expect(body.captchaToken).toBe('tok-1');
    expect(body.captchaAnswer).toBe('4');
    expect(await screen.findByText(t.successTitle)).toBeTruthy();
  });

  it('non anonyme et connectée : le Bearer part, pour rattacher le compte', async () => {
    sessionToken = 'player-access-token';
    const { container } = await renderAndFill({ email: 'ada@example.com' });
    await submit(container);

    const call = ticketCalls()[0];
    expect(headersOf(call).Authorization).toBe('Bearer player-access-token');
    expect(bodyOf(call).isAnonymous).toBe(false);
    expect(bodyOf(call).email).toBe('ada@example.com');
  });

  it('non anonyme sans session : pas d’en-tête Authorization', async () => {
    const { container } = await renderAndFill({ email: 'ada@example.com' });
    await submit(container);
    expect(headersOf(ticketCalls()[0])).not.toHaveProperty('Authorization');
  });
});

describe('/support — captcha', () => {
  it('rien n’est demandé à l’affichage : le captcha attend la première interaction', () => {
    render(<SupportPage />);
    expect(captchaCalls()).toHaveLength(0);
  });

  it('refusé par l’API : nouvelle question, message conservé, rien de perdu', async () => {
    routerQuery = { anonymous: '1' };
    ticketResponse = {
      status: 400,
      body: {
        error: 'Captcha expiré, veuillez réessayer',
        code: 'CAPTCHA_INVALID',
      },
    };
    const { container } = await renderAndFill();
    await submit(container);

    expect(await screen.findByText(t.errCaptchaInvalid)).toBeTruthy();
    expect(captchaCalls()).toHaveLength(2);
    expect(await screen.findByLabelText(/2 \+ 3/)).toBeTruthy();
    expect(
      (screen.getByPlaceholderText(t.messagePlaceholder) as HTMLTextAreaElement)
        .value
    ).toContain('Insultes répétées');
  });

  it('captcha indisponible : on ne poste pas, on le dit, on réessaie', async () => {
    routerQuery = { anonymous: '1' };
    captchaFails = true;
    const { container } = render(<SupportPage />);
    const message = screen.getByPlaceholderText(t.messagePlaceholder);
    fireEvent.focus(message);
    fireEvent.change(message, {
      target: { value: 'Un message assez long pour être envoyé.' },
    });
    await waitFor(() => expect(captchaCalls()).toHaveLength(1));
    await submit(container);

    expect(ticketCalls()).toHaveLength(0);
    expect(await screen.findByText(t.errCaptchaUnavailable)).toBeTruthy();
    await waitFor(() => expect(captchaCalls()).toHaveLength(2));
  });

  it('« Faire un autre signalement » redemande un défi (le précédent est consommé)', async () => {
    routerQuery = { anonymous: '1' };
    const { container } = await renderAndFill();
    await submit(container);
    await act(async () => {
      fireEvent.click(await screen.findByText(t.anotherReport));
    });
    await waitFor(() => expect(captchaCalls()).toHaveLength(2));
  });
});
