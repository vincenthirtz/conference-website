// components/admin/documents/DriveUploadButton.tsx
//
// Dépôt d'un fichier dans le Drive de l'asso. N'apparaît qu'avec le droit
// d'écriture (`manage_documents`) — le serveur le re-vérifie de toute façon,
// mais afficher un bouton qui repart en 403 est une promesse non tenue.
//
// Le fichier part en base64 dans un POST JSON, comme `/api/admin/upload.ts` :
// pas de multipart côté Next, pas de dépendance de parsing.

import { useRef, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDocuments from '@/lib/i18n/locales/admin-fr/adminDocuments';
import { DRIVE_UPLOAD_MAX_BYTES } from '@/utils/documents/driveLimits';

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
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = '';
      // Par tranches : `String.fromCharCode(...bytes)` dépasse la taille max
      // d'arguments d'un appel dès quelques mégaoctets, et échoue par un
      // « Maximum call stack size exceeded » qui ne dit rien du problème.
      for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      }

      await adminFetchJson('/api/admin/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: file.name,
          mimeType: file.type || 'application/octet-stream',
          contentBase64: btoa(binary),
          folderId,
        }),
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
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-purple-500 disabled:opacity-50"
      >
        {busy ? t.uploading : t.uploadCta}
      </button>
      <span className="text-xs text-neutral-500">{t.uploadHint}</span>
    </div>
  );
}
