// components/Team/TcgTeamImageCard.tsx
//
// L'illustration de la carte TCG de l'équipe, côté capitaine (et staff).
//
// WHY un bloc autonome plutôt qu'un champ du formulaire d'édition : l'image est
// publiée dès l'envoi, sans passer par le bouton « Enregistrer » de la page.
// Elle vit dans un bucket, pas dans la ligne `teams` que ce formulaire met à
// jour — prétendre le contraire obligerait à garder un fichier en suspens
// jusqu'à la soumission, et à le nettoyer si la personne s'en va. On le dit donc
// explicitement dans l'interface, au lieu de le laisser deviner.
//
// L'APERÇU MONTRE LE REPLI. Sans illustration, la carte prend le logo : c'est ce
// qu'on affiche, en le disant. Un cadre vide laisserait croire que la carte
// n'existe pas.

import { useCallback, useRef, useState } from 'react';
import Image from 'next/image';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT, format } from '@/lib/i18n/useT';
import nsTeamEdit from '@/lib/i18n/locales/fr/teamEdit';

/** Miroir client de `IMAGE_EXT_BY_MIME` (utils/uploads/imageBytes.ts). */
const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];
/** Miroir client de `IMAGE_MAX_BYTES`. Le serveur reste seul juge. */
const MAX_BYTES = 2 * 1024 * 1024;

export default function TcgTeamImageCard({
  teamId,
  logoUrl,
  initialImageUrl,
}: {
  teamId: string;
  logoUrl: string | null;
  initialImageUrl: string | null;
}) {
  const t = useT(nsTeamEdit);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const inputRef = useRef<HTMLInputElement>(null);

  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Les `code` du serveur sont stables ; la traduction appartient au client. */
  const messageForCode = useCallback(
    (code: unknown): string => {
      switch (code) {
        case 'unsupported_type':
          return t.tcgImageErrorType;
        case 'too_large':
          return t.tcgImageErrorTooLarge;
        case 'content_mismatch':
          return t.tcgImageErrorMismatch;
        case 'FORBIDDEN':
          return t.tcgImageErrorForbidden;
        default:
          return t.tcgImageErrorGeneric;
      }
    },
    [t]
  );

  const send = useCallback(
    async (file: File) => {
      setError(null);

      // Contrôles CLIENT, pour éviter un aller-retour inutile sur un cas
      // évident. Ils ne remplacent pas ceux du serveur : un octet de plus ou un
      // type falsifié y sera refusé de toute façon.
      if (!ACCEPTED.includes(file.type)) {
        setError(t.tcgImageErrorType);
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(t.tcgImageErrorTooLarge);
        return;
      }

      setBusy(true);
      try {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('read'));
          reader.readAsDataURL(file);
        });

        const json = await adminFetchJson<{ url: string | null }>(
          `/api/teams/${teamId}/tcg-image`,
          {
            method: 'POST',
            body: JSON.stringify({ data, mimeType: file.type }),
          }
        );
        setImageUrl(json.url);
      } catch (err) {
        const code = (err as { payload?: { code?: unknown } })?.payload?.code;
        setError(messageForCode(code));
      } finally {
        setBusy(false);
        // Sans ça, redéposer le MÊME fichier après une erreur ne déclenche
        // aucun `change` et l'interface paraît gelée.
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [adminFetchJson, teamId, t, messageForCode]
  );

  const remove = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await adminFetchJson(`/api/teams/${teamId}/tcg-image`, {
        method: 'DELETE',
      });
      setImageUrl(null);
    } catch (err) {
      const code = (err as { payload?: { code?: unknown } })?.payload?.code;
      setError(messageForCode(code));
    } finally {
      setBusy(false);
    }
  }, [adminFetchJson, teamId, messageForCode]);

  const shown = imageUrl ?? logoUrl;
  const isFallback = !imageUrl;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold text-white">{t.tcgImageLabel}</p>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          {format(t.tcgImageHint, { max: '2 Mo' })}
        </p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        {/* Même proportion que la carte réelle : on juge le cadrage, pas une
            vignette carrée qui mentirait sur le rendu final. */}
        <div className="relative aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[var(--color-violet)]/25 to-[var(--color-green)]/15">
          {shown ? (
            <Image
              src={shown}
              alt=""
              fill
              sizes="112px"
              className={isFallback ? 'object-contain p-3' : 'object-cover'}
              unoptimized
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">
              {t.tcgImageEmpty}
            </span>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs text-gray-400">
            {isFallback ? t.tcgImageUsingLogo : t.tcgImageUsingUpload}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="rounded-xl bg-purple-600 px-4 py-2 text-sm font-semibold transition hover:bg-purple-500 disabled:opacity-50"
            >
              {busy
                ? t.tcgImageBusy
                : imageUrl
                  ? t.tcgImageReplace
                  : t.tcgImageUpload}
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={remove}
                disabled={busy}
                className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
              >
                {t.tcgImageRemove}
              </button>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(',')}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void send(file);
            }}
          />
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}
    </div>
  );
}
