// components/tcg/TcgCoin.tsx
//
// La pièce du TCG : le logo, en pastille, comme monnaie du jeu.
//
// POURQUOI UNE ICÔNE PLUTÔT QUE LE MOT « pièces ». Un montant revient partout
// — solde, prix d'un booster, reprise d'un doublon, chaque ligne d'historique.
// Répété en toutes lettres, il alourdit sans rien apprendre ; en pastille, il
// devient reconnaissable d'un coup d'œil et donne au jeu une monnaie qui a une
// tête. C'est aussi ce qui rattache visuellement l'économie à la marque, sans
// inventer un symbole de plus à faire vivre.
//
// LE CHIFFRE RESTE DU TEXTE, TOUJOURS. L'image est `aria-hidden` avec un `alt`
// vide, et le montant vit à côté d'elle en texte lisible. Une icône ne doit
// jamais porter seule une information chiffrée : ni pour un lecteur d'écran,
// ni quand l'image ne charge pas, ni pour qui grossit sa police.
//
// LE LOGO SUIT LE TENANT, comme les barres de navigation. `useTenantBranding()`
// rend `null` sur l'espace par défaut, et l'on retombe alors sur le logo local
// — exactement le motif de `PlayerTopBar`. Coder le chemin en dur ferait
// afficher NOTRE logo comme monnaie d'un autre espace.
//
// `unoptimized` UNIQUEMENT pour un logo de tenant : il vient d'une URL distante
// que l'optimiseur de Next refuserait faute d'être déclarée dans
// `remotePatterns` — l'image disparaîtrait alors sans la moindre erreur
// serveur. Le fichier local, lui, reste optimisé et servi redimensionné.

import Image from 'next/image';
import type { JSX } from 'react';

import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';

/** Logo de repli : celui de l'espace par défaut. */
const FALLBACK_LOGO = '/img/logos/2026-logo.png';

type CoinProps = {
  /** Côté de la pastille, en pixels. 16 par défaut — la taille d'un texte courant. */
  size?: number;
  className?: string;
};

/**
 * La pastille seule. Purement décorative : elle n'annonce rien à un lecteur
 * d'écran, le montant voisin s'en charge.
 */
export function TcgCoin({ size = 16, className }: CoinProps): JSX.Element {
  const branding = useTenantBranding();
  const src = branding?.logoUrl ?? FALLBACK_LOGO;

  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      width={size}
      height={size}
      // Le logo est carré et à fond transparent : il se pose sur le fond sombre
      // sans halo. `rounded-full` en fait une pièce plutôt qu'une vignette.
      className={`inline-block shrink-0 rounded-full align-[-0.15em] ${className ?? ''}`}
      unoptimized={Boolean(branding?.logoUrl)}
    />
  );
}

type AmountProps = {
  /** Le montant. Signé : un négatif est une dépense. */
  value: number;
  /** Préfixe le positif d'un `+` — utile dans un historique, pas sur un solde. */
  signed?: boolean;
  size?: number;
  className?: string;
};

/**
 * Un montant précédé de sa pièce.
 *
 * `tabular-nums` : dans une liste de mouvements, des chiffres de largeurs
 * inégales font danser la colonne d'un montant à l'autre.
 */
export function TcgAmount({
  value,
  signed = false,
  size = 16,
  className,
}: AmountProps): JSX.Element {
  const shown = signed && value >= 0 ? `+${value}` : String(value);

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      <TcgCoin size={size} />
      <span className="tabular-nums">{shown}</span>
    </span>
  );
}

export default TcgCoin;
