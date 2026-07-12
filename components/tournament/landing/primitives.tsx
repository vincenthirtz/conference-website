// components/tournament/landing/primitives.tsx
//
// Primitives partagées de la landing tournoi. TOUTES les sections les
// consomment : c'est ce qui garantit une identité visuelle unique (spacing,
// glass, titres dégradés, scroll-reveal). Aucune donnée ici — pure présentation.

import type { CSSProperties, ReactNode, Ref } from 'react';
import { useReveal } from '@/hooks/useReveal';

/* ─────────────────────────────────────────────
 * Section — coquille pleine largeur avec rythme vertical cohérent.
 * ────────────────────────────────────────────*/
export function Section({
  id,
  children,
  className = '',
  containerClassName = '',
}: {
  id?: string;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
}) {
  return (
    <section
      id={id}
      className={`relative scroll-mt-24 py-16 sm:py-20 md:py-24 ${className}`}
    >
      <div
        className={`relative z-[1] mx-auto w-full max-w-6xl px-4 sm:px-6 ${containerClassName}`}
      >
        {children}
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────
 * Spotlight — aura radiale décorative (sous le contenu).
 * ────────────────────────────────────────────*/
export function Spotlight({
  color = 'violet',
  className = '',
  style,
}: {
  color?: 'violet' | 'green' | 'yellow';
  className?: string;
  style?: CSSProperties;
}) {
  const bg =
    color === 'green'
      ? 'rgba(123,201,106,0.16)'
      : color === 'yellow'
        ? 'rgba(240,230,60,0.12)'
        : 'rgba(178,75,224,0.22)';
  return (
    <div
      aria-hidden="true"
      className={`tl-spotlight ${className}`}
      style={{ background: bg, ...style }}
    />
  );
}

/* ─────────────────────────────────────────────
 * Reveal — révèle ses enfants au scroll (one-shot, reduced-motion safe).
 * `as` permet de changer la balise (li, article…). `stagger` cascade.
 * ────────────────────────────────────────────*/
export function Reveal({
  children,
  className = '',
  stagger,
  as = 'div',
}: {
  children: ReactNode;
  className?: string;
  stagger?: 1 | 2 | 3 | 4 | 5;
  as?: 'div' | 'li' | 'article' | 'span';
}) {
  const { ref, revealed } = useReveal<HTMLElement>();
  const Tag = as as 'div';
  return (
    <Tag
      ref={ref as Ref<HTMLDivElement>}
      data-revealed={revealed}
      data-stagger={stagger}
      className={`tl-reveal ${className}`}
    >
      {children}
    </Tag>
  );
}

/* ─────────────────────────────────────────────
 * Eyebrow — micro-label de section (au-dessus du titre).
 * ────────────────────────────────────────────*/
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-violet-light)]">
      <span className="brand-dot" aria-hidden />
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────
 * SectionHeader — eyebrow + titre dégradé + sous-titre.
 * ────────────────────────────────────────────*/
export function SectionHeader({
  eyebrow,
  title,
  subtitle,
  align = 'center',
  action,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  align?: 'center' | 'left';
  action?: ReactNode;
}) {
  const isCenter = align === 'center';
  return (
    <div
      className={`mb-10 flex flex-col gap-4 md:mb-14 ${
        isCenter
          ? 'items-center text-center'
          : 'items-start text-left md:flex-row md:items-end md:justify-between'
      }`}
    >
      <div className={isCenter ? 'max-w-2xl' : 'max-w-2xl'}>
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className="text-brand-gradient mt-3 text-3xl font-extrabold leading-[1.05] tracking-tight sm:text-4xl md:text-5xl">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-4 text-sm leading-relaxed text-gray-300 sm:text-base">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────
 * GlassCard — surface verre cohérente (bordure + blur + hover).
 * ────────────────────────────────────────────*/
export function GlassCard({
  children,
  className = '',
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  interactive?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] backdrop-blur-sm ${
        interactive
          ? 'transition-all duration-300 hover:-translate-y-1 hover:border-white/25 hover:bg-white/[0.06]'
          : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
