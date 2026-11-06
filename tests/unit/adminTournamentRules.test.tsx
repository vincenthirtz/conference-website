// @vitest-environment happy-dom
//
// Règlement à valider — côté STAFF, contre des réponses-fixtures au contrat de
// conference-api :
//   GET  /api/admin/tournament/[id]/rules         → { required, versions }
//   POST /api/admin/tournament/[id]/rules         → la version créée
//   GET  /api/admin/tournament/[id]/rules/status  → { teams: [...] }
//   POST /api/admin/demandes (updateStatus)       → 409 rules_not_accepted { missing }
//
// Ce que ces cas protègent :
//   - le réglage de l'édition est ÉTEINT par défaut ;
//   - le dépôt : PDF seulement (signature `%PDF-`), 15 Mo, « changement
//     important » COCHÉ par défaut, la note, une clé d'idempotence ;
//   - les versions (la plus récente « En vigueur », téléchargement) et
//     « Déposez le règlement » quand il n'y en a aucune ;
//   - les validations par équipe, avec le détail des manquants ;
//   - « Approuver » une inscription : désactivé avec sa raison quand il manque
//     une validation (fiche et liste), et le 409 rendu lisible s'il arrive
//     quand même ;
//   - réglage éteint : rien ne change (bouton actif, aucune pastille).

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const { router, addToast } = vi.hoisted(() => ({
  router: {
    asPath: '/admin/demandes/d-1',
    pathname: '/admin/demandes/[id]',
    query: { id: 'd-1' } as Record<string, string>,
    replace: async () => true,
    push: async () => true,
  },
  addToast: (() => {}) as (...a: unknown[]) => void,
}));
vi.mock('@/utils/identityBrowser', () => ({
  identityBrowser: {
    getSession: async () => ({
      data: { session: { access_token: 'staff-token' } },
    }),
  },
}));
vi.mock('next/router', () => ({
  default: router,
  useRouter: () => router,
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: doublure de test de next/image
    <img src={src} alt={alt} />
  ),
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: unknown;
    children: ReactNode;
  }) => (
    <a href={typeof href === 'string' ? href : '#'} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/utils/staff', () => ({
  withStaffPage: () => async () => ({ props: {} }),
}));
vi.mock('@/components/Toast', () => ({
  useToast: () => ({ addToast }),
}));

import TournamentRulesSection from '@/features/admin/tournaments/ui/TournamentRulesSection';
import TournamentRulesToggle from '@/features/admin/tournaments/ui/TournamentRulesToggle';
import { RulesGatedApproveButton } from '@/features/admin/demandes/ui/RegistrationRulesGate';
import DemandesListTable from '@/features/admin/demandes/ui/DemandesListTable';
import TeamRow from '@/components/admin/tournament/overview/TeamRow';
import nsOverview from '@/lib/i18n/locales/admin-fr/adminTournamentOverview';
import AdminDemandeDetailPage from '@/pages/admin/demandes/[id]';
import {
  readRulesNotAccepted,
  rulesBlockMessage,
  rulesGateFor,
  rulesNotAcceptedMessage,
} from '@/features/admin/tournaments/rulesGate';
import type {
  TournamentRulesAdminView,
  TournamentRulesStatusView,
  TournamentRulesVersion,
} from '@/features/admin/tournaments/client';
import type { Demande } from '@/features/admin/demandes/listModel';
import { AdminHttpError } from '@/utils/admin/adminHttp';
import { getAdminQueryClient } from '@/features/admin/_shared/query';
import ns from '@/lib/i18n/locales/admin-fr/adminTournamentRules';
import nsDetail from '@/lib/i18n/locales/admin-fr/adminDemandeDetail';
import nsList from '@/lib/i18n/locales/admin-fr/adminDemandesList';

const t = ns.fr;
const TOUR = 't-owwc-2027';

const V1: TournamentRulesVersion = {
  id: 'ver-1',
  number: 1,
  fileName: 'reglement-v1.pdf',
  sizeBytes: 812_000,
  requiresRevalidation: true,
  note: null,
  createdAt: '2026-11-01T09:00:00.000Z',
  createdBy: 'Vincent',
};
const V2: TournamentRulesVersion = {
  id: 'ver-2',
  number: 2,
  fileName: 'reglement-v2.pdf',
  sizeBytes: 2_400_000,
  requiresRevalidation: false,
  note: 'Coquille article 3.',
  createdAt: '2026-11-05T10:00:00.000Z',
  createdBy: null,
};

