// components/overlay/match/PartnersSource.tsx
//
// La source « partenaires » : les partenaires de l'association alignés sur UNE
// LIGNE, sur fond transparent — un bandeau à poser en bas d'écran.
//
// Ni panneau plein, ni fond opaque : la régie compose la scène autour. Chaque
// logo vit dans une pastille sombre, pour rester lisible par-dessus n'importe
// quelle image de jeu, et le titre est discret — ce qu'on vient lire, ce sont
// les logos.
//
// UN PARTENAIRE SANS LOGO AFFICHE SON NOM, à la même taille que les autres
// pastilles. Sauter la case laisserait un trou dans le bandeau, et taire le
// partenaire serait pire : il a payé pour être là (cf. WarsageStudios, qui n'a
// pas de logo en base).
//
// TAILLE : le bandeau s'agrandit jusqu'à remplir la source (cf. partnersFit),
// quelle que soit la hauteur réglée dans OBS. Une source 1920×160 donne un
// bandeau plein ; une source plus haute agrandit les pastilles au lieu de
// laisser du vide.

import type { CSSProperties } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import type { OverlayPartnerView } from '@/utils/overlay/partnersOverlay';
import { useViewportSize } from '@/hooks/useStageFit';

export type PartnersPosition = 'top' | 'center' | 'bottom';
export type PartnersAlign = 'left' | 'center' | 'right';

/** `?position=` : top · center · bottom (défaut — c'est un bas d'écran). */
export function parsePartnersPosition(
  raw: string | undefined
): PartnersPosition {
  return raw === 'top' || raw === 'center' ? raw : 'bottom';
}

/**
 * `?align=` : left · center (défaut) · right.
 *
 * CENTRÉ PAR DÉFAUT parce que le bandeau ne remplit PAS forcément la source :
 * il grandit jusqu'à tenir entier (cf. partnersFit), et deux partenaires dans
 * une source 1920 de large laissent donc les trois quarts vides. Collés à
 * gauche, ils ont l'air d'un gabarit mal réglé ; centrés, d'un choix.
 */
export function parsePartnersAlign(raw: string | undefined): PartnersAlign {
  return raw === 'left' || raw === 'right' ? raw : 'center';
}

/** Taille « de conception » d'une pastille, en pixels. */
const TILE = { w: 260, h: 96 };
const GAP = 24;
/** Marge autour du bandeau, pour que les pastilles ne touchent pas le bord. */
const MARGIN = 16;
/** Hauteur réservée au titre, à l'échelle 1. */
const HEADING_H = 34;

/**
 * Facteur qui fait tenir `count` pastilles dans la source.
 *
 * On prend le plus petit des deux ajustements (largeur, hauteur) : le bandeau
 * doit tenir ENTIER, jamais déborder. Plafonné à 2 — au-delà, deux partenaires
 * sur une source 1920 large donneraient des logos démesurés.
 *
 * Exportée pour être testable sans DOM.
 */
export function partnersFit(
  count: number,
  view: { width: number; height: number }
): number {
  if (count <= 0) return 1;
  const needW = count * TILE.w + (count - 1) * GAP + MARGIN * 2;
  const needH = TILE.h + HEADING_H + MARGIN * 2;
  const w = view.width > 0 ? view.width / needW : 1;
  const h = view.height > 0 ? view.height / needH : 1;
  return Math.min(2, Math.max(0.2, Math.min(w, h)));
}

type Props = {
  partners: OverlayPartnerView[];
  accent: string;
  /** Multiplicateur de la régie (`?scale=`), par-dessus l'ajustement auto. */
  scale?: number;
  position?: PartnersPosition;
  align?: PartnersAlign;
  /** `false` masque l'accroche et ne laisse que les logos. */
  showHeading?: boolean;
};

export function PartnersSource({
  partners,
  accent,
  scale = 1,
  position = 'bottom',
  align = 'center',
  showHeading = true,
}: Props) {
  const t = useT(nsOverlay);
  const view = useViewportSize();

  // Rien à annoncer : on ne rend RIEN plutôt qu'un bandeau vide. Une source
  // qui affiche un cadre sans contenu est pire que muette à l'antenne.
  if (partners.length === 0) return null;

  const fit = partnersFit(partners.length, view) * scale;
  const justify =
    position === 'top'
      ? 'flex-start'
      : position === 'center'
        ? 'center'
        : 'flex-end';
  const alignItems =
    align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';

  const tileStyle: CSSProperties = {
    width: TILE.w * fit,
    height: TILE.h * fit,
    borderRadius: 18 * fit,
    borderColor: `${accent}33`,
    padding: 16 * fit,
  };

  return (
    <div
      className="flex h-full w-full flex-col"
      style={{
        justifyContent: justify,
        alignItems,
        padding: MARGIN * fit,
      }}
    >
      {showHeading && (
        <p
          className="font-semibold uppercase text-white/70"
          style={{
            fontSize: 15 * fit,
            letterSpacing: 0.28 * 15 * fit,
            marginBottom: 10 * fit,
            textShadow: '0 2px 8px rgba(0,0,0,0.8)',
          }}
        >
          {t.partnersHeading}
        </p>
      )}

      <div
        className="flex flex-wrap items-center"
        style={{ gap: GAP * fit, justifyContent: alignItems }}
        aria-hidden="true"
      >
        {partners.map((partner) => (
          <div
            key={partner.id}
            className="flex items-center justify-center border bg-black/60 backdrop-blur-sm"
            style={tileStyle}
          >
            {partner.logoUrl ? (
              // biome-ignore lint/performance/noImgElement: source OBS, hors next/image (même exclusion que SponsorRotator)
              <img
                src={partner.logoUrl}
                alt={partner.name}
                className="h-full w-full object-contain"
              />
            ) : (
              <span
                className="text-center font-extrabold leading-tight text-white"
                style={{
                  fontSize: 26 * fit,
                  textShadow: '0 2px 8px rgba(0,0,0,0.8)',
                }}
              >
                {partner.name}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
