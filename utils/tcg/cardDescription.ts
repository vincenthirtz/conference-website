// utils/tcg/cardDescription.ts
//
// La DESCRIPTION d'une carte de la catégorie « L'association » : le court
// texte « à propos » que le staff écrit depuis l'onglet « L'association » de
// /admin/tcg, affiché sur la carte (collection, paquet, vitrine, catalogue).
//
// RÈGLES PURES, sans base ni réseau : ce module est lu par le navigateur (le
// compteur de l'éditeur) ET par la route, pour que les deux ne puissent pas
// diverger.
//
// TEXTE BRUT, ET C'EST LE RENDU QUI LE GARANTIT. La description s'affiche
// comme un nœud texte React (jamais `dangerouslySetInnerHTML`, jamais un
// rendu markdown) : une balise saisie s'afficherait telle quelle, elle ne
// s'exécuterait pas. On REFUSE quand même ce qui ressemble à du HTML — ce
// n'est pas une faille, mais une carte pleine de chevrons n'est pas ce qu'on
// veut faire circuler.
//
// PAS DE LIENS. La carte circule chez des tiers et s'affiche sur des pages
// publiques ; un lien y serait une redirection que personne ne revoit une
// fois la carte tirée. Le crédit a déjà son champ, vérifié, pour cela. Un
// lien est REFUSÉ avec un code clair plutôt que supprimé en silence : retirer
// un bout de phrase sans le dire publierait un texte que personne n'a écrit.
//
// NETTOYÉ SANS DEMANDER : les caractères de contrôle, les caractères
// invisibles (largeur nulle) et les inversions de sens d'écriture — ils ne se
// voient pas à la saisie et servent surtout à maquiller un texte.

/** Longueur maximale, en caractères (même borne que le CHECK SQL). */
export const CARD_DESCRIPTION_MAX = 280;

/** Lignes maximales : un encart, pas un mur de retours à la ligne. */
export const CARD_DESCRIPTION_MAX_LINES = 6;

export type DescriptionRefusal =
  | 'too_long'
  | 'links_not_allowed'
  | 'markup_not_allowed';

export type DescriptionResult =
  | { ok: true; description: string | null }
  | { ok: false; code: DescriptionRefusal };

// Contrôle C0 (sauf \n), DEL et C1 ; \t devient une espace plus bas.
const CONTROL = /[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g;
// Largeur nulle, BOM, et surcharges / isolats bidirectionnels.
const INVISIBLE = /[​-‏‪-‮⁠-⁩﻿]/g;

/**
 * Un lien, sous ses formes usuelles : schéma (`https://`), `www.`, invitation
 * Discord, ou un nom de domaine nu avec une extension courante. Volontairement
 * conservateur sur les domaines nus : « j'aime le .gg » ne doit pas tomber,
 * « monsite.gg » oui.
 */
const LINK =
  /(\b[a-z][a-z0-9+.-]*:\/\/|\bwww\.|discord(?:app)?\.(?:gg|com)\/|\b[a-z0-9-]{2,}\.(?:com|fr|net|org|gg|tv|io|me|ly|co|xyz|link|app|dev|eu|be|ch|ca|uk|info|shop|site|online|live)\b)/i;

/** Une balise HTML (ouvrante, fermante ou commentaire). */
const MARKUP = /<\/?[a-z!][^>]*>/i;

/**
 * Normalise puis valide une description saisie.
 *
 * - `null`, `undefined` ou un texte vide après nettoyage → `{ ok, description: null }`
 *   (effacer la description est un geste valide) ;
 * - fins de ligne unifiées, espaces de bord retirés par ligne, pas plus d'une
 *   ligne vide d'affilée, au plus `CARD_DESCRIPTION_MAX_LINES` lignes ;
 * - la longueur est mesurée APRÈS nettoyage, en points de code.
 */
export function normalizeCardDescription(
  raw: string | null | undefined
): DescriptionResult {
  if (raw === null || raw === undefined) return { ok: true, description: null };

  const cleaned = raw
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(CONTROL, '')
    .replace(INVISIBLE, '')
    .split('\n')
    .map((line) => line.replace(/ {2,}/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned === '') return { ok: true, description: null };

  if (MARKUP.test(cleaned)) return { ok: false, code: 'markup_not_allowed' };
  if (LINK.test(cleaned)) return { ok: false, code: 'links_not_allowed' };

  const lines = cleaned.split('\n');
  const capped =
    lines.length > CARD_DESCRIPTION_MAX_LINES
      ? `${lines.slice(0, CARD_DESCRIPTION_MAX_LINES - 1).join('\n')}\n${lines
          .slice(CARD_DESCRIPTION_MAX_LINES - 1)
          .filter((l) => l !== '')
          .join(' ')}`
      : cleaned;

  if ([...capped].length > CARD_DESCRIPTION_MAX)
    return { ok: false, code: 'too_long' };
  return { ok: true, description: capped };
}

/** Longueur affichée par le compteur : celle que le serveur mesurera. */
export function cardDescriptionLength(raw: string): number {
  const result = normalizeCardDescription(raw);
  if (result.ok) return result.description ? [...result.description].length : 0;
  return [...raw].length;
}
