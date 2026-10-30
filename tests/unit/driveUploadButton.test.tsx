// @vitest-environment happy-dom
// Le dépôt dans le Drive : le fichier part chez Google sans traverser l'API, qui ne
// voit que sa description puis relit le résultat (docs/API-WORKER.md, lot 8).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';

const { adminFetchJson, addToast } = vi.hoisted(() => ({
  adminFetchJson: vi.fn(),
  addToast: vi.fn(),
}));

vi.mock('@/hooks/useAdminFetch', () => ({
  useAdminFetch: () => ({ adminFetchJson }),
}));
vi.mock('@/components/Toast', () => ({ useToast: () => ({ addToast }) }));

import DriveUploadButton from '@/components/admin/documents/DriveUploadButton';
import { DRIVE_UPLOAD_MAX_BYTES } from '@/utils/documents/driveLimits';

const UPLOAD_URL = 'https://www.googleapis.com/upload/session-1';

function bodyOf(call: number) {
  return JSON.parse(String(adminFetchJson.mock.calls[call]?.[1]?.body));
}

function choose(container: HTMLElement, file: File) {
  const input = container.querySelector(
    'input[type="file"]'
  ) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

const fetchMock = vi.fn();

beforeEach(() => {
  adminFetchJson.mockReset();
  addToast.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  adminFetchJson.mockImplementation(async (_url: string, init: RequestInit) =>
    JSON.parse(String(init.body)).action === 'start'
      ? { uploadUrl: UPLOAD_URL }
      : { file: { id: 'doc1' } }
  );
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ id: 'doc1' }),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('DriveUploadButton', () => {
  it('ouvre la session, envoie le fichier à Google, puis fait vérifier le résultat', async () => {
    const onUploaded = vi.fn();
    const { container } = render(
      <DriveUploadButton folderId="dossier-1" onUploaded={onUploaded} />
    );
    const file = new File(['%PDF-1.4'], 'PV.pdf', { type: 'application/pdf' });
    choose(container, file);

    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));

    expect(bodyOf(0)).toEqual({
      action: 'start',
      name: 'PV.pdf',
      mimeType: 'application/pdf',
      size: file.size,
      folderId: 'dossier-1',
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(UPLOAD_URL);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'Content-Type': 'application/pdf' });
    // Le fichier lui-même, pas une copie en mémoire convertie en texte.
    expect(init.body).toBe(file);
    expect(bodyOf(1)).toEqual({
      action: 'finish',
      fileId: 'doc1',
      folderId: 'dossier-1',
    });
    expect(addToast).toHaveBeenCalledWith(expect.any(String), 'success');
  });

  it('n’envoie jamais le contenu du fichier à l’API', async () => {
    const onUploaded = vi.fn();
    const { container } = render(
      <DriveUploadButton folderId={null} onUploaded={onUploaded} />
    );
    choose(
      container,
      new File(['contenu-secret'], 'a.pdf', { type: 'application/pdf' })
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalled());

    for (const call of adminFetchJson.mock.calls) {
      expect(String(call[1]?.body)).not.toContain('contenu-secret');
      expect(String(call[1]?.body)).not.toContain('contentBase64');
    }
  });

  it('refuse un fichier trop gros sans rien appeler', async () => {
    const { container } = render(
      <DriveUploadButton folderId={null} onUploaded={() => {}} />
    );
    const big = new File(['x'], 'gros.pdf', { type: 'application/pdf' });
    Object.defineProperty(big, 'size', { value: DRIVE_UPLOAD_MAX_BYTES + 1 });
    choose(container, big);

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
    expect(adminFetchJson).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('si Google refuse l’envoi : erreur, et rien à faire vérifier', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });
    const onUploaded = vi.fn();
    const { container } = render(
      <DriveUploadButton folderId={null} onUploaded={onUploaded} />
    );
    choose(container, new File(['x'], 'a.pdf', { type: 'application/pdf' }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(expect.any(String), 'error')
    );
    expect(adminFetchJson).toHaveBeenCalledTimes(1);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('donne la raison de Google : espace de stockage du compte de service', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({
        error: { errors: [{ reason: 'storageQuotaExceeded' }] },
      }),
    });
    const { container } = render(
      <DriveUploadButton folderId={null} onUploaded={() => {}} />
    );
    choose(container, new File(['x'], 'a.pdf', { type: 'application/pdf' }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('Drive partagé'),
        'error'
      )
    );
  });

  it('donne le code et la raison de Google pour tout autre refus', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { errors: [{ reason: 'badContent' }] } }),
    });
    const { container } = render(
      <DriveUploadButton folderId={null} onUploaded={() => {}} />
    );
    choose(container, new File(['x'], 'a.pdf', { type: 'application/pdf' }));

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        expect.stringContaining('400, badContent'),
        'error'
      )
    );
  });

  it('montre le refus lisible du serveur à l’ouverture', async () => {
    adminFetchJson.mockRejectedValue(new Error('Type de fichier non accepté'));
    const { container } = render(
      <DriveUploadButton folderId={null} onUploaded={() => {}} />
    );
    choose(
      container,
      new File(['x'], 'a.exe', { type: 'application/x-msdownload' })
    );

    await waitFor(() =>
      expect(addToast).toHaveBeenCalledWith(
        'Type de fichier non accepté',
        'error'
      )
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
