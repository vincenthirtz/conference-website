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
// VP9 PROFIL 0, AVEC ALPHA — ET LE PROFIL COMPTE AUTANT QUE LE CODEC. Le
// navigateur embarqué d'OBS décode le VP9 (pas l'AV1 — cf.
// `TcgAnnouncement.tsx`), et le fichier porte un vrai canal alpha : pas
// d'incrustation couleur à régler, la source se pose telle quelle sur le jeu.
// Il n'y a PAS de repli MP4 : le H.264 n'a pas d'alpha, un repli afficherait un
// rectangle noir en plein direct — mieux vaut le texte seul.
//
// Ce commentaire s'est arrêté à « OBS décode le VP9 » jusqu'au 2026-09-23, et
// cette demi-vérité a coûté deux correctifs à côté de la plaque. L'habillage
// était en VP9 **profil 1** (`gbrp`, 4:4:4) : le CEF d'OBS ne connaît que les
// profils 0 et 2 et rendait `PIPELINE_ERROR_DECODE` à la première image, donc
// le texte seul, en plein direct. Chrome de bureau, lui, le lisait sans broncher
// — aucun test en navigateur ne pouvait l'attraper, il a fallu se brancher en
// CDP sur la source OBS pour le voir. `tests/unit/overlayAlertFrame.test.ts`
// fige désormais profil, alpha, parité des dimensions et rapport d'image.
//
// Le fichier est en 1000×562, soit exactement le double de la taille sur
// laquelle les bornes ci-dessous ont été mesurées : le rapport d'image est
// inchangé (donc `BAND` et `CARD_RATIO` restent valables au pixel près), et le
// 4:2:0 à cette échelle restitue la chroma 4:4:4 de l'original.
//
// UN HABILLAGE DÉPOSÉ REMPLACE LE NŒUD, MAIS PAS SES RÈGLES. Les bornes
// ci-dessus sont mesurées sur CE fichier-là ; sur une image ou une vidéo
// quelconque, elles ne veulent rien dire. Le texte s'affiche donc tout de
// suite, dans un bandeau sobre posé en bas de l'habillage — lisible sur
// n'importe quel fond, ce que la bande verte n'est que sur le nœud.
// Retirer le fichier rétablit le nœud : il reste le défaut du code.
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

/** Délai au-delà duquel une vidéo qui n'a pas démarré cède le texte à la plaque. */
const STALL_MS = 2500;

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
  /** Habillage déposé par la régie. `null` = celui du code (le nœud). */
  frameUrl?: string | null;
  frameKind?: 'image' | 'video' | null;
  locale?: string;
};

export function AlertBoxSource({
  alert,
  rules,
  scale = 1,
  position = 'center',
  soundUrl = null,
  soundVolume = 70,
  frameUrl = null,
  frameKind = null,
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
  // Vrai quand la vidéo NE PEUT PAS jouer (erreur, autoplay refusé) : on la
  // retire et on bascule sur la plaque sobre.
  const [videoFailed, setVideoFailed] = useState(false);
  // Vrai quand la vidéo TARDE : le texte passe sur la plaque, mais la vidéo
  // reste montée et reprend la main dès qu'elle joue (cf. `onPlaying`).
  const [stalled, setStalled] = useState(false);

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
    setStalled(false);
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

  // Repli : si la vidéo n'a rien joué au bout de STALL_MS, on montre le texte
  // plutôt que d'attendre un événement qui ne viendra peut-être pas.
  //
  // SANS RETIRER LA VIDÉO. Ce délai retirait l'élément pour de bon : dans
  // Streamlabs, un premier chargement plus lent qu'une seconde suffisait à
  // faire disparaître l'habillage pour toute l'alerte (constaté le
  // 2026-09-18). Une vidéo lente n'est pas une vidéo cassée : seul `onError`
  // ou un autoplay refusé la retirent.
  useEffect(() => {
    if (!alert) return undefined;
    const timer = setTimeout(() => {
      const video = videoRef.current;
      if (!video || video.currentTime === 0) setStalled(true);
    }, STALL_MS);
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
  // Un habillage déposé n'a pas de bande mesurée : le texte ne l'attend pas.
  const custom = Boolean(frameUrl && frameKind);
  // Plaque de repli : vidéo cassée, ou vidéo qui tarde (et pas encore jouée).
  const fallback = videoFailed || stalled;
  const showText = custom || fallback || bandOpen;
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
        {custom && frameKind === 'image' && (
          // biome-ignore lint/performance/noImgElement: source OBS, hors next/image (même exclusion que SponsorRotator)
          <img
            src={frameUrl as string}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        )}

        {!videoFailed && (!custom || frameKind === 'video') && (
          <video
            // La clé force un élément neuf par alerte : l'animation repart du
            // premier plan, y compris si deux alertes s'enchaînent.
            key={`${alert.id}:${frameUrl ?? 'defaut'}`}
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
            onPlaying={() => setStalled(false)}
            onError={() => setVideoFailed(true)}
          >
            {/* Pas de repli MP4 : le H.264 n'a pas d'alpha (cf. en-tête). */}
            <source src={custom ? (frameUrl as string) : ALERT_FRAME_SRC} />
          </video>
        )}

        {/* Plaque de repli, uniquement quand la vidéo ne peut pas jouer. */}
        {(fallback || custom) && (
          // Plaque sobre : elle porte le texte quand la bande verte du nœud
          // n'est pas là — repli d'erreur, ou habillage déposé dont on ignore
          // tout de la composition.
          //
          // EN BAS SUR UN HABILLAGE DÉPOSÉ, au centre sur le repli. Au centre
          // d'une image, la plaque masque le sujet — vérifié au rendu : elle
          // barrait le visuel en plein milieu. Un bas d'image est le placement
          // conventionnel d'un sous-titre, et le moins destructeur quand on ne
          // sait rien de la composition. Sur le repli il n'y a aucune image
          // derrière : le centre est alors le bon endroit.
          <div
            aria-hidden
            className={`absolute inset-x-[6%] rounded-2xl border border-white/15 bg-black/75 backdrop-blur-sm ${
              custom ? 'bottom-[6%]' : 'top-1/2 -translate-y-1/2'
            }`}
            style={{ padding: cardWidth * 0.03 }}
          />
        )}

        <div
          ref={bandRef}
          className="absolute flex items-center justify-center overflow-hidden text-center"
          style={
            custom
              ? { left: '6%', right: '6%', bottom: '6%', height: '16%' }
              : fallback
                ? { inset: '0 8%' }
                : bandStyle
          }
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
              color: fallback || custom ? '#ffffff' : '#14210f',
              textShadow:
                fallback || custom
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
