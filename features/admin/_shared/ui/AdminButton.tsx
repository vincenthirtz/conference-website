// features/admin/_shared/ui/AdminButton.tsx — les boutons des planches
// « Le Ruban » (archétype Liste / Fiche).
//
//   primary   vert feuille, texte encre — l'action PRINCIPALE de l'écran
//             (« NOUVELLE ÉQUIPE », « ENREGISTRER ») : le vert est le jeu,
//             l'action qui fait avancer ;
//   secondary contour orchidée — l'action d'institution (« OUVRIR LA RÉGIE ») ;
//   ghost     contour trait — le reste (« IMPORTER », « EXPORTER ») ;
//   danger    contour erreur — la zone sensible (« EXÉCUTER »).
//
// Un seul `primary` par écran : c'est ce qui le rend lisible.

import Link, { type LinkProps } from 'next/link';
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
  Ref,
} from 'react';

export type AdminButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type AdminButtonSize = 'md' | 'sm' | 'xs';

const VARIANT: Record<AdminButtonVariant, string> = {
  primary:
    'bg-[var(--lf,#7fca65)] text-[#0f0a12] border-[var(--lf-300,#8ed377)] hover:bg-[var(--lf-300,#8ed377)]',
  secondary:
    'bg-transparent text-[var(--or-200,#eec4ff)] border-[rgba(180,103,209,.45)] hover:border-[var(--or,#b467d1)] hover:bg-[rgba(180,103,209,.08)]',
  ghost:
    'bg-transparent text-[var(--t2,#c7bfca)] border-[var(--line2,rgba(194,196,201,.2))] hover:text-[var(--t1,#f4edf7)] hover:border-[var(--t4,#807984)]',
  danger:
    'bg-transparent text-[var(--err,#ff6b6b)] border-[rgba(255,107,107,.45)] hover:bg-[rgba(255,107,107,.08)]',
};

const SIZE: Record<AdminButtonSize, string> = {
  md: 'h-11 px-[18px] text-[14px]',
  sm: 'h-[38px] px-[14px] text-[12px]',
  xs: 'h-[30px] px-3 text-[11px]',
};

function classes(variant: AdminButtonVariant, size: AdminButtonSize) {
  return `inline-flex shrink-0 items-center justify-center gap-2 rounded-[var(--r-ctrl,4px)] border font-[family-name:var(--fd)] font-bold uppercase tracking-[0.02em] transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]}`;
}

type Common = {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  children: ReactNode;
};

export default function AdminButton({
  variant = 'ghost',
  size = 'md',
  className = '',
  type = 'button',
  children,
  ref,
  ...rest
}: Common &
  ButtonHTMLAttributes<HTMLButtonElement> & {
    /** React 19 : la ref est une prop (focus rendu après un changement d'état). */
    ref?: Ref<HTMLButtonElement>;
  }) {
  return (
    <button
      ref={ref}
      type={type}
      className={`${classes(variant, size)} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * Même allure, pour une navigation (« NOUVELLE ÉQUIPE » → /admin/teams/new),
 * interne ou externe. `target="_blank"` pose `rel="noopener noreferrer"` par
 * défaut ; un `rel` explicite l'emporte.
 */
export function AdminButtonLink({
  href,
  variant = 'ghost',
  size = 'md',
  className = '',
  children,
  target,
  rel,
  ...rest
}: Common &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children'> & {
    href: LinkProps['href'];
    'data-testid'?: string;
  }) {
  return (
    <Link
      href={href}
      target={target}
      rel={rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)}
      {...rest}
      className={`${classes(variant, size)} ${className}`}
    >
      {children}
    </Link>
  );
}
