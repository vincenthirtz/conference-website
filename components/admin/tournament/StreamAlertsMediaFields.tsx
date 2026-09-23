// components/admin/tournament/StreamAlertsMediaFields.tsx
//
// Les deux FICHIERS de la boîte d'alertes — l'habillage et le son — extraits du
// panneau qui les héberge.
//
// POURQUOI UN FICHIER À PART. Un champ de fichier, c'est un aperçu, un
// sélecteur, un contrôle de type/poids et trois états de brouillon : deux fois
// ça, et le panneau passait le plafond de taille des écrans admin
// (`tests/unit/adminFileSizeGuard.test.ts`). L'extraction est la règle du lot A7,
// pas une préférence.
//
// TROIS ÉTATS, COMME L'API. `undefined` = « n'y touche pas », `null` = retrait
// explicite, objet = dépôt. C'est le contrat de `PATCH /api/admin/stream-alerts`
// et il remonte tel quel jusqu'ici : si l'éditeur envoyait `null` par défaut,
// enregistrer un simple changement de volume effacerait l'habillage de la
// veille.
//
// « RETIRER » NE VEUT PAS DIRE « AUCUN ». L'habillage retiré rétablit celui du
// CODE — l'animation du nœud Women's Cup, dont la bande de texte est mesurée au
// pixel (cf. `utils/overlay/alertMedia.ts`). Écrire « Supprimer l'habillage »
// serait un contresens : la boîte n'est jamais nue. Le libellé dit donc où l'on
// retombe, pas ce qu'on enlève.
//
// LE CONTRÔLE CLIENT NE REMPLACE PAS LE SERVEUR, il rend le refus immédiat et
// lisible : faire monter 8 Mio de vidéo en base64 pour s'entendre répondre 400
// est une minute perdue en préparation de direct. Le serveur, lui, garde le
// dernier mot (magic bytes compris).

import { useRef } from 'react';

import { useToast } from '@/components/Toast';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStreamAlerts from '@/lib/i18n/locales/admin-fr/adminStreamAlerts';
import { logger } from '@/utils/logger';

type Dict = typeof nsAdminStreamAlerts.fr;

/**
 * LES PLAFONDS ET LES TYPES SONT REDÉCLARÉS ICI, à dessein, comme dans
 * `utils/tcg/fanartUploadErrors.ts` : les lire depuis `utils/uploads/*`
 * importerait des modules qui manipulent `Buffer` et ferait entrer un polyfill
 * Node dans le bundle navigateur. Le serveur reste l'autorité ; ces valeurs ne
 * servent qu'à refuser TÔT ce qu'il refuserait de toute façon.
 */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const VIDEO_TYPES = ['video/mp4', 'video/webm'];
const AUDIO_TYPES = [
  'audio/mpeg',
  'audio/mp3',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
];

/** Miroirs de `IMAGE_MAX_BYTES`, `VIDEO_MAX_BYTES`, `AUDIO_MAX_BYTES`. */
const IMAGE_MAX_BYTES = 2 * 1024 * 1024;
const VIDEO_MAX_BYTES = 8 * 1024 * 1024;
const AUDIO_MAX_BYTES = 2 * 1024 * 1024;

const FRAME_ACCEPT = [...IMAGE_TYPES, ...VIDEO_TYPES].join(',');
/**
 * Les extensions en plus des types : selon le système, un MP3 se présente en
 * `audio/mp3`, en `audio/mpeg` ou avec un type VIDE, et un `accept` par type
 * seul grise alors le fichier dans le sélecteur.
 */
const SOUND_ACCEPT = `${AUDIO_TYPES.join(',')},.mp3,.ogg,.wav`;

/** Un fichier choisi, déjà lu en base64 (`data:<mime>;base64,…`). */
export type PickedFile = { data: string; mimeType: string; name: string };

/** `undefined` = intact, `null` = retrait demandé, objet = dépôt en attente. */
export type FileEdit = PickedFile | null | undefined;

export type AlertMedia = {
  /** `null` = l'habillage du CODE, pas « aucun habillage ». */
  frameUrl: string | null;
  frameKind: 'image' | 'video' | null;
  /** Ce qui sera joué : le fichier déposé, sinon l'URL collée. */
  soundUrl: string | null;
  /**
   * Un fichier a-t-il été DÉPOSÉ ? `soundUrl` ne le dit pas : l'API y sert
   * déjà le repli sur l'URL collée, et proposer « retirer le fichier » pour
   * une URL que ce bouton ne touche pas serait un piège.
   */
  hasSoundFile: boolean;
};

