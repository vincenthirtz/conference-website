// @vitest-environment happy-dom
//
// Les PARTENAIRES dans l'onglet « L'association » de /admin/tcg — côté écran,
// contre une réponse figée de `/api/admin/tcg/association` (la route est
// testée dans conference-api, `tcgAssociationPartners.test.ts`, mêmes clés :
// `partners[].{id,name,logoUrl,websiteUrl,importable,reason,cardId}`,
// `items[].creditUrl`).
//
// Ce que ces cas protègent : un partenaire importable s'importe d'un clic
// (`import_partner`), un partenaire qui ne l'est pas dit pourquoi ; le lien du
// crédit se pose, s'efface et se refuse avec un message traduit ; hors de
// l'espace de l'association (`partners: null`), la section n'existe pas.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import nsAdminTcgAssociation from '@/lib/i18n/locales/admin-fr/adminTcgAssociation';

const { adminRequest, addToast } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  addToast: vi.fn(),
}));
vi.mock('@/utils/admin/adminHttp', () => ({ adminRequest }));
vi.mock('next/router', () => ({
  useRouter: () => ({ pathname: '/admin/tcg', query: {}, push: vi.fn() }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));

import TcgAssociationPanel from '@/components/admin/tcg/TcgAssociationPanel';
import type { AssociationPartner } from '@/components/admin/tcg/TcgAssociationPartners';

const t = nsAdminTcgAssociation.fr;
const ROUTE = '/api/admin/tcg/association';

const ACME = '66666666-0000-4000-8000-000000000001';
const LOCAL = '66666666-0000-4000-8000-000000000002';
const PLAIN = '66666666-0000-4000-8000-000000000003';
const CARD = '44444444-0000-4000-8000-000000000004';

const PARTNER_CARD = {
  id: CARD,
  title: 'Acme Esport',
  credit: 'Acme Esport',
  creditUrl: 'https://acme.example/',
  imageUrl: null,
  status: 'approved',
  rarity: 'rare',
  sourceRef: `partner:${ACME}`,
  createdAt: '2026-10-15T10:00:00.000Z',
  description: null,
};

function response(over: Record<string, unknown> = {}) {
  const partners: AssociationPartner[] = [
    {
      id: ACME,
      name: 'Acme Esport',
      logoUrl: null,
      websiteUrl: 'https://acme.example/',
      importable: true,
      reason: null,
      cardId: null,
    },
    {
      id: LOCAL,
      name: 'Local',
      logoUrl: null,
      websiteUrl: 'https://local.example/',
      importable: false,
      reason: 'partner_logo_not_in_bucket',
      cardId: null,
    },
    {
      id: PLAIN,
      name: 'Plain',
      logoUrl: null,
      websiteUrl: null,
      importable: false,
      reason: 'partner_website_not_https',
      cardId: null,
    },
  ];
  return {
    items: [] as unknown[],
    eventLogos: [],
    partners,
    rarities: ['common', 'rare', 'epic', 'legendary'],
    defaultRarity: 'rare',
    defaultCredit: 'L’association',
    maxBytes: 2 * 1024 * 1024,
    descriptionMaxLength: 280,
    ...over,
  };
}

/** GET → la réponse figée ; écriture → acceptée (sauf `writeError`). */
function serve(body: unknown, writeError?: unknown) {
  adminRequest.mockImplementation((_url: string, init?: unknown) => {
    if (!init) return Promise.resolve(body);
    return writeError ? Promise.reject(writeError) : Promise.resolve({});
  });
}

const writes = () =>
  adminRequest.mock.calls.filter((call) => call[1] !== undefined);

function renderPanel() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <TcgAssociationPanel />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  adminRequest.mockReset();
  addToast.mockReset();
});

