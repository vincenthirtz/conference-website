// Générateur de liens VDO.Ninja pour la scène `camera` (captation d'un
// opérateur DISTANT).
//
// VDO.Ninja est le seul transport réellement temps réel (WebRTC, < 1 s) et le
// moins évident à mettre en place : il faut DEUX liens dérivés d'un même
// identifiant de salle, et personne ne les retient.
//
//   https://vdo.ninja/?push=<id>   → envoyé à l'opérateur (il pousse sa caméra)
//   https://vdo.ninja/?view=<id>   → collé dans la scène (l'overlay reçoit)
//
// Module PUR (aucun DOM, aléatoire injectable) pour être testé unitairement :
// une faute de frappe dans un de ces deux liens, c'est un cadre noir à l'antenne.
//
// ⚠️ L'identifiant est le SEUL secret de la salle : quiconque l'a peut pousser
// une caméra. D'où le tirage aléatoire par défaut plutôt qu'un `cam1` devinable
// et partagé entre deux événements.

/** Base publique de VDO.Ninja (instance officielle, pas d'auto-hébergement). */
const VDO_BASE = 'https://vdo.ninja/';

/**
 * Alphabet du tirage : minuscules + chiffres, SANS les caractères ambigus à
 * l'oral ou à la lecture (0/o, 1/l/i) — l'identifiant est parfois dicté au
 * téléphone à l'opérateur.
 */
const ID_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';

/** Longueur du tirage (30^8 ≈ 6,5 × 10^11 combinaisons : collision négligeable). */
const ID_LENGTH = 8;

/** Préfixe lisible, pour reconnaître nos salles dans un historique de liens. */
const ID_PREFIX = 'wc';

/**
 * Normalise un identifiant de salle saisi à la main. VDO.Ninja n'accepte que
 * l'alphanumérique dans ses paramètres de salle (il retire le reste
 * silencieusement) : on applique la même règle ici pour que le lien affiché soit
 * exactement celui qui sera utilisé — un `cam-1` deviendrait sinon `cam1` côté
 * VDO.Ninja et l'opérateur ne serait pas dans la même salle que le récepteur.
 */
export function sanitizeVdoRoomId(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 32);
}

/**
 * Identifiant de salle aléatoire (`wc` + 8 caractères).
 *
 * `rand` est injectable pour les tests ; l'appelant côté React doit invoquer
 * cette fonction dans un handler ou un effet, jamais pendant le rendu (règle
 * ESLint `react-hooks/purity`).
 */
export function randomVdoRoomId(rand: () => number = Math.random): string {
  let out = ID_PREFIX;
  for (let i = 0; i < ID_LENGTH; i += 1) {
    const idx = Math.floor(rand() * ID_ALPHABET.length);
    // Un `rand()` renvoyant 1 (ou légèrement plus) ne doit pas sortir de
    // l'alphabet : on borne au dernier index.
    out += ID_ALPHABET[Math.min(Math.max(idx, 0), ID_ALPHABET.length - 1)];
  }
  return out;
}

export type VdoNinjaLinks = {
  /** Identifiant de salle réellement utilisé (après normalisation). */
  roomId: string;
  /** Lien à ENVOYER à l'opérateur : il ouvre, autorise sa caméra, ça pousse. */
  push: string;
  /** Lien de RÉCEPTION à coller dans le champ « Lien de captation ». */
  view: string;
};

/**
 * Couple de liens push/view d'une salle. `null` si l'identifiant est vide après
 * normalisation (sinon on afficherait `?push=` — un lien qui ne mène nulle part).
 *
 * Le lien de réception ne porte pas `cleanoutput` : `detectCameraSource()` l'y
 * ajoute au rendu, et c'est lui la source de vérité de l'URL embarquée.
 */
export function vdoNinjaLinks(rawId: string): VdoNinjaLinks | null {
  const roomId = sanitizeVdoRoomId(rawId);
  if (!roomId) return null;
  return {
    roomId,
    push: `${VDO_BASE}?push=${roomId}`,
    view: `${VDO_BASE}?view=${roomId}`,
  };
}