const INCOMPLETE: TournamentRulesStatusView = {
  teams: [
    {
      teamId: 'team-alpha',
      name: 'Les Alpha',
      complete: false,
      validated: 2,
      total: 4,
      members: [
        {
          userId: 'u-1',
          name: 'Ana',
          role: 'player',
          accepted: true,
          acceptedAt: '2026-11-05T19:30:00.000Z',
        },
        {
          userId: 'u-2',
          name: 'Bea',
          role: 'player',
          accepted: true,
          acceptedAt: '2026-11-05T19:31:00.000Z',
        },
        {
          userId: 'u-3',
          name: 'Cleo',
          role: 'coach',
          accepted: false,
          acceptedAt: null,
        },
        {
          userId: null,
          name: 'Dana',
          role: 'substitute',
          accepted: false,
          acceptedAt: null,
        },
      ],
    },
    {
      teamId: 'team-beta',
      name: 'Beta',
      complete: true,
      validated: 5,
      total: 5,
      members: [],
    },
  ],
};
const COMPLETE: TournamentRulesStatusView = {
  teams: [
    { ...INCOMPLETE.teams[0], complete: true, validated: 4, members: [] },
  ],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Call = {
  url: string;
  method: string;
  body: string | null;
  headers: Headers;
};
let calls: Call[] = [];
let rulesView: TournamentRulesAdminView;
let statusView: TournamentRulesStatusView;
let onUpload: () => Response;
let onDemandesPost: () => Response;

const DEMANDE = {
  id: 'd-1',
  type: 'team_registration',
  status: 'pending',
  user_id: 'u-1',
  team_id: 'team-alpha',
  tournament_id: TOUR,
  payload: { team_name: 'Les Alpha' },
  comment: null,
  source: 'website',
  created_at: '2026-11-05T12:00:00.000Z',
  staff_note: null,
};

const realFetch = globalThis.fetch;
beforeEach(() => {
  // La fiche demande monte le client admin du navigateur (singleton) : on le
  // vide, sinon un test lirait le cache du précédent.
  getAdminQueryClient().clear();
  calls = [];
  rulesView = { required: true, versions: [V1, V2] };
  statusView = INCOMPLETE;
  onUpload = () => json({ version: { ...V2, id: 'ver-3', number: 3 } }, 201);
  onDemandesPost = () => json({ updatedCount: 1 });
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({
        url,
        method,
        body: typeof init.body === 'string' ? init.body : null,
        headers: new Headers(init.headers),
      });
      if (url === `/api/admin/tournament/${TOUR}/rules/status`)
        return json(statusView);
      if (url === `/api/admin/tournament/${TOUR}/rules`)
        return method === 'POST' ? onUpload() : json(rulesView);
      if (url === '/api/admin/demandes/d-1') return json({ demande: DEMANDE });
      if (url === '/api/admin/demandes' && method === 'POST')
        return onDemandesPost();
      return json({ error: 'inconnu' }, 404);
    }
  ) as unknown as typeof fetch;
});
afterEach(cleanup);
afterAll(() => {
  globalThis.fetch = realFetch;
});

function withClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
}

const PDF_HEAD = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
const pdfFile = (name = 'reglement-v3.pdf') =>
  new File(
    [new Uint8Array([...PDF_HEAD, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46])],
    name,
    {
      type: 'application/pdf',
    }
  );

