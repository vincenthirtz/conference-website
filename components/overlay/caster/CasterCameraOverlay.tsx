// components/overlay/caster/CasterCameraOverlay.tsx
//
// Overlay OBS de la scène `camera` — captation d'un opérateur DISTANT intégrée
// par un LIEN (VDO.Ninja, chaîne Twitch/YouTube, flux HLS, fichier MP4).
//
// ⚠️ À ne pas confondre avec `CasterWebcamOverlay` (scène `webcam`), qui ouvre
// une caméra LOCALE de la machine OBS via getUserMedia. Ici, rien n'est branché
// en local : l'overlay ne fait qu'AFFICHER ce que l'opérateur publie ailleurs.
//
// Scène WEB-ONLY (l'app desktop n'a pas cet overlay) et fond TRANSPARENT :
// c'est une incrustation composée par OBS par-dessus le jeu, pas un plein écran
// opaque comme starting/pause/results.
//
// La nature du lien n'est PAS analysée ici : `detectCameraSource` (utils, pur,
// testé) rend `{ kind, url, isFrame, latency }` avec une URL déjà normalisée
// pour l'embarquement (player Twitch avec `parent`, /embed/ YouTube muet,
// `cleanoutput` VDO.Ninja). L'overlay ne décide que du RENDU :
//   isFrame === true  → <iframe> (players tiers, WebRTC VDO.Ninja)
//   isFrame === false → <video>  (fichier progressif, flux HLS)
//
// Rien à l'antenne quand il n'y a rien à montrer : lien vide ou non reconnu ⇒
// la page reste VIDE (pas de message, pas de cadre) — un encart d'erreur
// partirait au direct.

import { useEffect, useMemo, useRef } from 'react';
import type { CameraSceneData } from '@/types/caster';
import {
  CAMERA_SHAPES,
  detectCameraSource,
  type CameraFit,
  type CameraShape,
} from '@/utils/caster/cameraSource';
import { overlayRootCss } from './overlayChrome';

type CameraView = {
  url: string;
  label: string;
  fit: CameraFit;
  shape: CameraShape;
  mirror: boolean;
  layout: 'fullscreen' | 'corner';
  corner: 'tl' | 'tr' | 'bl' | 'br';
  audio: boolean;
};

const CORNERS = ['tl', 'tr', 'bl', 'br'] as const;

/**
 * `data` tolérante : la ligne peut venir d'une version antérieure du cockpit,
 * d'une duplication de scène ou d'une saisie partielle — aucune clé n'est
 * garantie. `rect` est accepté comme alias de `square` (c'est le vocabulaire de
 * la scène `webcam`, et dupliquer une webcam en caméra est un geste banal).
 */
export function normalizeCameraData(
  raw: Record<string, unknown> | null | undefined
): CameraView {
  const d = (raw || {}) as Partial<CameraSceneData>;
  const shape =
    d.shape === 'rect'
      ? 'square'
      : CAMERA_SHAPES.includes(d.shape as CameraShape)
        ? (d.shape as CameraShape)
        : 'rounded';
  return {
    url: typeof d.url === 'string' ? d.url.trim() : '',
    label: typeof d.label === 'string' ? d.label.trim() : '',
    fit: d.fit === 'contain' ? 'contain' : 'cover',
    shape,
    mirror: d.mirror === true,
    // Vignette par défaut : une scène incomplète ne doit pas prendre l'écran.
    layout: d.layout === 'fullscreen' ? 'fullscreen' : 'corner',
    corner: CORNERS.includes(d.corner as (typeof CORNERS)[number])
      ? (d.corner as (typeof CORNERS)[number])
      : 'br',
    // Son COUPÉ par défaut : l'audio du programme vient d'OBS, deux sources
    // simultanées font un écho à l'antenne.
    audio: d.audio === true,
  };
}

/**
 * Hostname réel de la page — le player Twitch exige un `parent=` égal au
 * domaine hôte, qui diffère entre prod, préprod et localhost.
 *
 * Lu au montage sans état : la page overlay a un flash-guard (rien n'est rendu
 * avant la première donnée), donc ce composant ne monte QUE côté client — pas
 * de risque de divergence d'hydratation, et l'iframe ne se recharge pas comme
 * elle le ferait avec un hostname posé dans un effet.
 */
function currentHostname(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.location.hostname;
}

/** Instance hls.js — type seul (import de TYPE : effacé à la compilation). */
type HlsInstance = InstanceType<typeof import('hls.js').default>;

