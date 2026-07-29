// components/overlay/caster/CasterWebcamOverlay.tsx
//
// Overlay OBS de la scène `webcam` — port FIDÈLE de womenscup-caster
// src/overlays/webcam.html : l'overlay ouvre lui-même la/les caméra(s) via
// getUserMedia (il tourne dans le Browser Source OBS de la machine de
// capture — HTTPS = contexte sécurisé, OBS accorde la permission caméra).
// Fond TRANSPARENT (seule scène plein écran sans var(--bg)).
//
// Sélection par NOM (label) de caméra, pas par deviceId : le deviceId est
// dérivé d'un sel propre à chaque origine, donc celui stocké côté éditeur ne
// correspond pas à celui d'OBS. Le label est stable d'une origine à l'autre.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { WebcamSceneData } from '@/types/caster';
import { overlayRootCss } from './overlayChrome';

type WebcamView = {
  mode: 'solo' | 'duo';
  shape: 'rounded' | 'rect' | 'circle';
  fit: 'cover' | 'contain';
  mirror: boolean;
  cam1: { label: string; deviceId: string };
  cam2: { label: string; deviceId: string };
};

function normalizeWebcamData(
  raw: Record<string, unknown> | null | undefined
): WebcamView {
  const d = (raw || {}) as Partial<WebcamSceneData> & { fit?: string };
  const cam = (c: unknown) => {
    const v = (c || {}) as Partial<WebcamView['cam1']>;
    return { label: v.label || '', deviceId: v.deviceId || '' };
  };
  return {
    mode: d.mode === 'duo' ? 'duo' : 'solo',
    shape: d.shape === 'rect' || d.shape === 'circle' ? d.shape : 'rounded',
    fit: d.fit === 'contain' ? 'contain' : 'cover',
    mirror: d.mirror === true,
    cam1: cam(d.cam1),
    cam2: cam(d.cam2),
  };
}

// Débloque les labels des périphériques (enumerateDevices ne les renvoie
// qu'une fois une permission caméra accordée), puis relâche aussitôt.
// Singleton module : une seule demande quel que soit le nombre de slots.
let labelsUnlockPromise: Promise<void> | null = null;
function unlockLabels(): Promise<void> {
  if (!labelsUnlockPromise) {
    labelsUnlockPromise = navigator.mediaDevices
      .getUserMedia({ video: true, audio: false })
      .then((tmp) => {
        tmp.getTracks().forEach((t) => t.stop());
      })
      .catch(() => {
        // Refus / pas de caméra : on tentera quand même par deviceId, et on
        // pourra re-tenter au prochain montage.
        labelsUnlockPromise = null;
      });
  }
  return labelsUnlockPromise ?? Promise.resolve();
}

async function resolveDeviceId(cfg: {
  label: string;
  deviceId: string;
}): Promise<string | null> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const cams = devices.filter((d) => d.kind === 'videoinput');
  // 1) par label (robuste entre origines), 2) par deviceId (même origine).
  if (cfg.label) {
    const byLabel = cams.find((d) => d.label === cfg.label);
    if (byLabel) return byLabel.deviceId;
  }
  if (cfg.deviceId) {
    const byId = cams.find((d) => d.deviceId === cfg.deviceId);
    if (byId) return byId.deviceId;
  }
  return null;
}

/** Raison lisible d'un échec getUserMedia — diagnostic d'un coup d'œil. */
const CAM_ERROR_REASONS: Record<string, string> = {
  NotAllowedError: 'Permission caméra refusée',
  SecurityError: 'Permission caméra refusée',
  NotReadableError: 'Caméra occupée par une autre application',
  TrackStartError: 'Caméra occupée par une autre application',
  NotFoundError: 'Caméra introuvable',
  DevicesNotFoundError: 'Caméra introuvable',
  OverconstrainedError: 'Caméra introuvable',
  ConstraintNotSatisfiedError: 'Caméra introuvable',
};