describe('TcgAssociationPanel — partenaires', () => {
  it('liste les partenaires : importable, ou le motif du refus', async () => {
    serve(response());
    renderPanel();

    const section = (await screen.findByText(t.partnersTitle)).closest('div');
    expect(section).not.toBeNull();
    const scope = within(section as HTMLElement);
    expect(scope.getByText('Acme Esport')).toBeTruthy();
    expect(scope.getByText('acme.example')).toBeTruthy();
    expect(
      scope.getAllByRole('button', { name: t.importPartner })
    ).toHaveLength(1);
    expect(scope.getByText(t.partnerLogoNotImportable)).toBeTruthy();
    expect(scope.getByText(t.partnerWebsiteNotHttps)).toBeTruthy();
  });

  it('importe un partenaire en carte d’un clic', async () => {
    serve(response());
    renderPanel();

    fireEvent.click(
      await screen.findByRole('button', { name: t.importPartner })
    );

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toEqual([
      ROUTE,
      {
        method: 'POST',
        json: { action: 'import_partner', partnerId: ACME, rarity: 'rare' },
        idempotent: true,
      },
    ]);
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.toastPartnerImported, 'success')
    );
  });

  it('un partenaire déjà importé n’a plus de bouton', async () => {
    const body = response();
    body.partners[0] = { ...body.partners[0], cardId: CARD };
    serve(body);
    renderPanel();

    await screen.findByText(t.partnersTitle);
    expect(screen.queryByRole('button', { name: t.importPartner })).toBeNull();
    expect(screen.getAllByText(t.eventLogoImported).length).toBeGreaterThan(0);
  });

  it('hors de l’espace de l’association : pas de section', async () => {
    serve(response({ partners: null }));
    renderPanel();

    await screen.findByText(t.uploadTitle);
    expect(screen.queryByText(t.partnersTitle)).toBeNull();
  });
});

describe('TcgAssociationPanel — lien du crédit', () => {
  /** Le champ « lien du crédit » de la carte affichée (le 2e : après le dépôt). */
  const cardLinkInput = async () => {
    const inputs = await screen.findAllByLabelText(t.labelCreditUrl);
    expect(inputs).toHaveLength(2);
    return inputs[1] as HTMLInputElement;
  };

  it('une carte de partenaire le dit, et montre son lien', async () => {
    serve(response({ items: [PARTNER_CARD] }));
    renderPanel();

    expect((await cardLinkInput()).value).toBe('https://acme.example/');
    expect(
      screen.getByText(`${t.statusApproved} · ${t.fromPartner}`)
    ).toBeTruthy();
  });

  it('enregistre un nouveau lien, puis l’efface (null)', async () => {
    serve(response({ items: [PARTNER_CARD] }));
    renderPanel();

    const input = await cardLinkInput();
    fireEvent.change(input, { target: { value: ' https://acme.example/fr ' } });
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0][1]).toMatchObject({
      method: 'PATCH',
      json: {
        action: 'update',
        id: CARD,
        creditUrl: 'https://acme.example/fr',
      },
    });

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: t.save }).hasAttribute('disabled')
      ).toBe(false)
    );
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(writes()).toHaveLength(2));
    expect(
      (writes()[1][1] as { json: Record<string, unknown> }).json.creditUrl
    ).toBeNull();
  });

  it('un champ non touché n’envoie pas de lien', async () => {
    serve(response({ items: [PARTNER_CARD] }));
    renderPanel();

    await cardLinkInput();
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect('creditUrl' in (writes()[0][1] as { json: object }).json).toBe(
      false
    );
  });

  it('un refus de la route est traduit', async () => {
    serve(
      response({ items: [PARTNER_CARD] }),
      Object.assign(new Error('Lien du crédit refusé.'), {
        payload: {
          code: 'validation',
          reason: 'credit_url_https_required',
        },
      })
    );
    renderPanel();

    fireEvent.change(await cardLinkInput(), {
      target: { value: 'http://acme.example/' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.save }));
    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(t.errorCreditUrl, 'error')
    );
  });
});
