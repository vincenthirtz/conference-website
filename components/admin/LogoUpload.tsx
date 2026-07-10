// components/admin/LogoUpload.tsx
// Composant d'upload de logo avec preview, drag & drop, et fallback URL manuelle

import { useState, useRef, useCallback, useEffect } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';

type LogoUploadProps = {
  value: string; // URL actuelle (externe ou locale)
  onChange: (url: string) => void;
  label?: string;
  hint?: string;
  /** Endpoint receiving the upload payload. Defaults to the staff-only
   *  /api/admin/upload. Team self-service screens can pass a team-scoped
   *  endpoint that checks team-level permissions instead of staff role. */
  endpoint?: string;
};

export default function LogoUpload({
  value,
  onChange,
  label,
  hint,
  endpoint = '/api/admin/upload',
}: LogoUploadProps) {
  const { adminFetchJson } = useAdminFetch();
  const t = useAdminT('adminLogoUpload');
  const resolvedLabel = label ?? t.defaultLabel;
  const resolvedHint = hint ?? t.defaultHint;
  const [mode, setMode] = useState<'upload' | 'url'>(
    value && !value.startsWith('/img/') && !value.includes('supabase')
      ? 'url'
      : 'upload'
  );
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [imgError, setImgError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Une nouvelle source doit retenter l'affichage : l'état d'erreur de l'image
  // est réarmé à chaque changement d'URL (pas de manipulation impérative du
  // style, sinon l'img resterait invisible après correction de l'URL).
  useEffect(() => {
    setImgError(false);
  }, [value]);

  const handleFile = useCallback(
    async (file: File) => {
      setError(null);

      // Validation côté client
      const allowed = ['image/png', 'image/jpeg', 'image/webp'];
      if (!allowed.includes(file.type)) {
        setError(t.errorFormat);
        return;
      }
      if (file.size > 2 * 1024 * 1024) {
        setError(t.errorTooBig);
        return;
      }

      setUploading(true);

      try {
        // Lire le fichier en base64
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        const json = await adminFetchJson<{ url: string }>(endpoint, {
          method: 'POST',
          body: JSON.stringify({
            data: base64,
            mimeType: file.type,
            filename: file.name,
          }),
        });

        onChange(json.url);
      } catch (err: unknown) {
        setError((err as Error)?.message ?? t.errorUpload);
      } finally {
        setUploading(false);
      }
    },
    [onChange, endpoint, adminFetchJson, t]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm text-neutral-300">
          {resolvedLabel}
        </label>
        <div className="flex gap-1 text-xs">
          <button
            type="button"
            onClick={() => setMode('upload')}
            className={`px-2 py-1 rounded-md transition-colors ${
              mode === 'upload'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-400 hover:text-white'
            }`}
          >
            {t.uploadTab}
          </button>
          <button
            type="button"
            onClick={() => setMode('url')}
            className={`px-2 py-1 rounded-md transition-colors ${
              mode === 'url'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-700 text-neutral-400 hover:text-white'
            }`}
          >
            URL
          </button>
        </div>
      </div>

      {mode === 'upload' ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-4 cursor-pointer transition-colors ${
            dragOver
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-neutral-600 bg-neutral-900/50 hover:border-neutral-500'
          }`}
        >
          {uploading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <div className="w-4 h-4 border-2 border-neutral-500 border-t-white rounded-full animate-spin" />
              {t.uploading}
            </div>
          ) : (
            <>
              <svg
                className="w-8 h-8 text-neutral-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm text-neutral-400">
                {t.dropPrefix}
                <span className="text-blue-400 underline">{t.browse}</span>
              </p>
            </>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleInputChange}
            className="hidden"
          />
        </div>
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => {
            setError(null);
            onChange(e.target.value);
          }}
          className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
          placeholder="https://..."
        />
      )}

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Preview */}
      {value && !error && (
        <div className="flex items-center gap-3 mt-1">
          {!imgError && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={t.previewAlt}
              width={48}
              height={48}
              loading="lazy"
              className="w-12 h-12 rounded-lg object-cover border border-neutral-600"
              onError={() => setImgError(true)}
            />
          )}
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            {t.remove}
          </button>
        </div>
      )}

      <p className="text-xs text-neutral-500">{resolvedHint}</p>
    </div>
  );
}
