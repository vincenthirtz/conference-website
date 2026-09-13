// components/admin/tcg/TcgOverlayThemeCard.tsx
//
// L'habillage de la source navigateur OBS du TCG : le VOIR, puis le modifier.
//
// L'APERÇU EST LE RENDU RÉEL, PAS UNE IMITATION. Il monte le composant
// `TcgAnnouncement`, exactement celui que la source navigateur affiche en
// direct. Redessiner ici une pastille approchante aurait été plus simple et
// aurait menti : les deux auraient divergé au premier réglage ajouté, et
// l'aperçu aurait donné confiance précisément là où il faut vérifier.
//
// L'APERÇU EST LOCAL ET INSTANTANÉ. Il suit l'état du formulaire, pas la base :
// on voit ce qu'on est en train de régler AVANT d'enregistrer. Un aperçu qui
// exigerait d'enregistrer pour se mettre à jour obligerait à publier un essai
// raté sur un overlay peut-être déjà en direct.
//
// COMPOSANT SÉPARÉ, comme `TcgOverlayCard`. La page hôte monte les deux côte à
// côte ; c'est la règle que ce dossier s'est donnée pour ne pas reconstituer un
// god-component sous le plafond de taille des écrans admin.
//
// LES LIBELLÉS ARRIVENT PAR PROP : le composant ne connaît aucune langue. Les
// deux formulations réglables, elles, sont du CONTENU — le texte de cette
// chaîne, dans sa langue — et ne passent donc pas par l'i18n.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import TcgAnnouncement from '@/components/overlay/TcgAnnouncement';
import {
  DEFAULT_OVERLAY_THEME,
  OVERLAY_LINE_MAX,
  OVERLAY_POSITIONS,
  type OverlayPosition,
  type OverlayTheme,
} from '@/utils/tcg/overlayThemeShape';
import { logger } from '../../../utils/logger';

export type TcgOverlayThemeLabels = {
  heading: string;
  subtitle: string;
  previewTitle: string;
  accent: string;
  position: string;
  /** Une entrée par valeur de `OVERLAY_POSITIONS`. */
  positionTopLeft: string;
  positionTopRight: string;
  positionBottomLeft: string;
  positionBottomRight: string;
  dropLine: string;
  winLine: string;
  linePlaceholder: string;
  lineHint: string;
  media: string;
  mediaHint: string;
  mediaChoose: string;
  mediaRemove: string;
  saving: string;
  saved: string;
  loadError: string;
  saveError: string;
  errUnsupportedType: string;
  errTooLarge: string;
  errContentMismatch: string;
  errInvalidColor: string;
  /** Libellés de l'aperçu — les mêmes phrases que l'overlay par défaut. */
  previewDropEyebrow: string;
  previewWinEyebrow: string;
  previewDropLine: string;
  previewWinLine: string;
  previewName: string;
};

type Props = { labels: TcgOverlayThemeLabels };

type ThemeState = { theme: OverlayTheme };

/** Types acceptés par la route. Alignés sur `utils/uploads/mediaBytes.ts`. */
const ACCEPT = 'image/png,image/jpeg,image/webp,video/mp4,video/webm';

