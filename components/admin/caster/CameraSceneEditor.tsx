// components/admin/caster/CameraSceneEditor.tsx
//
// Éditeur de la scène `camera` — captation d'un opérateur DISTANT intégrée par
// un LIEN (caméraman sur site, second commentateur, caméra de salle).
//
// ⚠️ À ne pas confondre avec la scène `webcam` : celle-là ouvre un périphérique
// LOCAL de la machine OBS via getUserMedia. Ici rien n'est branché en local —
// la source arrive par le réseau, et c'est l'URL qui décide de tout.
//
// Trois responsabilités, dans cet ordre d'importance :
//
//  1. RETOUR VIVANT sur le lien collé. `detectCameraSource()` (source de vérité
//     partagée avec l'overlay) dit ce qui sera rendu et avec quelle latence. Un
//     lien Twitch/YouTube/HLS arrive avec 10 à 30 s de retard : parfait pour un
//     plan d'ambiance, inexploitable pour commenter une action. Le caster doit le
//     savoir AVANT de passer la scène à l'antenne, pas pendant.
//  2. AIDE VDO.NINJA. C'est le seul transport temps réel et le plus tordu à
//     mettre en place (deux liens dérivés d'un identifiant de salle commun). Le
//     générateur produit le couple push/view et tire un identifiant aléatoire —
//     `cam1` serait devinable et collisionnerait entre deux événements.
//  3. HABILLAGE + garde audio. Le son est coupé par défaut : le programme a déjà
//     son audio dans OBS, deux sources simultanées = écho à l'antenne.
//
// Champs persistés = CameraSceneData EXACTEMENT (types/caster.ts).

import { useEffect, useState, type ReactNode } from 'react';
import { copyText } from '@/utils/clipboard';

import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { CameraSceneData, CasterScene } from '@/types/caster';
import {
  CAMERA_SHAPES,
  detectCameraSource,
  type CameraSource,
} from '@/utils/caster/cameraSource';
import {
  randomVdoRoomId,
  sanitizeVdoRoomId,
  vdoNinjaLinks,
} from '@/utils/caster/vdoNinja';

import SaveIndicator from './SaveIndicator';
import {
  detailsClass,
  inputClass,
  labelClass,
  smallBtnClass,
  summaryClass,
  warnNoticeClass,
} from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

const CORNERS: ReadonlyArray<CameraSceneData['corner']> = [
  'tl',
  'tr',
  'bl',
  'br',
];

