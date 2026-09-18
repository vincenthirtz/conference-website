// components/overlay/match/AlertBoxSource.tsx
//
// LA BOÎTE D'ALERTES : une alerte à la fois, posée dans l'habillage animé de la
// Women's Cup (`/overlay/alerts/noeud.webm`), sur fond transparent.
//
// L'HABILLAGE EST UNE VIDÉO, ET C'EST ELLE QUI MÈNE. Le nœud se déploie, une
// bande verte s'ouvre sous le bandeau, reste ~9,5 s, puis tout se replie —
// 19 s en tout. Le texte n'a donc PAS le droit d'apparaître quand il veut : il
// entre avec la bande et sort avec elle, sinon il flotte sur du vide.
// Les bornes ci-dessous ont été MESURÉES image par image sur le fichier ; les
// changer sans remesurer décalera le texte.
//
// VP9 AVEC ALPHA. Le navigateur embarqué d'OBS décode le VP9 (pas l'AV1 — cf.
// `TcgAnnouncement.tsx`), et le fichier porte un vrai canal alpha : pas
// d'incrustation couleur à régler, la source se pose telle quelle sur le jeu.
// Il n'y a PAS de repli MP4 : le H.264 n'a pas d'alpha, un repli afficherait un
// rectangle noir en plein direct — mieux vaut le texte seul.
//
// SI LA VIDÉO NE PART PAS, L'ALERTE PASSE QUAND MÊME. Décodeur absent, fichier
// manquant, autoplay refusé : on affiche le texte sur une plaque sobre plutôt
// que de laisser un silence. Une alerte ratée ne se voit pas ; c'est ce qui la
// rend dangereuse.

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import type { StreamAlert, AlertRuleMap } from '@/utils/overlay/alertBox';
import { renderAlertMessage } from '@/utils/overlay/alertBox';
import { useViewportSize } from '@/hooks/useStageFit';

/** Le fichier d'habillage, servi depuis `public/`. */
export const ALERT_FRAME_SRC = '/overlay/alerts/noeud.webm';

/**
 * La bande verte, en fraction de la vidéo (500×281), MESURÉE sur le fichier :
 * x 66→437, y 149→187. Resserrée de quelques points parce que la bande est un
 * TRAPÈZE — elle perd 30 px de large vers le bas, et un texte calé sur le bord
 * haut dépasserait en bas.
 */
export const BAND = { left: 0.17, top: 0.535, width: 0.66, height: 0.135 };

/**
 * Quand la bande est là, en secondes. Mesuré : elle s'ouvre à 5,25 s, est
 * pleine à 5,5 s, commence à se replier à 14,75 s.
 */
export const BAND_IN_S = 5.5;
export const BAND_OUT_S = 14.6;

/** Largeur « de conception » de l'habillage, à l'échelle 1. */
const CARD_W = 900;
const CARD_RATIO = 281 / 500;

/**
 * Corps du texte de DÉPART, en pixels, pour une carte de `cardWidth`.
 *
 * LA BANDE NE S'AGRANDIT PAS, ELLE. Une phrase longue (« Machine se réabonne
 * pour 24 mois ! ») doit rentrer dans la même largeur qu'un « Aru nous suit ! ».
 * On rétrécit donc à mesure que la phrase s'allonge.
 *
 * CE N'EST QU'UNE ESTIMATION, et elle a été prise en défaut : à 0,52 em par
 * caractère, « Machine se réabonne pour 24 mois ! » passait à la ligne et le
 * « ! » débordait SOUS la bande — vérifié au rendu. La largeur réelle dépend de
 * la police, de la graisse et des caractères eux-mêmes ; aucune constante ne la
 * devine. Le composant MESURE donc le texte rendu et le réduit si besoin (cf.
 * `fitScale`) : cette fonction ne fait que donner un point de départ proche,
 * pour que la correction reste invisible.
 *
 * Pure et exportée : c'est une règle de lisibilité, elle mérite un test.
 */