type Props = {
  media: AlertMedia;
  frameEdit: FileEdit;
  soundEdit: FileEdit;
  onFrameEdit: (edit: FileEdit) => void;
  onSoundEdit: (edit: FileEdit) => void;
  disabled?: boolean;
};

/** « 3,4 Mio » dans la locale du navigateur. */
function formatSize(t: Dict, bytes: number): string {
  const value = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(bytes / 1024 / 1024);
  return `${value} ${t.fileSizeUnit}`;
}

/**
 * Le plafond applicable au fichier choisi, ou `null` si son type est refusé.
 * Miroir de `maxBytesForMime` — l'interface doit annoncer 8 Mio pour une vidéo
 * et 2 Mio pour une image, sinon le refus induit en erreur.
 */
function maxBytesFor(
  target: 'frame' | 'sound',
  mimeType: string
): number | null {
  if (target === 'sound') {
    return AUDIO_TYPES.includes(mimeType) ? AUDIO_MAX_BYTES : null;
  }
  if (IMAGE_TYPES.includes(mimeType)) return IMAGE_MAX_BYTES;
  if (VIDEO_TYPES.includes(mimeType)) return VIDEO_MAX_BYTES;
  return null;
}

/**
 * Le message d'un refus SERVEUR, ou `null` si l'erreur n'est pas un refus de
 * fichier — l'appelant retombe alors sur son message générique.
 *
 * Le STATUT passe avant le `code` pour le 413 : c'est Next qui le rend, avant
 * le handler, et son corps n'a pas de `code` (cf. le plafond de 12 Mo du
 * bodyParser). Même raisonnement que `utils/tcg/fanartUploadErrors.ts`.
 */
export function alertFileErrorMessage(t: Dict, err: unknown): string | null {
  const status = (err as { status?: number })?.status;
  const payload = (err as { payload?: { code?: string; maxBytes?: number } })
    ?.payload;
  if (status === 413) return format(t.fileTooLarge, { max: t.fileTooLargeAny });

  switch (payload?.code) {
    case 'too_large':
      return format(t.fileTooLarge, {
        max: payload.maxBytes
          ? formatSize(t, payload.maxBytes)
          : t.fileTooLargeAny,
      });
    case 'unsupported_type':
      return t.fileUnsupportedType;
    case 'alpha_needs_vp9_profile0':
      return t.fileAlphaNeedsVp9Profile0;
    case 'content_mismatch':
    case 'invalid_base64':
    case 'missing_data':
      return t.fileContentMismatch;
    default:
      return null;
  }
}