function normalizeForm(raw: Record<string, unknown>): CameraSceneData {
  const d = (raw || {}) as Partial<CameraSceneData>;
  return {
    url: typeof d.url === 'string' ? d.url : '',
    label: typeof d.label === 'string' ? d.label : '',
    fit: d.fit === 'contain' ? 'contain' : 'cover',
    // Forme libre en base (parité `webcam`) : on retombe sur `rounded` si la
    // valeur stockée n'est pas une des formes proposées.
    shape: (CAMERA_SHAPES as readonly string[]).includes(String(d.shape))
      ? String(d.shape)
      : 'rounded',
    mirror: d.mirror === true,
    // Défaut = vignette : une scène fraîche passée à l'antenne par erreur ne
    // remplit pas l'écran (cf. defaultSceneData('camera')).
    layout: d.layout === 'fullscreen' ? 'fullscreen' : 'corner',
    corner: CORNERS.includes(d.corner as CameraSceneData['corner'])
      ? (d.corner as CameraSceneData['corner'])
      : 'br',
    audio: d.audio === true,
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: CameraSceneData
): Record<string, unknown> {
  return {
    ...raw,
    url: draft.url,
    label: draft.label,
    fit: draft.fit,
    shape: draft.shape,
    mirror: draft.mirror,
    layout: draft.layout,
    corner: draft.corner,
    audio: draft.audio,
  };
}

export default function CameraSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  const { addToast } = useToast();
  const { draft, patch, saveState } = useSceneDraft<CameraSceneData>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  // `parent=` du player Twitch = domaine de CETTE page (prod, préprod ou
  // localhost). Lu après montage : window n'existe pas au SSR, et un hostname
  // vide ferait refuser l'embed par Twitch.
  const [hostname, setHostname] = useState('');
  useEffect(() => {
    setHostname(window.location.hostname);
  }, []);

  // Identifiant de salle VDO.Ninja : tiré dans un EFFET, jamais au rendu
  // (Math.random pendant le rendu = rendu impur, cf. react-hooks/purity).
  const [roomId, setRoomId] = useState('');
  useEffect(() => {
    setRoomId((current) => current || randomVdoRoomId());
  }, []);

  const source: CameraSource = detectCameraSource(
    draft.url,
    hostname || undefined
  );
  const hasUrl = draft.url.trim() !== '';
  const links = vdoNinjaLinks(roomId);

  const kindLabels: Record<CameraSource['kind'], string> = {
    vdoninja: t.cameraKindVdoninja,
    twitch: t.cameraKindTwitch,
    youtube: t.cameraKindYoutube,
    hls: t.cameraKindHls,
    file: t.cameraKindFile,
    unknown: t.cameraKindUnknown,
  };
  const latencyLabels: Record<CameraSource['latency'], string> = {
    'sub-second': t.cameraLatencySubSecond,
    low: t.cameraLatencyLow,
    high: t.cameraLatencyHigh,
    unknown: t.cameraLatencyUnknown,
  };
  const latencyTone: ChipTone =
    source.latency === 'sub-second'
      ? 'ok'
      : source.latency === 'low'
        ? 'brand'
        : 'warn';

  const shapeLabels: Record<string, string> = {
    rounded: t.cameraShapeRounded,
    square: t.cameraShapeSquare,
    circle: t.cameraShapeCircle,
  };
  const cornerLabels: Record<CameraSceneData['corner'], string> = {
    tl: t.cameraCornerTl,
    tr: t.cameraCornerTr,
    bl: t.cameraCornerBl,
    br: t.cameraCornerBr,
  };

  async function copy(value: string) {
    if (await copyText(value)) addToast(t.copied, 'success');
    else addToast(t.copyFailed, 'error');
  }

  /** Bloc « lien + Copier » du générateur VDO.Ninja. */
  const linkRow = (
    label: string,
    value: string,
    testId: string,
    extra?: ReactNode
  ) => (
    <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-2.5 py-2">
      <p className="text-[11px] text-neutral-500 mb-1">{label}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code
          className="text-xs text-[var(--or-200,#eec4ff)] break-all"
          data-testid={testId}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => void copy(value)}
          className={smallBtnClass}
          data-testid={`${testId}-copy`}
        >
          {t.copy}
        </button>
        {extra}
      </div>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="caster-camera-editor">
      <SaveIndicator state={saveState} />

      {/* ---- Lien de captation + retour vivant sur ce qui sera rendu ------- */}
      <label className="block">
        <span className={labelClass}>{t.cameraUrlLabel}</span>
        <input
          type="text"
          value={draft.url}
          onChange={(e) => patch({ url: e.target.value })}
          placeholder={t.cameraUrlPlaceholder}
          spellCheck={false}
          autoComplete="off"
          className={`${inputClass} font-mono text-xs`}
          data-testid="caster-camera-url"
        />
      </label>

      {!hasUrl && (
        <p
          className="text-[11px] text-neutral-500"
          data-testid="caster-camera-empty-hint"
        >
          {t.cameraUrlEmptyHint}
        </p>
      )}

      {hasUrl && source.kind === 'unknown' && (
        <div
          className={`px-3 py-2.5 text-[11px] ${warnNoticeClass}`}
          role="status"
          data-testid="caster-camera-unknown"
        >
          <p className="font-semibold">{t.cameraUnknownTitle}</p>
          <p className="mt-1">{t.cameraUnknownBody}</p>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            <li>{t.cameraFormatVdoninja}</li>
            <li>{t.cameraFormatTwitch}</li>
            <li>{t.cameraFormatYoutube}</li>
            <li>{t.cameraFormatHls}</li>
            <li>{t.cameraFormatFile}</li>
          </ul>
        </div>
      )}

      {hasUrl && source.kind !== 'unknown' && (
        <div className="space-y-2" data-testid="caster-camera-detected">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-neutral-400">
              {format(t.cameraDetected, { kind: kindLabels[source.kind] })}
            </span>
            <Chip tone={latencyTone} data-testid="caster-camera-latency">
              {latencyLabels[source.latency]}
            </Chip>
          </div>
          {source.latency === 'high' && (
            <p
              className={`px-2.5 py-2 text-[11px] ${warnNoticeClass}`}
              data-testid="caster-camera-latency-warning"
            >
              {t.cameraLatencyHighWarning}
            </p>
          )}
          <p className="text-[11px] text-neutral-500 break-all">
            {t.cameraResolvedLabel} :{' '}
            <code className="text-neutral-400">{source.url}</code>
          </p>
        </div>
      )}

      {/* ---- Aide à la mise en place VDO.Ninja (le cas recommandé) --------- */}
      <details className={detailsClass} data-testid="caster-camera-vdo">
        <summary className={summaryClass}>{t.cameraVdoSummary}</summary>
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-neutral-400">{t.cameraVdoStep1}</p>
          <p className="text-[11px] text-neutral-400">{t.cameraVdoStep2}</p>

          <div className="flex flex-wrap items-end gap-2">
            <label className="block grow">
              <span className={labelClass}>{t.cameraVdoRoomLabel}</span>
              <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(sanitizeVdoRoomId(e.target.value))}
                placeholder={t.cameraVdoRoomPlaceholder}
                spellCheck={false}
                autoComplete="off"
                className={`${inputClass} font-mono text-xs`}
                data-testid="caster-camera-vdo-room"
              />
            </label>
            <button
              type="button"
              onClick={() => setRoomId(randomVdoRoomId())}
              className={smallBtnClass}
              data-testid="caster-camera-vdo-regenerate"
            >
              {t.cameraVdoRegenerate}
            </button>
          </div>

          {links ? (
            <div className="space-y-2">
              {linkRow(
                t.cameraVdoPushLabel,
                links.push,
                'caster-camera-vdo-push'
              )}
              {linkRow(
                t.cameraVdoViewLabel,
                links.view,
                'caster-camera-vdo-view',
                <AdminButton
                  variant="secondary"
                  size="xs"
                  onClick={() => patch({ url: links.view })}
                  data-testid="caster-camera-vdo-use"
                >
                  {t.cameraVdoUse}
                </AdminButton>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-[var(--warn,#f5a524)]">
              {t.cameraVdoRoomEmpty}
            </p>
          )}

          <p className="text-[11px] text-neutral-500">{t.cameraVdoRoomHint}</p>
        </div>
      </details>

      {/* ---- Habillage ---------------------------------------------------- */}
      <label className="block">
        <span className={labelClass}>{t.cameraLabelLabel}</span>
        <input
          type="text"
          value={draft.label}
          onChange={(e) => patch({ label: e.target.value })}
          placeholder={t.cameraLabelPlaceholder}
          className={inputClass}
          data-testid="caster-camera-label"
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>{t.cameraLayoutLabel}</span>
          <select
            value={draft.layout}
            onChange={(e) =>
              patch({
                layout:
                  e.target.value === 'fullscreen' ? 'fullscreen' : 'corner',
              })
            }
            className={inputClass}
            data-testid="caster-camera-layout"
          >
            <option value="fullscreen">{t.cameraLayoutFullscreen}</option>
            <option value="corner">{t.cameraLayoutCorner}</option>
          </select>
        </label>

        {/* Coin : n'a de sens qu'en vignette (parité de l'overlay). */}
        {draft.layout === 'corner' && (
          <label className="block">
            <span className={labelClass}>{t.cameraCornerLabel}</span>
            <select
              value={draft.corner}
              onChange={(e) =>
                patch({ corner: e.target.value as CameraSceneData['corner'] })
              }
              className={inputClass}
              data-testid="caster-camera-corner"
            >
              {CORNERS.map((corner) => (
                <option key={corner} value={corner}>
                  {cornerLabels[corner]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="block">
          <span className={labelClass}>{t.cameraFitLabel}</span>
          <select
            value={draft.fit}
            onChange={(e) =>
              patch({ fit: e.target.value === 'contain' ? 'contain' : 'cover' })
            }
            className={inputClass}
            data-testid="caster-camera-fit"
          >
            <option value="cover">{t.cameraFitCover}</option>
            <option value="contain">{t.cameraFitContain}</option>
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>{t.cameraShapeLabel}</span>
          <select
            value={draft.shape}
            onChange={(e) => patch({ shape: e.target.value })}
            className={inputClass}
            data-testid="caster-camera-shape"
          >
            {CAMERA_SHAPES.map((shape) => (
              <option key={shape} value={shape}>
                {shapeLabels[shape] ?? shape}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={draft.mirror}
          onChange={(e) => patch({ mirror: e.target.checked })}
          className="accent-[var(--or,#b467d1)]"
          data-testid="caster-camera-mirror"
        />
        {t.cameraMirrorLabel}
      </label>

      {/* ---- Audio : décoché par défaut, averti quand on le coche ---------- */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={draft.audio}
            onChange={(e) => patch({ audio: e.target.checked })}
            className="accent-[var(--or,#b467d1)]"
            data-testid="caster-camera-audio"
          />
          {t.cameraAudioLabel}
        </label>
        {draft.audio ? (
          <p
            className={`px-2.5 py-2 text-[11px] ${warnNoticeClass}`}
            role="status"
            data-testid="caster-camera-audio-warning"
          >
            {t.cameraAudioWarning}
          </p>
        ) : (
          <p className="text-[11px] text-neutral-500">{t.cameraAudioOffHint}</p>
        )}
      </div>

      <p className="text-[11px] text-neutral-500">{t.cameraHint}</p>
    </div>
  );
}
