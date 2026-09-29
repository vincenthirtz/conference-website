// features/ruban/Card.tsx — la surface carte du kit : encre --s1, filet
// --line, rayon --r-card. C'est elle qui remplacera, écran par écran (lots
// P8+), la surface carte ad hoc `bg-white/[0.03]` de l'espace joueuse ; les
// écrans ne sont pas migrés ici (lot P7 : la brique seule).
//
// Couleur = signal : une carte est d'encre ; seul l'état EN DIRECT la teinte
// (`live` : filet feuille + la seule lueur de la plateforme). Jetons avec
// repli : rendue hors surface (aperçu, test), la carte garde son allure.

import type { HTMLAttributes, ReactNode } from 'react';

export type CardPadding = 'none' | 'sm' | 'md';
type CardElement = 'div' | 'section' | 'article' | 'li';

const PADDING: Record<CardPadding, string> = {
  none: 'overflow-hidden',
  sm: 'p-4',
  md: 'p-6',
};

const SURFACE =
  'rounded-[var(--r-card,14px)] border bg-[var(--s1,#100812)] text-[var(--t1,#f4edf7)]';
const LINE = 'border-[var(--line,rgba(194,196,201,.12))]';
const LIVE =
  'border-[rgba(127,202,101,.55)] shadow-[var(--glow-live,0_0_0_1px_rgba(127,202,101,.55),0_0_26px_-6px_rgba(127,202,101,.6))]';

export default function Card({
  as: Tag = 'div',
  padding = 'md',
  live = false,
  className = '',
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & {
  /** Balise rendue : `section` pour une section titrée, `li` dans une liste. */
  as?: CardElement;
  padding?: CardPadding;
  /** État EN DIRECT : filet feuille + lueur. */
  live?: boolean;
  children: ReactNode;
  'data-testid'?: string;
}) {
  return (
    <Tag
      {...rest}
      data-ruban-card=""
      className={`${SURFACE} ${live ? LIVE : LINE} ${PADDING[padding]} ${className}`}
    >
      {children}
    </Tag>
  );
}