export default function TcgOverlayThemeCard({ labels }: Props) {
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [theme, setTheme] = useState<OverlayTheme>(DEFAULT_OVERLAY_THEME);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const json = await adminFetchJson<ThemeState>(
        '/api/admin/tcg/overlay-theme'
      );
      setTheme(json.theme ?? DEFAULT_OVERLAY_THEME);
    } catch (err) {
      logger.error('[admin/tcg/overlay-theme] load error:', err);
      setError(labels.loadError);
    }
  }, [adminFetchJson, labels]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Traduit le `code` de la route ; le message brut reste le repli. */
  const messageFor = useCallback(
    (err: unknown): string => {
      const code = (err as { code?: string })?.code;
      if (code === 'unsupported_type') return labels.errUnsupportedType;
      if (code === 'too_large') return labels.errTooLarge;
      if (code === 'content_mismatch') return labels.errContentMismatch;
      if (code === 'invalid_color') return labels.errInvalidColor;
      return (err as Error)?.message || labels.saveError;
    },
    [labels]
  );

  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setBusy(true);
      try {
        const json = await adminFetchJson<ThemeState>(
          '/api/admin/tcg/overlay-theme',
          { method: 'PUT', body: JSON.stringify(patch) }
        );
        setTheme(json.theme ?? DEFAULT_OVERLAY_THEME);
        addToast(labels.saved, 'success');
      } catch (err) {
        logger.error('[admin/tcg/overlay-theme] save error:', err);
        addToast(messageFor(err), 'error');
      } finally {
        setBusy(false);
      }
    },
    [adminFetchJson, addToast, labels, messageFor]
  );

  /**
   * Lit le fichier en base64 puis l'envoie.
   *
   * `FileReader` plutôt qu'un envoi multipart : la route attend du JSON, comme
   * celle des photos de carte. Le surcoût du base64 (~33 %) est admis pour un
   * média d'habillage, déposé une fois de loin en loin.
   */
  const onPickMedia = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onerror = () => addToast(labels.saveError, 'error');
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        if (!result) return;
        void save({ media: { data: result, mimeType: file.type } });
      };
      reader.readAsDataURL(file);
    },
    [addToast, labels, save]
  );

  const positionLabel = (value: OverlayPosition): string => {
    if (value === 'top-left') return labels.positionTopLeft;
    if (value === 'top-right') return labels.positionTopRight;
    if (value === 'bottom-left') return labels.positionBottomLeft;
    return labels.positionBottomRight;
  };

  const previewLabels = {
    dropEyebrow: labels.previewDropEyebrow,
    winEyebrow: labels.previewWinEyebrow,
    dropLine: labels.previewDropLine,
    winLine: labels.previewWinLine,
    anonymous: labels.previewName,
  };

  return (
    <WidgetCard title={labels.heading}>
      <p className="mb-4 max-w-prose text-xs text-gray-400">
        {labels.subtitle}
      </p>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
        >
          {error}
        </div>
      )}

      {/* --- L'aperçu, en premier : on regarde avant de régler. ------------ */}
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        {labels.previewTitle}
      </p>
      <div
        // Damier discret : une source OBS a un FOND TRANSPARENT, et le montrer
        // sur un aplat opaque laisserait croire à une pastille sur fond noir.
        className="mb-6 rounded-xl border border-white/10 p-4"
        style={{
          backgroundImage:
            'linear-gradient(45deg, #1f2937 25%, transparent 25%, transparent 75%, #1f2937 75%), linear-gradient(45deg, #1f2937 25%, transparent 25%, transparent 75%, #1f2937 75%)',
          backgroundSize: '16px 16px',
          backgroundPosition: '0 0, 8px 8px',
          backgroundColor: '#111827',
        }}
      >
        <ul className="flex flex-col gap-2">
          <TcgAnnouncement
            item={{ kind: 'twitch_drop', twitchLogin: null }}
            theme={theme}
            labels={previewLabels}
          />
          <TcgAnnouncement
            item={{ kind: 'match_win', twitchLogin: null }}
            theme={theme}
            labels={previewLabels}
          />
        </ul>
      </div>

      {/* --- Les réglages -------------------------------------------------- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">
            {labels.accent}
          </span>
          <input
            type="color"
            value={theme.accentColor}
            disabled={busy}
            onChange={(e) =>
              setTheme((prev) => ({ ...prev, accentColor: e.target.value }))
            }
            onBlur={(e) => void save({ accentColor: e.target.value })}
            className="h-9 w-full cursor-pointer rounded-lg border border-white/15 bg-black/40"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-xs text-gray-400">
            {labels.position}
          </span>
          <select
            value={theme.position}
            disabled={busy}
            onChange={(e) => {
              const next = e.target.value as OverlayPosition;
              setTheme((prev) => ({ ...prev, position: next }));
              void save({ position: next });
            }}
            className="w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm"
          >
            {OVERLAY_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {positionLabel(p)}
              </option>
            ))}
          </select>
        </label>

        <LineField
          label={labels.dropLine}
          placeholder={labels.linePlaceholder}
          hint={labels.lineHint}
          value={theme.dropLine}
          disabled={busy}
          onChange={(v) => setTheme((prev) => ({ ...prev, dropLine: v }))}
          onCommit={(v) => void save({ dropLine: v })}
        />

        <LineField
          label={labels.winLine}
          placeholder={labels.linePlaceholder}
          hint={labels.lineHint}
          value={theme.winLine}
          disabled={busy}
          onChange={(v) => setTheme((prev) => ({ ...prev, winLine: v }))}
          onCommit={(v) => void save({ winLine: v })}
        />
      </div>

      {/* --- Le média ------------------------------------------------------ */}
      <div className="mt-5">
        <span className="mb-1 block text-xs text-gray-400">{labels.media}</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              // On vide l'input : sans cela, redéposer le MÊME fichier après un
              // refus ne déclencherait aucun événement.
              e.target.value = '';
              if (file) onPickMedia(file);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="rounded-lg border border-white/15 px-3 py-2 text-xs text-gray-300 transition hover:border-white/40 hover:text-white disabled:opacity-50"
          >
            {busy ? labels.saving : labels.mediaChoose}
          </button>
          {theme.mediaUrl && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void save({ media: null })}
              className="rounded-lg px-3 py-2 text-xs text-gray-400 transition hover:text-red-200 disabled:opacity-50"
            >
              {labels.mediaRemove}
            </button>
          )}
        </div>
        <p className="mt-1 text-[11px] text-gray-500">{labels.mediaHint}</p>
      </div>
    </WidgetCard>
  );
}

/**
 * Un champ de formulation, avec son compteur.
 *
 * `onCommit` au `blur` et non à la frappe : enregistrer à chaque touche
 * enverrait une requête par caractère sur une route limitée à 30 appels par
 * minute — le compte serait épuisé en une phrase.
 */
function LineField({
  label,
  placeholder,
  hint,
  value,
  disabled,
  onChange,
  onCommit,
}: {
  label: string;
  placeholder: string;
  hint: string;
  value: string | null;
  disabled: boolean;
  onChange: (value: string | null) => void;
  onCommit: (value: string | null) => void;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-1 block text-xs text-gray-400">{label}</span>
      <input
        type="text"
        value={value ?? ''}
        placeholder={placeholder}
        maxLength={OVERLAY_LINE_MAX}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value || null)}
        onBlur={(e) => onCommit(e.target.value || null)}
        className="w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-sm"
      />
      <span className="mt-1 flex justify-between text-[11px] text-gray-500">
        <span>{hint}</span>
        <span>
          {(value ?? '').length} / {OVERLAY_LINE_MAX}
        </span>
      </span>
    </label>
  );
}