export default function StreamAlertsMediaFields({
  media,
  frameEdit,
  soundEdit,
  onFrameEdit,
  onSoundEdit,
  disabled = false,
}: Props) {
  const t = useAdminT(nsAdminStreamAlerts);
  const { addToast } = useToast();
  const frameInput = useRef<HTMLInputElement | null>(null);
  const soundInput = useRef<HTMLInputElement | null>(null);

  /**
   * Contrôle, lecture en base64, puis remontée au panneau — RIEN N'EST ENVOYÉ
   * ICI : le fichier part dans le même PATCH que le reste, au clic
   * « Enregistrer ». Deux enregistrements pour un seul réglage donneraient un
   * état intermédiaire visible à l'antenne.
   */
  const pick = (file: File, target: 'frame' | 'sound') => {
    const max = maxBytesFor(target, file.type);
    if (max == null) {
      addToast(
        target === 'frame' ? t.frameTypeRefused : t.soundTypeRefused,
        'error'
      );
      return;
    }
    if (file.size > max) {
      addToast(
        format(
          target === 'frame' ? t.frameTooLargeClient : t.soundTooLargeClient,
          { size: formatSize(t, file.size), max: formatSize(t, max) }
        ),
        'error'
      );
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      logger.error('[admin/stream-alerts] lecture fichier:', reader.error);
      addToast(t.fileUnreadable, 'error');
    };
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result : '';
      if (!data) {
        addToast(t.fileUnreadable, 'error');
        return;
      }
      const edit: PickedFile = { data, mimeType: file.type, name: file.name };
      if (target === 'frame') onFrameEdit(edit);
      else onSoundEdit(edit);
    };
    reader.readAsDataURL(file);
  };

  // Ce que l'aperçu doit montrer : le brouillon s'il existe, sinon la base.
  // `=== null` (retrait demandé) n'affiche RIEN et le dit en toutes lettres.
  const frameSrc = frameEdit
    ? frameEdit.data
    : frameEdit === null
      ? null
      : media.frameUrl;
  const frameKind = frameEdit
    ? frameEdit.mimeType.startsWith('video/')
      ? 'video'
      : 'image'
    : frameEdit === null
      ? null
      : media.frameKind;
  const soundSrc = soundEdit
    ? soundEdit.data
    : soundEdit === null
      ? null
      : media.soundUrl;
  const hasSoundFile = soundEdit
    ? true
    : soundEdit === null
      ? false
      : media.hasSoundFile;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* --- Habillage ----------------------------------------------------- */}
      <div>
        <span className="mb-1 block text-xs font-medium text-neutral-300">
          {t.frameLabel}
        </span>

        <div className="mb-2 overflow-hidden rounded-lg border border-neutral-700 bg-neutral-950/60">
          {frameSrc && frameKind === 'video' && (
            // `muted` + `loop` : un aperçu qui se met à parler tout seul dans
            // une régie est un incident ; `playsInline` évite le plein écran.
            <video
              src={frameSrc}
              muted
              loop
              autoPlay
              playsInline
              className="max-h-40 w-full object-contain"
            />
          )}
          {frameSrc && frameKind !== 'video' && (
            // biome-ignore lint/performance/noImgElement: URL de bucket / data:, hors périmètre du loader Next
            <img
              src={frameSrc}
              alt={t.framePreviewAlt}
              className="max-h-40 w-full object-contain"
            />
          )}
          {!frameSrc && (
            <p className="px-3 py-4 text-[11px] leading-relaxed text-neutral-500">
              {t.frameIsDefault}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={frameInput}
            type="file"
            accept={FRAME_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              // On vide l'input : sans cela, redéposer le MÊME fichier après un
              // refus ne déclencherait aucun événement.
              e.target.value = '';
              if (file) pick(file, 'frame');
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => frameInput.current?.click()}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white disabled:opacity-50"
          >
            {frameSrc ? t.frameReplace : t.frameChoose}
          </button>
          {/* Le retour au défaut n'a de sens que s'il y a quelque chose à
              retirer : ni quand on est DÉJÀ sur l'habillage du code, ni quand
              le retrait est déjà en attente d'enregistrement. */}
          {frameSrc && (media.frameUrl || frameEdit) && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onFrameEdit(media.frameUrl ? null : undefined)}
              className="rounded-lg px-3 py-2 text-xs text-neutral-400 transition-colors hover:text-white disabled:opacity-50"
            >
              {t.frameReset}
            </button>
          )}
        </div>

        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          {t.frameHelp}
        </p>
        {frameEdit && (
          <p className="mt-1 text-[11px] text-amber-300/80">
            {format(t.filePending, { name: frameEdit.name })}
          </p>
        )}
        {frameEdit === null && (
          <p className="mt-1 text-[11px] text-amber-300/80">
            {t.frameResetPending}
          </p>
        )}
      </div>

      {/* --- Son ----------------------------------------------------------- */}
      <div>
        <span className="mb-1 block text-xs font-medium text-neutral-300">
          {t.soundFileLabel}
        </span>

        <div className="mb-2 rounded-lg border border-neutral-700 bg-neutral-950/60 px-3 py-3">
          {soundSrc ? (
            <>
              <audio controls src={soundSrc} className="w-full" />
              <p className="mt-1 text-[11px] text-neutral-500">
                {hasSoundFile ? t.soundFromFile : t.soundFromUrl}
              </p>
            </>
          ) : soundEdit === null ? (
            // Retrait en attente : on ne peut PAS dire « aucune URL » ici, le
            // champ d'URL vit dans le panneau et peut très bien être rempli.
            // On annonce donc le repli, pas une absence qu'on ne constate pas.
            <p className="text-[11px] leading-relaxed text-amber-300/80">
              {t.soundRemovePending}
            </p>
          ) : (
            <p className="text-[11px] leading-relaxed text-neutral-500">
              {t.soundFileNone}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={soundInput}
            type="file"
            accept={SOUND_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) pick(file, 'sound');
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => soundInput.current?.click()}
            className="rounded-lg border border-neutral-700 px-3 py-2 text-xs text-neutral-300 transition-colors hover:border-neutral-500 hover:text-white disabled:opacity-50"
          >
            {hasSoundFile ? t.soundReplace : t.soundChoose}
          </button>
          {hasSoundFile && (
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSoundEdit(media.hasSoundFile ? null : undefined)}
              className="rounded-lg px-3 py-2 text-xs text-neutral-400 transition-colors hover:text-red-200 disabled:opacity-50"
            >
              {t.soundFileRemove}
            </button>
          )}
        </div>

        <p className="mt-1 text-[11px] leading-relaxed text-neutral-500">
          {t.soundFileHelp}
        </p>
        {soundEdit && (
          <p className="mt-1 text-[11px] text-amber-300/80">
            {format(t.filePending, { name: soundEdit.name })}
          </p>
        )}
      </div>
    </div>
  );
}