export function CasterCameraOverlay({
  data,
}: {
  data: Record<string, unknown>;
}) {
  const d = useMemo(() => normalizeCameraData(data), [data]);
  const source = useMemo(
    () => detectCameraSource(d.url, currentHostname()),
    [d.url]
  );
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const renderable = !!source.url && source.kind !== 'unknown';
  const needsVideo = renderable && !source.isFrame;

  // Le son vit dans SON effet, pas dans celui de la source : basculer l'audio
  // depuis le cockpit ne doit pas recharger le flux (ça ferait un noir à
  // l'antenne). `muted` est posé en PROPRIÉTÉ — l'attribut React n'est appliqué
  // qu'au premier rendu, et c'est le muet qui conditionne l'autoplay.
  // Déclaré AVANT l'effet de source : au montage, `muted` est correct avant que
  // la lecture ne démarre.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !d.audio;
    if (!d.audio) return;
    // Rallumer le son peut se faire refuser (autoplay non muet) : on retombe
    // muet plutôt que de perdre l'image.
    video.play().catch(() => {
      video.muted = true;
      video.play().catch(() => {
        /* ignore */
      });
    });
  }, [d.audio, needsVideo]);

  // Lecture d'un flux/fichier direct. Tout passe par un effet (jamais par
  // l'attribut src en JSX) : le HLS a besoin d'un branchement impératif, et un
  // seul chemin de code évite qu'un changement d'URL laisse deux lecteurs.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !needsVideo) return undefined;

    let cancelled = false;
    let hls: HlsInstance | null = null;

    const tryPlay = () => {
      // Autoplay : un navigateur refuse une lecture non muette sans geste
      // utilisateur. Dans OBS (CEF lancé sans politique d'autoplay) elle
      // passe ; dans un onglet Chrome elle échoue → on retombe muet pour
      // garder l'IMAGE à l'antenne, quitte à perdre le son.
      video.play().catch(() => {
        if (cancelled || video.muted) return;
        video.muted = true;
        video.play().catch(() => {
          /* rien de plus à tenter : le cadre reste vide, sans message */
        });
      });
    };

    // Branche hls.js (transmuxage en MSE). Import DYNAMIQUE : ~150 ko gzip qui
    // ne doivent peser que sur cette scène, pas sur les 12 autres overlays —
    // tous servis par la MÊME page /overlay/caster/[sceneKey].
    const attachHlsJs = () => {
      void import('hls.js')
        .then(({ default: Hls }) => {
          if (cancelled || hls || !Hls.isSupported()) return;
          const instance = new Hls({
            // `worker-src 'self'` (CSP du site) interdit un worker créé depuis
            // un blob: — hls.js retomberait en démuxage inline après une erreur
            // console. On lui demande directement le mode inline.
            enableWorker: false,
            // Browser Source ouverte des heures : on borne le buffer arrière
            // pour que la mémoire ne dérive pas sur un long show.
            backBufferLength: 30,
          });
          hls = instance;
          instance.on(Hls.Events.ERROR, (_evt, info) => {
            if (!info.fatal) return;
            // Antenne : on tente une reprise silencieuse plutôt que de laisser
            // un cadre mort. Réseau ⇒ on relance le chargement ; média ⇒
            // recover ; sinon on lâche (cadre vide, aucun message).
            if (info.type === Hls.ErrorTypes.NETWORK_ERROR) {
              instance.startLoad();
            } else if (info.type === Hls.ErrorTypes.MEDIA_ERROR) {
              instance.recoverMediaError();
            } else {
              instance.destroy();
              if (hls === instance) hls = null;
            }
          });
          instance.on(Hls.Events.MANIFEST_PARSED, tryPlay);
          instance.loadSource(source.url);
          instance.attachMedia(video);
        })
        .catch((err) => {
          // Chunk indisponible (réseau coupé, déploiement en cours) : on ne
          // casse pas la page, le cadre reste simplement vide.
          console.warn('[camera] chargement de hls.js impossible', err);
        });
    };

    // Safari lit le HLS nativement ; les Chromium récents l'annoncent aussi
    // (`maybe`). Le CEF embarqué dans OBS, lui, est plus ancien et ne sait pas
    // le faire : c'est précisément le cas que hls.js couvre.
    const nativeHls = !!video.canPlayType('application/vnd.apple.mpegurl');
    // Filet : `canPlayType` n'est qu'une promesse (« maybe »). Si la lecture
    // native échoue, on rebascule sur hls.js au lieu de rester au noir.
    const onNativeFail = () => {
      if (cancelled || hls) return;
      console.warn('[camera] HLS natif en échec, bascule sur hls.js');
      video.removeAttribute('src');
      attachHlsJs();
    };

    if (source.kind === 'hls' && !nativeHls) {
      attachHlsJs();
    } else {
      // Fichier progressif, ou HLS natif (Safari, Chromium récent).
      if (source.kind === 'hls') {
        video.addEventListener('error', onNativeFail, { once: true });
      }
      video.src = source.url;
      video.load();
      tryPlay();
    }

    return () => {
      cancelled = true;
      video.removeEventListener('error', onNativeFail);
      if (hls) {
        try {
          hls.destroy();
        } catch {
          /* ignore */
        }
        hls = null;
      }
      // Coupe le téléchargement en cours : sans ça, une source remplacée
      // continue de tirer des segments en fond dans la Browser Source.
      try {
        video.pause();
        video.removeAttribute('src');
        video.load();
      } catch {
        /* ignore */
      }
    };
    // Volontairement SANS `d.audio` : le son est géré par l'effet ci-dessus,
    // pour qu'un changement de son ne relance pas le flux.
  }, [needsVideo, source.kind, source.url]);

  // Lien vide ou non reconnu : page VIDE (transparente). Aucun cadre, aucun
  // message — c'est de l'antenne. Les hooks ci-dessus tournent quand même.
  if (!renderable) return null;

  const wrapClass = [
    'cam-wrap',
    `layout-${d.layout}`,
    `corner-${d.corner}`,
    `shape-${d.shape}`,
    `fit-${d.fit}`,
    d.mirror ? 'mirror' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="caster-camera-overlay">
      <div className={wrapClass}>
        <div className="cam-clip">
          {source.isFrame ? (
            <iframe
              className="cam-frame"
              src={source.url}
              // Réception seule : ni `camera` ni `microphone` à déléguer.
              allow="autoplay; fullscreen"
              frameBorder={0}
              title={d.label || 'Captation opérateur'}
              // Pas de referrerPolicy restrictive : le player Twitch valide
              // l'embarquement via le Referer en plus du `parent=`.
            />
          ) : (
            <video
              className="cam-video"
              ref={videoRef}
              autoPlay
              playsInline
              muted={!d.audio}
            />
          )}
        </div>
        {d.label ? <div className="cam-name">{d.label}</div> : null}
      </div>

      {/* Tokens partagés (couleurs, polices, canvas 1920×1080) mais fond
          TRANSPARENT : OBS composite l'incrustation sur le jeu. */}
      <style jsx global>{`
        ${overlayRootCss('caster-camera-overlay', {
          background: 'transparent',
        })}

        /* Le wrap POSITIONNE (et n'écrête pas) : le bandeau de nom peut ainsi
           déborder du cadre écrêté, notamment sur la vignette circulaire. */
        .caster-camera-overlay .cam-wrap {
          position: absolute;
        }
        /* Le clip porte forme, bordure et overflow — c'est lui qui rogne. */
        .caster-camera-overlay .cam-clip {
          position: absolute;
          inset: 0;
          overflow: hidden;
        }

        /* --- Plein cadre : caméra de salle, 1920×1080 exactement ----------- */
        .caster-camera-overlay .cam-wrap.layout-fullscreen {
          inset: 0;
        }
        /* La FORME ne s'applique qu'à la vignette : un cercle de 1920×1080
           donnerait une ellipse, ça n'a pas de sens à l'antenne. */

        /* --- Vignette d'angle : opérateur incrusté par-dessus le jeu ------- */
        .caster-camera-overlay .cam-wrap.layout-corner {
          width: 480px;
          height: 270px;
        }
        .caster-camera-overlay .cam-wrap.layout-corner.corner-tl {
          top: 48px;
          left: 48px;
        }
        .caster-camera-overlay .cam-wrap.layout-corner.corner-tr {
          top: 48px;
          right: 48px;
        }
        .caster-camera-overlay .cam-wrap.layout-corner.corner-bl {
          bottom: 48px;
          left: 48px;
        }
        .caster-camera-overlay .cam-wrap.layout-corner.corner-br {
          bottom: 48px;
          right: 48px;
        }
        /* Vignette ronde : carrée, donc PAS en 16/9 — d'où le traitement
           particulier du cadrage plus bas. */
        .caster-camera-overlay .cam-wrap.layout-corner.shape-circle {
          width: 320px;
          height: 320px;
        }

        /* Habillage de la vignette (neon cohérent avec la scène webcam). Le
           plein cadre, lui, reste nu : une bordure ferait un liseré sur les
           bords de l'image de sortie. */
        .caster-camera-overlay .cam-wrap.layout-corner .cam-clip {
          background: color-mix(in srgb, var(--bg) 55%, transparent);
          border: 3px solid color-mix(in srgb, var(--accent1) 70%, transparent);
          box-shadow:
            0 0 0 1px color-mix(in srgb, var(--accent2) 40%, transparent),
            0 12px 36px rgba(0, 0, 0, 0.5),
            0 0 28px color-mix(in srgb, var(--accent1) 20%, transparent);
        }
        .caster-camera-overlay .cam-wrap.shape-rounded .cam-clip {
          border-radius: var(--r-lg);
        }
        .caster-camera-overlay .cam-wrap.shape-square .cam-clip {
          border-radius: 0;
        }
        .caster-camera-overlay .cam-wrap.shape-circle .cam-clip {
          border-radius: 50%;
        }

        /* --- Cadrage du flux --------------------------------------------- */
        /* <video> : object-fit fait le travail. */
        .caster-camera-overlay .cam-video {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          display: block;
          background: transparent;
          object-fit: cover;
        }
        .caster-camera-overlay .cam-wrap.fit-contain .cam-video {
          object-fit: contain;
        }

        /* <iframe> : object-fit n'existe pas sur une iframe. Technique retenue
           — le clip écrête (overflow: hidden) et l'iframe est un rectangle
           16/9 CENTRÉ que l'on dimensionne selon l'effet voulu :
             · zone déjà en 16/9 (plein cadre et vignette rectangulaire) :
               l'iframe remplit la zone ; « contenir » et « couvrir » se
               confondent, le player tiers gère lui-même son letterboxing
               interne s'il reçoit une source d'un autre ratio ;
             · zone NON 16/9 (vignette ronde, carrée 320×320) : on rétablit un
               16/9 centré, soit à la largeur de la zone (contain ⇒ bandes haut
               et bas transparentes), soit à sa hauteur (cover ⇒ débords gauche
               et droite rognés par le clip). */
        /* Cas courant (zone 16/9) : l'iframe remplit la zone, SANS transform —
           le player Twitch inspecte la géométrie de son cadre pour autoriser
           l'autoplay, autant ne pas lui compliquer la tâche. */
        .caster-camera-overlay .cam-frame {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          border: 0;
          background: transparent;
        }
        /* Zone carrée : cadre 16/9 recentré à la main (pas d'object-fit ici). */
        .caster-camera-overlay .cam-wrap.shape-circle .cam-frame {
          inset: auto;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
        }
        .caster-camera-overlay .cam-wrap.shape-circle.fit-contain .cam-frame {
          width: 100%;
          height: auto;
          aspect-ratio: 16 / 9;
        }
        .caster-camera-overlay .cam-wrap.shape-circle.fit-cover .cam-frame {
          width: auto;
          height: 100%;
          aspect-ratio: 16 / 9;
        }

        /* Effet miroir — le mirroring d'une iframe inverse aussi son contenu
           (nom de chaîne à l'envers sur un player) : assumé, c'est un réglage
           pensé pour une facecam. */
        .caster-camera-overlay .cam-wrap.mirror .cam-video {
          transform: scaleX(-1);
        }
        .caster-camera-overlay .cam-wrap.mirror .cam-frame {
          transform: scaleX(-1);
        }
        .caster-camera-overlay .cam-wrap.mirror.shape-circle .cam-frame {
          transform: translate(-50%, -50%) scaleX(-1);
        }

        /* --- Incrustation de nom ----------------------------------------- */
        .caster-camera-overlay .cam-name {
          position: absolute;
          bottom: 12px;
          left: 12px;
          max-width: calc(100% - 24px);
          padding: 6px 14px;
          font-family: var(--font-heading);
          font-size: calc(18px * var(--font-scale));
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text);
          background: color-mix(in srgb, var(--bg) 82%, transparent);
          border: 1px solid color-mix(in srgb, var(--accent1) 45%, transparent);
          border-left: 4px solid var(--accent2);
          border-radius: var(--r-sm);
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
        }
        /* Plein cadre : lower third, à l'échelle de l'écran. */
        .caster-camera-overlay .cam-wrap.layout-fullscreen .cam-name {
          bottom: 56px;
          left: 64px;
          max-width: 900px;
          padding: 12px 28px;
          font-size: calc(30px * var(--font-scale));
        }
        /* Vignette ronde : les angles sont rognés — on centre le bandeau dans
           le bas du disque au lieu de le laisser flotter dans le vide. */
        .caster-camera-overlay .cam-wrap.shape-circle .cam-name {
          left: 50%;
          bottom: 22px;
          transform: translateX(-50%);
          /* Borné à la corde du disque à cette hauteur : au-delà, le bandeau
             dépasserait du cercle (il n'est pas écrêté, par construction). */
          max-width: 180px;
          font-size: calc(15px * var(--font-scale));
        }
      `}</style>
    </div>
  );
}