function CamSlot({
  slot,
  label,
  deviceId,
  active,
}: {
  slot: 1 | 2;
  label: string;
  deviceId: string;
  active: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [liveState, setLiveState] = useState(false);
  const [slotLabel, setSlotLabel] = useState(`CAM ${slot}`);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    setLiveState(false);
    setSlotLabel(`CAM ${slot}`);
    // Slot inactif ou pas de caméra configurée → cadre repère seul.
    if (!active || (!label && !deviceId)) return undefined;

    (async () => {
      try {
        await unlockLabels();
        const id = await resolveDeviceId({ label, deviceId });
        if (cancelled) return;
        // Un nom/deviceId était configuré mais aucune caméra ne correspond :
        // ne PAS ouvrir la caméra par défaut en douce (ce serait la mauvaise).
        if (!id) {
          setSlotLabel('Caméra introuvable / déconnectée');
          return;
        }
        stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: id } },
          audio: false,
        });
        // Une config plus récente est arrivée pendant l'await → on la jette.
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          return;
        }
        if (video) video.srcObject = stream;
        setLiveState(true);
      } catch (e) {
        if (cancelled) return;
        const name = (e as { name?: string })?.name || '';
        setSlotLabel(
          CAM_ERROR_REASONS[name] || `Erreur caméra${name ? ` (${name})` : ''}`
        );
      }
    })();

    return () => {
      cancelled = true;
      if (stream) {
        try {
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          /* ignore */
        }
      }
      if (video) video.srcObject = null;
    };
  }, [slot, label, deviceId, active]);

  return (
    <div className={`cam-slot ${liveState ? 'live' : ''}`} data-slot={slot}>
      <video className="cam-video" ref={videoRef} autoPlay muted playsInline />
      <div className="cam-placeholder">
        <svg
          className="cam-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
          <path d="M15.5 10l6-3.5v11l-6-3.5z" />
        </svg>
        <span className="cam-label">{slotLabel}</span>
      </div>
    </div>
  );
}

export function CasterWebcamOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const d = useMemo(() => normalizeWebcamData(data), [data]);

  const slotsClass = [
    'cam-slots',
    d.mode,
    `shape-${d.shape}`,
    `fit-${d.fit}`,
    d.mirror ? 'mirror' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="caster-webcam-overlay">
      <div className={slotsClass}>
        <CamSlot
          slot={1}
          label={d.cam1.label}
          deviceId={d.cam1.deviceId}
          active
        />
        <CamSlot
          slot={2}
          label={d.cam2.label}
          deviceId={d.cam2.deviceId}
          active={d.mode === 'duo'}
        />
      </div>

      {/* CSS = valeurs EXACTES de webcam.html + tokens shared.css. */}
      <style jsx global>{`
        ${overlayRootCss('caster-webcam-overlay', {
          background: 'transparent',
        })}

        .caster-webcam-overlay .cam-slots {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 48px;
          padding: 64px;
        }

        .caster-webcam-overlay .cam-slot {
          position: relative;
          flex: 1 1 0;
          max-width: 1280px;
          aspect-ratio: 16 / 9;
          border-radius: var(--r-lg);
          overflow: hidden;
          background: var(--panel-strong);
          border: 4px solid color-mix(in srgb, var(--accent1) 70%, transparent);
          box-shadow:
            0 0 0 2px color-mix(in srgb, var(--accent2) 45%, transparent),
            0 16px 48px rgba(0, 0, 0, 0.55),
            0 0 36px color-mix(in srgb, var(--accent1) 22%, transparent);
        }

        /* Solo : une seule fenêtre, plus grande et centrée. */
        .caster-webcam-overlay .cam-slots.solo .cam-slot[data-slot='2'] {
          display: none;
        }
        .caster-webcam-overlay .cam-slots.solo .cam-slot[data-slot='1'] {
          flex: 0 1 1280px;
        }

        /* Forme */
        .caster-webcam-overlay .cam-slots.shape-rect .cam-slot {
          border-radius: 0;
        }
        .caster-webcam-overlay .cam-slots.shape-circle .cam-slot {
          aspect-ratio: 1 / 1;
          border-radius: 50%;
          max-width: 880px;
        }

        .caster-webcam-overlay .cam-video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          background: #000;
        }
        .caster-webcam-overlay .cam-slots.fit-contain .cam-video {
          object-fit: contain;
        }
        /* Effet miroir (facecam plus naturel) */
        .caster-webcam-overlay .cam-slots.mirror .cam-video {
          transform: scaleX(-1);
        }

        /* Cadre repère affiché quand la caméra n'est pas (encore) ouverte. */
        .caster-webcam-overlay .cam-placeholder {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          gap: 12px;
          background: repeating-linear-gradient(
            135deg,
            color-mix(in srgb, var(--bg) 92%, transparent),
            color-mix(in srgb, var(--bg) 92%, transparent) 24px,
            color-mix(in srgb, var(--accent3) 12%, transparent) 24px,
            color-mix(in srgb, var(--accent3) 12%, transparent) 48px
          );
          color: var(--text);
        }
        .caster-webcam-overlay .cam-slot.live .cam-placeholder {
          display: none;
        }
        .caster-webcam-overlay .cam-slot:not(.live) .cam-video {
          visibility: hidden;
        }
        .caster-webcam-overlay .cam-icon {
          width: 96px;
          height: 96px;
          opacity: 0.85;
        }
        .caster-webcam-overlay .cam-label {
          font-family: var(--font-heading);
          font-size: calc(40px * var(--font-scale));
          font-weight: 800;
          letter-spacing: 2px;
          text-shadow: 0 0 18px
            color-mix(in srgb, var(--accent1) 50%, transparent);
        }
      `}</style>
    </div>
  );
}