describe('édition — le réglage « Règlement à valider par chaque membre »', () => {
  it('éteint par défaut, et remonte le changement', () => {
    const onChange = vi.fn();
    render(<TournamentRulesToggle checked={false} onChange={onChange} />);
    const box = screen.getByRole('checkbox', {
      name: t.toggleLabel,
    }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});

describe('section « Règlement » — versions et validations', () => {
  it('versions : la plus récente en tête « En vigueur », téléchargement par version', async () => {
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    const items = await screen.findAllByTestId('rules-version');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Version 2');
    expect(items[0].textContent).toContain(t.versionCurrent);
    expect(items[0].textContent).toContain(t.versionMinor);
    expect(items[0].textContent).toContain('Coquille article 3.');
    expect(items[1].textContent).toContain(t.versionImportant);
    expect(items[1].textContent).toContain('par Vincent');
    expect(
      within(items[0])
        .getByRole('link', { name: t.downloadLabel.replace('{number}', '2') })
        .getAttribute('href')
    ).toBe(`/api/tournaments/${TOUR}/rules/file?version=2`);
  });

  it('validations par équipe, avec le détail des manquants (sans compte compris)', async () => {
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    const rows = await screen.findAllByTestId('rules-team-status');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Les Alpha');
    expect(rows[0].textContent).toContain('2/4 validations');
    expect(rows[0].textContent).toContain(t.teamIncomplete);
    expect(rows[0].textContent).toContain('Manquent (2)');
    expect(rows[0].textContent).toContain('Cleo (coach) — pas encore validé');
    expect(rows[0].textContent).toContain(
      'Dana (remplaçante) — sans compte : ne peut pas valider'
    );
    expect(rows[1].textContent).toContain(t.teamComplete);
  });

  it('réglage allumé sans aucune version : « Déposez le règlement »', async () => {
    rulesView = { required: true, versions: [] };
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    expect(await screen.findByText(t.requiredNoVersion)).toBeTruthy();
    expect(screen.getByText(t.versionsEmpty)).toBeTruthy();
  });

  it('réglage éteint : le dire, et ne pas lire les validations', async () => {
    rulesView = { required: false, versions: [V1] };
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    expect(await screen.findByText(t.requiredOff)).toBeTruthy();
    expect(calls.some((c) => c.url.endsWith('/rules/status'))).toBe(false);
  });
});

describe('section « Règlement » — dépôt d’une version', () => {
  async function pick(file: File) {
    const input = screen.getByLabelText(t.fileLabel) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });
  }
  const submit = () =>
    screen.getByRole('button', { name: t.submit }) as HTMLButtonElement;

  it('« changement important » coché par défaut ; POST du PDF, de la note, avec une clé d’idempotence', async () => {
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    await screen.findAllByTestId('rules-version');
    expect(
      (
        screen.getByRole('checkbox', {
          name: t.importantLabel,
        }) as HTMLInputElement
      ).checked
    ).toBe(true);
    expect(submit().disabled).toBe(true);

    await pick(pdfFile());
    fireEvent.change(screen.getByLabelText(t.noteLabel), {
      target: { value: 'Article 4 : BO5 en play-offs.' },
    });
    await waitFor(() => expect(submit().disabled).toBe(false));
    await act(async () => {
      fireEvent.click(submit());
    });

    const post = await waitFor(() => {
      const p = calls.find((c) => c.method === 'POST');
      expect(p).toBeTruthy();
      return p as Call;
    });
    expect(post.url).toBe(`/api/admin/tournament/${TOUR}/rules`);
    const body = JSON.parse(post.body as string);
    expect(body.data.startsWith('data:application/pdf;base64,')).toBe(true);
    expect(body).toMatchObject({
      mimeType: 'application/pdf',
      filename: 'reglement-v3.pdf',
      requiresRevalidation: true,
      note: 'Article 4 : BO5 en play-offs.',
    });
    expect(post.headers.get('Idempotency-Key')).toBeTruthy();
    expect(
      await screen.findByText(t.uploadedImportant.replace('{number}', '3'))
    ).toBeTruthy();
  });

  it('simple correction : la case décochée part telle quelle', async () => {
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    await screen.findAllByTestId('rules-version');
    fireEvent.click(screen.getByRole('checkbox', { name: t.importantLabel }));
    await pick(pdfFile());
    await waitFor(() => expect(submit().disabled).toBe(false));
    await act(async () => {
      fireEvent.click(submit());
    });
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST')).toBe(true)
    );
    const body = JSON.parse(
      calls.find((c) => c.method === 'POST')?.body as string
    );
    expect(body.requiresRevalidation).toBe(false);
    expect(body.note).toBeNull();
    expect(
      await screen.findByText(t.uploadedMinor.replace('{number}', '3'))
    ).toBeTruthy();
  });

  it('refuse un faux PDF (signature) et un fichier de plus de 15 Mo, sans rien envoyer', async () => {
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    await screen.findAllByTestId('rules-version');

    await pick(
      new File(['<html>pas un pdf</html>'], 'reglement.pdf', {
        type: 'application/pdf',
      })
    );
    expect(await screen.findByText(t.errorNotPdf)).toBeTruthy();
    expect(submit().disabled).toBe(true);

    const big = pdfFile('gros.pdf');
    Object.defineProperty(big, 'size', { value: 15 * 1024 * 1024 + 1 });
    await pick(big);
    expect(await screen.findByText(t.errorTooLarge)).toBeTruthy();

    await pick(
      new File(['x'], 'reglement.docx', { type: 'application/msword' })
    );
    expect(await screen.findByText(t.errorPdfOnly)).toBeTruthy();

    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('échec serveur : le message, et rien de perdu', async () => {
    onUpload = () => json({ error: 'Signature PDF invalide.' }, 400);
    withClient(<TournamentRulesSection tournamentId={TOUR} />);
    await screen.findAllByTestId('rules-version');
    await pick(pdfFile());
    await waitFor(() => expect(submit().disabled).toBe(false));
    await act(async () => {
      fireEvent.click(submit());
    });
    expect(
      await screen.findByText(`${t.errorUpload} Signature PDF invalide.`)
    ).toBeTruthy();
  });
});

describe('blocage de l’acceptation — règles pures', () => {
  it('réglage éteint : rien ne bloque, même sans version ni validation', () => {
    expect(
      rulesGateFor({ required: false, versions: [] }, INCOMPLETE, 'team-alpha')
        .blocked
    ).toBe(false);
  });

  it('réglage allumé : aucune version → bloqué ; incomplet → bloqué ; complet → libre', () => {
    expect(
      rulesGateFor({ required: true, versions: [] }, undefined, 'team-alpha')
    ).toEqual({ blocked: true, reason: 'no_version' });
    expect(
      rulesGateFor({ required: true, versions: [V1] }, INCOMPLETE, 'team-alpha')
        .blocked
    ).toBe(true);
    expect(
      rulesGateFor({ required: true, versions: [V1] }, COMPLETE, 'team-alpha')
        .blocked
    ).toBe(false);
    // Isolement entre équipes : l'état d'une AUTRE équipe ne bloque pas.
    expect(
      rulesGateFor({ required: true, versions: [V1] }, INCOMPLETE, 'team-beta')
        .blocked
    ).toBe(false);
  });

  it('lit le 409 `rules_not_accepted` (erreur levée ou corps JSON) et le rend lisible', () => {
    const body = {
      error: 'Rules not accepted',
      code: 'rules_not_accepted',
      missing: [
        { teamId: 'team-alpha', name: 'Les Alpha', missing: 2 },
        { teamId: 'team-gamma', name: 'Gamma', missing: 1 },
      ],
    };
    const err = new AdminHttpError('Rules not accepted', 409, body);
    expect(readRulesNotAccepted(err)).toHaveLength(2);
    expect(rulesBlockMessage(body, t)).toBe(
      'Refusé : règlement pas encore validé par tous les membres — Les Alpha : 2 validations manquantes · Gamma : 1 validation manquante.'
    );
    expect(rulesNotAcceptedMessage([], t)).toBe(t.blockedGeneric);
    // Une autre erreur n'est pas un refus « règlement ».
    expect(
      rulesBlockMessage(new AdminHttpError('x', 409, { code: 'conflict' }), t)
    ).toBeNull();
  });
});

describe('hub du tournoi — pastille « Règlement X/Y » des équipes', () => {
  const tt = {
    id: 'tt-1',
    team_id: 'team-alpha',
    seed: 1,
    team: { id: 'team-alpha', name: 'Les Alpha' },
  };
  it('le décompte de l’équipe, les manquants en info-bulle', () => {
    render(
      <TeamRow
        tt={tt}
        registrationFields={[]}
        onRemove={() => {}}
        tx={nsOverview.fr}
        rules={INCOMPLETE.teams[0]}
      />
    );
    const chip = screen.getByTestId('rules-chip');
    expect(chip.textContent).toBe('Règlement 2/4');
    expect(chip.getAttribute('title')).toBe(
      'Validations manquantes : Cleo, Dana'
    );
  });
  it('aucune version déposée : « Règlement non déposé » ; réglage éteint : rien', () => {
    const { unmount } = render(
      <TeamRow
        tt={tt}
        registrationFields={[]}
        onRemove={() => {}}
        tx={nsOverview.fr}
        rulesNoVersion
      />
    );
    expect(screen.getByTestId('rules-chip').textContent).toBe(t.chipNoVersion);
    unmount();
    render(
      <TeamRow
        tt={tt}
        registrationFields={[]}
        onRemove={() => {}}
        tx={nsOverview.fr}
        rules={null}
      />
    );
    expect(screen.queryByTestId('rules-chip')).toBeNull();
  });
});

describe('« Approuver » une inscription', () => {
  it('liste : bouton bloqué avec la raison quand il manque des validations, pastille « Règlement 2/4 »', async () => {
    const d = {
      ...DEMANDE,
      user: { display_name: 'Ana', email: null, avatar_url: null },
      team: { id: 'team-alpha', name: 'Les Alpha', logo_url: null },
      tournament: { id: TOUR, name: 'OWWC 2027' },
    } as unknown as Demande;
    const onApprove = vi.fn();
    withClient(
      <DemandesListTable
        demandes={[d]}
        selected={new Set()}
        processingId={null}
        batchProcessing={false}
        hasActiveFilters={false}
        onToggleSelectAll={() => {}}
        onResetFilters={() => {}}
        actions={{
          onToggle: () => {},
          onRequestInfo: () => {},
          onNotifyCaptains: () => {},
          onApprove,
          onReject: () => {},
        }}
      />
    );
    const chip = await screen.findByTestId('registration-rules-chip');
    expect(chip.textContent).toBe('Règlement 2/4');
    expect(chip.getAttribute('title')).toBe(
      'Validations manquantes : Cleo, Dana'
    );
    const approve = await waitFor(() => {
      const b = screen.getByTitle(
        'Approbation bloquée : règlement validé par 2/4 membres.'
      ) as HTMLButtonElement;
      return b;
    });
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(onApprove).not.toHaveBeenCalled();
    // Le refus garde le titre d'origine lisible pour un lecteur d'écran.
    expect(approve.getAttribute('aria-label')).toContain(
      nsList.fr.approveTitle
    );
  });

  it('bouton rapide : réglage éteint → actif (rien ne change)', async () => {
    rulesView = { required: false, versions: [] };
    const onApprove = vi.fn();
    withClient(
      <RulesGatedApproveButton
        tournamentId={TOUR}
        teamId="team-alpha"
        disabled={false}
        onApprove={onApprove}
        title="Approuver"
      >
        ✓
      </RulesGatedApproveButton>
    );
    await waitFor(() =>
      expect(
        calls.some((c) => c.url.endsWith(`/tournament/${TOUR}/rules`))
      ).toBe(true)
    );
    await act(async () => {});
    const btn = screen.getByTitle('Approuver') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(calls.some((c) => c.url.endsWith('/rules/status'))).toBe(false);
  });

  it('fiche demande : « Approuver » désactivé avec la raison écrite et reliée, les manquants nommés', async () => {
    render(<AdminDemandeDetailPage />);
    const approve = (await screen.findByRole('button', {
      name: nsDetail.fr.approve,
    })) as HTMLButtonElement;
    await waitFor(() => expect(approve.disabled).toBe(true));
    const reasonId = approve.getAttribute('aria-describedby') as string;
    expect(document.getElementById(reasonId)?.textContent).toBe(
      'Approbation bloquée : règlement validé par 2/4 membres.'
    );
    const panel = screen.getByTestId('registration-rules-panel');
    expect(panel.textContent).toContain('Manquent : Cleo, Dana');
    // Refuser reste possible.
    expect(
      (
        screen.getByRole('button', {
          name: nsDetail.fr.reject,
        }) as HTMLButtonElement
      ).disabled
    ).toBe(false);
  });

  it('fiche demande : le 409 qui arrive quand même est affiché proprement', async () => {
    statusView = COMPLETE; // l'écran croit l'équipe complète…
    onDemandesPost = () =>
      json(
        {
          error: 'rules_not_accepted',
          code: 'rules_not_accepted',
          missing: [{ teamId: 'team-alpha', name: 'Les Alpha', missing: 1 }],
        },
        409
      ); // … un membre vient d'être ajouté : le serveur refuse.
    render(<AdminDemandeDetailPage />);
    const approve = (await screen.findByRole('button', {
      name: nsDetail.fr.approve,
    })) as HTMLButtonElement;
    await waitFor(() =>
      expect(calls.some((c) => c.url.endsWith('/rules/status'))).toBe(true)
    );
    await waitFor(() => expect(approve.disabled).toBe(false));
    await act(async () => {
      fireEvent.click(approve);
    });
    expect(
      await screen.findByText(
        'Refusé : règlement pas encore validé par tous les membres — Les Alpha : 1 validation manquante.'
      )
    ).toBeTruthy();
    // Le décompte est relu après le refus.
    await waitFor(() =>
      expect(
        calls.filter((c) => c.url.endsWith('/rules/status')).length
      ).toBeGreaterThan(1)
    );
  });
});
