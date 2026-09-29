// features/ruban/Chip.tsx — puce d'état des planches : rectangle,
// capitales étroites, couleur de SIGNAL seulement (jamais de marque).

import type { ReactNode } from 'react';

export type ChipTone = 'ok' | 'warn' | 'err' | 'neutral' | 'brand' | 'live';

const TONE: Record<ChipTone, string> = {
  ok: 'text-[var(--lf-200,#b3e7a3)] bg-[rgba(127,202,101,.13)] border-[rgba(127,202,101,.36)]',
  warn: 'text-[#ffd9a3] bg-[rgba(245,165,36,.13)] border-[rgba(245,165,36,.38)]',
  err: 'text-[#ffc2c2] bg-[rgba(255,107,107,.13)] border-[rgba(255,107,107,.4)]',
  neutral:
    'text-[var(--t3,#a39ba6)] border-[var(--line2,rgba(194,196,201,.2))]',
  brand:
    'text-[var(--or-200,#eec4ff)] bg-[rgba(180,103,209,.12)] border-[rgba(180,103,209,.4)]',
  // La SEULE lueur de la plateforme : l'état en direct.
  live: 'text-[var(--lf-200,#b3e7a3)] bg-[rgba(127,202,101,.13)] border-[rgba(127,202,101,.55)] shadow-[var(--glow-live,0_0_0_1px_rgba(127,202,101,.55),0_0_26px_-6px_rgba(127,202,101,.6))]',
};

export default function Chip({
  tone = 'neutral',
  children,
  title,
  'data-testid': testId,
}: {
  tone?: ChipTone;
  children: ReactNode;
  /** Info-bulle (ex. date d'expiration d'un plan). */
  title?: string;
  'data-testid'?: string;
}) {
  return (
    <span
      title={title}
      data-testid={testId}
      className={`inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-[3px] border px-2 font-[family-name:var(--fd,Archivo,sans-serif)] text-[11px] font-bold uppercase tracking-[0.12em] [font-stretch:75%] ${TONE[tone]}`}
    >
      {children}
    </span>
  );
}
