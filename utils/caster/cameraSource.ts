// Détection et normalisation d'un « lien de captation » d'opérateur caméra.
//
// Un opérateur distant (caméraman sur site, second commentateur, caméra de
// salle…) fournit une URL. Selon sa nature, l'overlay doit rendre soit une
// iframe, soit une balise <video> — et l'URL doit souvent être RÉÉCRITE pour
// être embarquable (Twitch et YouTube exigent leurs URL de player).
//
// Module PUR : aucune dépendance au DOM. `hostname` est passé en paramètre
// (Twitch impose un `parent=` égal au domaine de la page hôte, qui diffère
// entre prod, préprod et localhost).
//
// Latences à connaître, elles décident de l'usage :
//   vdoninja  WebRTC       < 1 s   → seul choix pour du direct synchronisé
//   file      MP4/WebM     ~1-2 s  → clip ou flux progressif
//   hls       .m3u8        10-30 s → vue d'ambiance, jamais de l'action
//   twitch    player       5-15 s  → idem
//   youtube   player       5-15 s  → idem

/** Nature de rendu déduite de l'URL. */
export type CameraSourceKind =
  | 'vdoninja'
  | 'twitch'
  | 'youtube'
  | 'hls'
  | 'file'
  | 'unknown';

export type CameraSource = {
  kind: CameraSourceKind;
  /** URL à donner à l'iframe (kind iframe) ou à <video src> (kind média). */
  url: string;
  /** true ⇒ rendu en iframe ; false ⇒ balise <video>. */
  isFrame: boolean;
  /** Latence indicative, affichée dans l'éditeur pour éclairer le choix. */
  latency: 'sub-second' | 'low' | 'high' | 'unknown';
};

const EMPTY: CameraSource = {
  kind: 'unknown',
  url: '',
  isFrame: false,
  latency: 'unknown',
};

/** Ajoute le schéma https:// à une saisie du type `twitch.tv/xxx`. */
function withScheme(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  // Un `//host/...` protocole-relatif est traité comme https.
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return `https://${trimmed}`;
}

function parse(raw: string): URL | null {
  try {
    return new URL(withScheme(raw));
  } catch {
    return null;
  }
}

/** `youtu.be/ID`, `youtube.com/watch?v=ID`, `/live/ID`, `/embed/ID` → ID. */
function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.split('/').filter(Boolean)[0];
    return id || null;
  }
  const v = u.searchParams.get('v');
  if (v) return v;
  const parts = u.pathname.split('/').filter(Boolean);
  const marker = parts.findIndex((p) => p === 'live' || p === 'embed');
  if (marker >= 0 && parts[marker + 1]) return parts[marker + 1];
  return null;
}

/** `twitch.tv/chaine` → `chaine` (ignore les sous-chemins connus). */
function twitchChannel(u: URL): string | null {
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  // /videos/123, /directory/... ne sont pas des chaînes embarquables ici.
  if (['videos', 'directory', 'embed', 'popout'].includes(parts[0])) {
    return parts[0] === 'popout' && parts[1] ? parts[1] : null;
  }
  return parts[0];
}

/**
 * Analyse un lien de captation. `hostname` sert au `parent=` exigé par le
 * player Twitch — sans lui, Twitch refuse d'être embarqué.
 */
export function detectCameraSource(
  raw: string,
  hostname = 'owwomenscup.fr'
): CameraSource {
  const u = parse(raw);
  if (!u) return EMPTY;

  const host = u.hostname.replace(/^www\./, '');

  // --- VDO.Ninja : WebRTC, la seule option réellement temps réel -----------
  // On accepte l'URL telle quelle (elle porte déjà ses paramètres de qualité),
  // en forçant seulement le mode « propre » pour une sortie antenne.
  if (host === 'vdo.ninja' || host.endsWith('.vdo.ninja')) {
    const url = new URL(u.toString());
    // `cleanoutput` retire l'UI de VDO.Ninja (boutons, bandeaux) : indispensable
    // à l'antenne. `transparent` évite un fond noir autour du flux.
    if (!url.searchParams.has('cleanoutput')) {
      url.searchParams.set('cleanoutput', '1');
    }
    return {
      kind: 'vdoninja',
      url: url.toString(),
      isFrame: true,
      latency: 'sub-second',
    };
  }

  // --- Twitch : player embarqué (parent obligatoire) -----------------------
  if (host === 'twitch.tv' || host === 'player.twitch.tv') {
    // Déjà une URL de player : on la complète simplement.
    if (host === 'player.twitch.tv') {
      const url = new URL(u.toString());
      url.searchParams.set('parent', hostname);
      if (!url.searchParams.has('muted')) url.searchParams.set('muted', 'true');
      if (!url.searchParams.has('autoplay')) {
        url.searchParams.set('autoplay', 'true');
      }
      return {
        kind: 'twitch',
        url: url.toString(),
        isFrame: true,
        latency: 'high',
      };
    }
    const channel = twitchChannel(u);
    if (!channel) return EMPTY;
    const url = new URL('https://player.twitch.tv/');
    url.searchParams.set('channel', channel);
    url.searchParams.set('parent', hostname);
    // Muet par défaut : l'audio du programme vient d'OBS, pas de l'iframe.
    url.searchParams.set('muted', 'true');
    url.searchParams.set('autoplay', 'true');
    return {
      kind: 'twitch',
      url: url.toString(),
      isFrame: true,
      latency: 'high',
    };
  }

  // --- YouTube : player embarqué ------------------------------------------
  if (
    host === 'youtube.com' ||
    host === 'youtu.be' ||
    host === 'youtube-nocookie.com'
  ) {
    const id = youtubeId(u);
    if (!id) return EMPTY;
    const url = new URL(`https://www.youtube.com/embed/${id}`);
    url.searchParams.set('autoplay', '1');
    url.searchParams.set('mute', '1');
    // Pas de contrôles ni de vidéos suggérées à l'antenne.
    url.searchParams.set('controls', '0');
    url.searchParams.set('rel', '0');
    url.searchParams.set('playsinline', '1');
    return {
      kind: 'youtube',
      url: url.toString(),
      isFrame: true,
      latency: 'high',
    };
  }

  // --- Flux/fichier direct ------------------------------------------------
  const pathname = u.pathname.toLowerCase();
  if (pathname.endsWith('.m3u8')) {
    return { kind: 'hls', url: u.toString(), isFrame: false, latency: 'high' };
  }
  if (/\.(mp4|webm|mov|m4v)$/.test(pathname)) {
    return { kind: 'file', url: u.toString(), isFrame: false, latency: 'low' };
  }

  return EMPTY;
}

/** Le lien est-il exploitable ? (l'éditeur s'en sert pour alerter le caster) */
export function isSupportedCameraSource(
  raw: string,
  hostname?: string
): boolean {
  return detectCameraSource(raw, hostname).kind !== 'unknown';
}

/** Objet-ajustement CSS d'un flux dans le cadre de la scène. */
export type CameraFit = 'cover' | 'contain';

/** Formes de cadre proposées — mêmes valeurs que la scène webcam locale. */
export const CAMERA_SHAPES = ['rounded', 'square', 'circle'] as const;
export type CameraShape = (typeof CAMERA_SHAPES)[number];
