// components/admin/documents/DriveUploadButton.tsx
//
// Dépôt d'un fichier dans le Drive de l'asso. N'apparaît qu'avec le droit
// d'écriture (`manage_documents`) — le serveur le re-vérifie de toute façon,
// mais afficher un bouton qui repart en 403 est une promesse non tenue.
//
// Le fichier part DIRECTEMENT chez Google, sans traverser l'API : elle ouvre une
// session d'envoi (`start`), le navigateur y dépose le fichier, puis elle relit le
// résultat et le journalise (`finish`). 25 Mo y coûtaient près de 110 Mo de mémoire
// (docs/API-WORKER.md, lot 8).

import { useRef, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDocuments from '@/lib/i18n/locales/admin-fr/adminDocuments';
import { DRIVE_UPLOAD_MAX_BYTES } from '@/utils/documents/driveLimits';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

/**
 * Ce que Google reproche à l'envoi. Sans sa raison, « le dépôt a échoué » ne dit
 * pas où chercher, et l'API ne la voit pas : l'envoi ne passe plus par elle.
 */
async function googleRefusal(
  res: Response,
  t: { uploadError: string; uploadNoQuota: string }
): Promise<string> {
  const body = (await res.json().catch(() => null)) as {
    error?: { errors?: { reason?: string }[] };
  } | null;
  const reason = body?.error?.errors?.[0]?.reason;
  // Un compte de service n'a pas d'espace à lui : le fichier doit vivre dans un
  // Drive partagé, un dossier ordinaire partagé avec lui ne suffit pas.
  if (reason === 'storageQuotaExceeded') return t.uploadNoQuota;
  return `${t.uploadError} (${res.status}${reason ? `, ${reason}` : ''})`;
}

export default function DriveUploadButton({
  folderId,
  onUploaded,
}: {
  folderId: string | null;
  onUploaded: () => void;
}) {
  const t = useAdminT(nsAdminDocuments);
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleFile = async (file: File) => {
    // Vérification côté client PUIS côté serveur : ici pour dire non tout de
    // suite, là-bas parce que c'est la seule qui compte.
    if (file.size > DRIVE_UPLOAD_MAX_BYTES) {
      addToast(t.uploadSizeError, 'error');
      return;
    }

    setBusy(true);
    try {
      const mimeType = file.type || 'application/octet-stream';
      const { uploadUrl } = await adminFetchJson<{ uploadUrl: string }>(
        '/api/admin/documents',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'start',
            name: file.name,
            mimeType,
            size: file.size,
            folderId,
          }),
        }
      );

      const sent = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': mimeType },
        body: file,
      });
      if (!sent.ok) throw new Error(await googleRefusal(sent, t));
      const { id: fileId } = (await sent.json()) as { id: string };

      await adminFetchJson('/api/admin/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish', fileId, folderId }),
      });
      addToast(format(t.uploaded, { name: file.name }), 'success');
      onUploaded();
    } catch (err) {
      // Le serveur explique les refus qui se corrigent (type non accepté,
      // dossier partagé en Lecteur) : les remplacer par un message générique
      // ferait chercher au mauvais endroit.
      const message = err instanceof Error ? err.message : '';
      addToast(message || t.uploadError, 'error');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <AdminButton
        variant="primary"
        size="sm"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? t.uploading : t.uploadCta}
      </AdminButton>
      <span className="text-xs text-neutral-500">{t.uploadHint}</span>
    </div>
  );
}
