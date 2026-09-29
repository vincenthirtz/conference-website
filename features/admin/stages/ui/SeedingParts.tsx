// features/admin/stages/ui/SeedingParts.tsx — briques présentationnelles du
// comparateur de seeding (pages/admin/stages/[stageId]/seeding.tsx) : ligne
// de slot proposé, sélecteur de slot manuel, ligne du tableau par rating.
// Aucune donnée chargée ici.

import type { ReactNode } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminStageSeeding from '@/lib/i18n/locales/admin-fr/adminStageSeeding';
import Chip from '@/features/admin/_shared/ui/Chip';

export type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

export type RatingBreakdownRow = {
  teamId: string;
  teamName: string | null;
  shortName: string | null;
  logoUrl: string | null;
  rating: number;
  rd: number | null;
  sos: number;
  score: number;
  rank: number;
  provisional: boolean;
};

/** Champ de sélection compact des colonnes de seeding. */
export const SEED_SELECT =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none disabled:opacity-40';

const SEED_TAG =
  'rounded-[3px] bg-[var(--s3,#2f2732)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--t2,#c7bfca)]';

/** Carte d'une colonne (auto, manuel, rating) : en-tête, corps, pied. */
export function SeedColumn({
  title,
  count,
  footer,
  className = '',
  children,
}: {
  title: ReactNode;
  count: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] ${className}`}
    >
      <header className="flex items-center justify-between border-b border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3">
        <h2 className="text-[15px] text-[var(--t1,#f4edf7)]">{title}</h2>
        <span className="font-mono text-xs text-[var(--t3,#a39ba6)]">
          {count}
        </span>
      </header>
      {children}
      {footer && (
        <footer className="border-t border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3">
          {footer}
        </footer>
      )}
    </section>
  );
}

export function SlotRow({
  label,
  seed,
  team,
}: {
  label: string;
  seed: number | null;
  team: TeamLite | null;
}) {
  const t = useAdminT(nsAdminStageSeeding);
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="w-5 text-[var(--t4,#807984)]">{label}</span>
      {seed != null && <span className={SEED_TAG}>#{seed}</span>}
      <span
        className={
          team ? 'text-[var(--t1,#f4edf7)]' : 'italic text-[var(--t4,#807984)]'
        }
      >
        {team?.name ?? t.slotEmpty}
      </span>
    </div>
  );
}

export function DraftSelect({
  label,
  value,
  pool,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  pool: TeamLite[];
  disabled: boolean;
  onChange: (v: string) => void;
}) {
  const t = useAdminT(nsAdminStageSeeding);
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="w-5 text-[var(--t4,#807984)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={`${SEED_SELECT} flex-1 !py-1`}
      >
        <option value="">{t.slotEmpty}</option>
        {pool.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function RatingRow({ row }: { row: RatingBreakdownRow }) {
  const t = useAdminT(nsAdminStageSeeding);
  const label = row.teamName ?? row.shortName ?? t.teamUnknown;
  return (
    <tr className="text-[var(--t2,#c7bfca)]">
      <td className="py-2 pr-3">
        <span className={`${SEED_TAG} text-[11px]`}>#{row.rank}</span>
      </td>
      <td className="py-2 pr-3">
        <div className="flex items-center gap-2">
          {row.logoUrl ? (
            // biome-ignore lint/performance/noImgElement: image hors next/image (exclusion reprise d’ESLint)
            <img
              src={row.logoUrl}
              alt=""
              className="h-6 w-6 shrink-0 rounded-[3px] bg-[var(--s3,#2f2732)] object-cover"
            />
          ) : (
            <span className="h-6 w-6 shrink-0 rounded-[3px] bg-[var(--s3,#2f2732)]" />
          )}
          <span className="truncate text-[var(--t1,#f4edf7)]">{label}</span>
          {row.provisional && (
            <Chip tone="warn" title={t.provisionalTitle}>
              {t.provisionalBadge}
            </Chip>
          )}
        </div>
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums">
        {Math.round(row.rating)}
        {row.rd != null && (
          <span className="text-xs text-[var(--t4,#807984)]">
            {' '}
            ± {Math.round(row.rd)}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--t3,#a39ba6)]">
        {row.sos.toFixed(1)}
      </td>
      <td className="py-2 pr-3 text-right font-mono tabular-nums text-[var(--t1,#f4edf7)]">
        {row.score.toFixed(1)}
      </td>
    </tr>
  );
}
