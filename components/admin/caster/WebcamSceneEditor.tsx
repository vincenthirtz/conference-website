// components/admin/caster/WebcamSceneEditor.tsx
//
// Éditeur web de la scène `webcam` — port du form desktop
// (womenscup-caster/src/renderer/webcamEditor.js). Champs persistés EXACTS de
// son read() : { mode: 'solo'|'duo', cam1, cam2: { label, deviceId }, shape,
// mirror }.
//
// La sélection se fait par NOM de caméra (le deviceId dépend d'un sel propre à
// chaque origine — c'est le label qui matche côté overlay OBS ; le deviceId
// n'est qu'un repli best-effort). Sur desktop, la détection tourne sur la
// machine OBS ; ici « Détecter les caméras (sur cette machine) » est un
// best-effort local (getUserMedia + enumerateDevices) qui alimente une
// datalist — la saisie du label reste libre.

import { useState } from 'react';

import { useToast } from '@/components/Toast';
import type {
  CasterScene,
  WebcamCamConfig,
  WebcamSceneData,
} from '@/types/caster';
import { useAdminT } from '@/lib/i18n/useAdminT';

import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

function normalizeCam(raw: unknown): WebcamCamConfig {
  const c = (raw || {}) as Partial<WebcamCamConfig>;
  return { label: c.label || '', deviceId: c.deviceId || '' };
}

function normalizeForm(raw: Record<string, unknown>): WebcamSceneData {
  const d = (raw || {}) as Partial<WebcamSceneData>;
  return {
    mode: d.mode === 'duo' ? 'duo' : 'solo',
    cam1: normalizeCam(d.cam1),
    cam2: normalizeCam(d.cam2),
    shape: d.shape || 'rounded',
    mirror: d.mirror === true,
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: WebcamSceneData
): Record<string, unknown> {
  return {
    ...raw,
    mode: draft.mode,
    cam1: { ...draft.cam1 },
    cam2: { ...draft.cam2 },
    shape: draft.shape,
    mirror: draft.mirror,
  };
}

export default function WebcamSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { addToast } = useToast();
  const { draft, patch, saveState } = useSceneDraft<WebcamSceneData>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  // Caméras détectées sur CETTE machine (null = pas encore détecté).
  const [detected, setDetected] = useState<WebcamCamConfig[] | null>(null);
  const [detecting, setDetecting] = useState(false);

  async function detectCameras() {
    setDetecting(true);
    try {
      const md = navigator.mediaDevices;
      if (!md?.enumerateDevices) throw new Error('mediaDevices indisponible');
      // getUserMedia débloque les labels (sinon enumerateDevices les masque).
      const tmp = await md.getUserMedia({ video: true, audio: false });
      tmp.getTracks().forEach((track) => track.stop());
      const devices = await md.enumerateDevices();
      const cams = devices
        .filter((d) => d.kind === 'videoinput' && d.label)
        .map((d) => ({ label: d.label, deviceId: d.deviceId }));
      setDetected(cams);
      addToast(t.webcamDetected, 'success');
    } catch {
      addToast(t.webcamDetectError, 'error');
    } finally {
      setDetecting(false);
    }
  }

  /** Saisie d'un label : deviceId repris d'une caméra détectée si le nom
   *  matche, sinon '' (l'overlay résout par label — parité desktop). */
  function camFromLabel(label: string): WebcamCamConfig {
    const hit = detected?.find((c) => c.label === label.trim());
    return { label, deviceId: hit?.deviceId || '' };
  }

  const camField = (
    key: 'cam1' | 'cam2',
    label: string,
    value: WebcamCamConfig
  ) => (
    <label className="block">
      <span className={labelClass}>{label}</span>
      <input
        type="text"
        value={value.label}
        onChange={(e) => patch({ [key]: camFromLabel(e.target.value) })}
        placeholder={t.webcamLabelPlaceholder}
        list="caster-webcam-devices"
        className={inputClass}
      />
    </label>
  );

  return (
    <div className="space-y-4" data-testid="caster-webcam-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.webcamModeLabel}</span>
        <select
          value={draft.mode}
          onChange={(e) =>
            patch({ mode: e.target.value === 'duo' ? 'duo' : 'solo' })
          }
          className={inputClass}
        >
          <option value="solo">{t.webcamModeSolo}</option>
          <option value="duo">{t.webcamModeDuo}</option>
        </select>
      </label>

      {camField('cam1', t.webcamCam1Label, draft.cam1)}
      {draft.mode === 'duo' && camField('cam2', t.webcamCam2Label, draft.cam2)}

      {/* Suggestions partagées par les deux champs caméra. */}
      <datalist id="caster-webcam-devices">
        {(detected || []).map((c) => (
          <option key={c.deviceId || c.label} value={c.label} />
        ))}
      </datalist>

      <button
        type="button"
        onClick={() => void detectCameras()}
        disabled={detecting}
        className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-50"
        data-testid="caster-webcam-detect"
      >
        {detecting ? t.webcamDetecting : t.webcamDetect}
      </button>

      <label className="block">
        <span className={labelClass}>{t.webcamShapeLabel}</span>
        <select
          value={draft.shape}
          onChange={(e) => patch({ shape: e.target.value })}
          className={inputClass}
        >
          <option value="rounded">{t.webcamShapeRounded}</option>
          <option value="rect">{t.webcamShapeRect}</option>
          <option value="circle">{t.webcamShapeCircle}</option>
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm text-neutral-300">
        <input
          type="checkbox"
          checked={draft.mirror}
          onChange={(e) => patch({ mirror: e.target.checked })}
          className="accent-purple-500"
        />
        {t.webcamMirrorLabel}
      </label>

      <p className="text-[11px] text-neutral-500">{t.webcamHint}</p>
    </div>
  );
}