export function fitAlertFontSize(message: string, cardWidth: number): number {
  const band = cardWidth * BAND.width;
  const chars = Math.max(1, message.length);
  const ideal = band / (chars * 0.58);
  const max = cardWidth * 0.045;
  const min = cardWidth * 0.018;
  return Math.max(min, Math.min(max, ideal));
}

type Props = {
  /** L'alerte à l'écran, ou `null` entre deux. */
  alert: StreamAlert | null;
  rules: AlertRuleMap;
  /** Multiplicateur de la régie (`?scale=`). */
  scale?: number;
  position?: 'top' | 'center' | 'bottom';
  /** Son joué à l'apparition. `null` = muet, et c'est le défaut. */
  soundUrl?: string | null;
  /** 0 → 100. */
  soundVolume?: number;
  locale?: string;
};

export function AlertBoxSource({
  alert,
  rules,
  scale = 1,
  position = 'center',
  soundUrl = null,
  soundVolume = 70,
  locale = 'fr-FR',
}: Props) {
  const view = useViewportSize();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const bandRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLSpanElement | null>(null);
  // Correction appliquée APRÈS mesure, quand l'estimation était trop large.
  const [fitScale, setFitScale] = useState(1);

  // `bandOpen` suit la VIDÉO, pas une minuterie : une vidéo qui démarre en
  // retard (décodage, première lecture) décalerait le texte d'autant.
  const [bandOpen, setBandOpen] = useState(false);
  // Vrai quand la vidéo ne peut pas jouer : on bascule sur la plaque sobre.
  const [videoFailed, setVideoFailed] = useState(false);

  const message = useMemo(
    () => (alert ? renderAlertMessage(alert, rules, locale) : ''),
    [alert, rules, locale]
  );

  // Chaque alerte reprend l'animation du début. La clé sur l'élément vidéo la
  // remonte, mais un `currentTime = 0` explicite couvre le cas où React réutilise
  // le nœud (même alerte rejouée après un changement de règles).
  useEffect(() => {
    setBandOpen(false);
    setVideoFailed(false);
    const video = videoRef.current;
    if (!video) return undefined;
    try {
      video.currentTime = 0;
      const played = video.play();
      // `play()` rejette quand l'autoplay est refusé (navigateur de bureau, pas
      // OBS) : on le note pour afficher quand même le texte.
      if (played && typeof played.catch === 'function') {
        played.catch(() => setVideoFailed(true));
      }
    } catch {
      setVideoFailed(true);
    }
    return undefined;
  }, [alert?.id]);

  // Le son est un SECOND média, volontairement : le remplacer ne doit pas
  // demander de réencoder l'habillage, et une régie qui n'en veut pas n'en a
  // pas. Muet tant que la régie n'a pas posé de fichier.
  useEffect(() => {
    if (!alert || !soundUrl) return undefined;
    const audio = audioRef.current;
    if (!audio) return undefined;
    audio.volume = Math.min(1, Math.max(0, soundVolume / 100));
    audio.currentTime = 0;
    const played = audio.play();
    if (played && typeof played.catch === 'function') {
      // Autoplay refusé : l'alerte reste visuelle, ce n'est pas une panne.
      played.catch(() => {});
    }
    return undefined;
  }, [alert?.id, soundUrl, soundVolume, alert]);

  // Repli : si la vidéo n'a rien joué au bout d'une seconde, on montre le texte
  // plutôt que d'attendre un événement qui ne viendra pas.
  useEffect(() => {
    if (!alert) return undefined;
    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (!video || video.currentTime === 0) setVideoFailed(true);
    }, 1000);
    return () => clearTimeout(timer);
  }, [alert?.id, alert]);

  // Calculée AVANT tout retour anticipé : l'effet de mesure ci-dessous en
  // dépend, et un hook ne peut pas vivre après un `return`.
  const cardWidth = Math.min(
    CARD_W * scale,
    view.width * 0.95 || CARD_W * scale
  );

  // MESURE, PAS ESTIMATION. On rend le texte sur UNE ligne, puis on le réduit
  // s'il dépasse la bande. `useLayoutEffect` : la correction doit être faite
  // avant la peinture, sinon on voit la phrase déborder une image durant.
  useLayoutEffect(() => {
    const band = bandRef.current;
    const text = textRef.current;
    if (!band || !text) return;
    const available = band.clientWidth;
    const needed = text.scrollWidth;
    if (!available || !needed) return;
    // 0,98 : une marge d'un cheveu, pour ne pas coller aux bords obliques du
    // trapèze.
    setFitScale(needed > available ? (available * 0.98) / needed : 1);
  }, [message, cardWidth]);

  if (!alert) return null;

  const cardHeight = cardWidth * CARD_RATIO;
  const showText = videoFailed || bandOpen;
  const fontSize = fitAlertFontSize(message, cardWidth);

  const justify =
    position === 'top'
      ? 'flex-start'
      : position === 'bottom'
        ? 'flex-end'
        : 'center';

  const bandStyle: CSSProperties = {
    left: `${BAND.left * 100}%`,
    top: `${BAND.top * 100}%`,
    width: `${BAND.width * 100}%`,
    height: `${BAND.height * 100}%`,
  };

  return (
    <div
      className="flex h-full w-full justify-center"
      style={{ alignItems: justify }}
    >
      <div
        className="relative"
        style={{ width: cardWidth, height: cardHeight }}
        // Le texte est annoncé une fois, calmement : les lecteurs d'écran ne
        // doivent pas relire la phrase à chaque image de la vidéo.
        role="status"
        aria-live="polite"
      >
        {!videoFailed && (
          <video
            // La clé force un élément neuf par alerte : l'animation repart du
            // premier plan, y compris si deux alertes s'enchaînent.
            key={alert.id}
            ref={videoRef}
            aria-hidden
            autoPlay
            muted
            playsInline
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            onTimeUpdate={(e) => {
              const t = e.currentTarget.currentTime;
              setBandOpen(t >= BAND_IN_S && t <= BAND_OUT_S);
            }}
            onError={() => setVideoFailed(true)}
          >
            {/* Pas de repli MP4 : le H.264 n'a pas d'alpha (cf. en-tête). */}
            <source src={ALERT_FRAME_SRC} type="video/webm" />
          </video>
        )}

        {/* Plaque de repli, uniquement quand la vidéo ne peut pas jouer. */}
        {videoFailed && (
          <div
            aria-hidden
            className="absolute inset-x-[8%] top-1/2 -translate-y-1/2 rounded-2xl border border-white/15 bg-black/75 backdrop-blur-sm"
            style={{ padding: cardWidth * 0.03 }}
          />
        )}

        <div
          ref={bandRef}
          className="absolute flex items-center justify-center overflow-hidden text-center"
          style={videoFailed ? { inset: '0 8%' } : bandStyle}
        >
          <span
            ref={textRef}
            className="font-extrabold leading-tight transition-opacity duration-300"
            style={{
              fontSize,
              // UNE SEULE LIGNE. Laisser le texte passer à la ligne le faisait
              // déborder SOUS la bande verte — la bande, elle, ne s'agrandit
              // pas. On préfère une phrase plus petite à une phrase coupée.
              whiteSpace: 'nowrap',
              transform: fitScale < 1 ? `scale(${fitScale})` : undefined,
              opacity: showText ? 1 : 0,
              // Texte sombre SUR la bande verte (elle est claire), clair sur la
              // plaque de repli. Deux fonds, deux contrastes.
              color: videoFailed ? '#ffffff' : '#14210f',
              textShadow: videoFailed
                ? '0 2px 10px rgba(0,0,0,0.9)'
                : '0 1px 0 rgba(255,255,255,0.25)',
            }}
          >
            {message}
          </span>
        </div>

        {soundUrl && (
          // Sans <track> : c'est un son d'ambiance sans parole, joué par une
          // source OBS que personne ne « lit ». Une piste de sous-titres vide
          // n'apporterait rien — le texte de l'alerte, lui, est bien annoncé
          // par le `role="status"` au-dessus.
          <audio ref={audioRef} src={soundUrl} preload="auto" aria-hidden />
        )}
      </div>
    </div>
  );
}
