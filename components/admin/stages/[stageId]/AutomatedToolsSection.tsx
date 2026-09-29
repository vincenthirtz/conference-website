// components/admin/stages/[stageId]/AutomatedToolsSection.tsx
import React, { type ReactNode } from 'react';
import Link from 'next/link';
import type { Stage } from '@/types/admin';
import {
  rubanCardPadded,
  rubanCardTitle,
  rubanMuted,
  rubanRowIcon,
  rubanRowLink,
} from '@/features/admin/_shared/ui/ruban';
import type { Dict } from './stageDisplay';

type Props = {
  stage: Stage;
  loadingActions: boolean;
  onAutoByes: () => void;
  onOpenAutoSeed: () => void;
  onGenerateSwissRound: () => void;
  t: Dict;
};

const ICON: Record<string, string> = {
  byes: 'M13 10V3L4 14h7v7l9-11h-7z',
  seed: 'M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4',
  seeding: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  swiss: 'M12 6v6m0 0v6m0-6h6m-6 0H6',
};

function ToolBody({
  icon,
  title,
  desc,
}: {
  icon: string;
  title: ReactNode;
  desc: ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className={rubanRowIcon}>
        <svg
          className="h-5 w-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d={icon}
          />
        </svg>
      </div>
      <div>
        <div className="text-sm font-medium text-[var(--t1,#f4edf7)]">
          {title}
        </div>
        <div className={`text-xs ${rubanMuted}`}>{desc}</div>
      </div>
    </div>
  );
}

/**
 * Section « Outils automatisés » (auto-byes, auto-seed bracket, seeding
 * comparateur, génération de round Swiss). Callbacks stables + `stage`/
 * `loadingActions` → `React.memo` évite la reconciliation à chaque frappe.
 */
function AutomatedToolsSection({
  stage,
  loadingActions,
  onAutoByes,
  onOpenAutoSeed,
  onGenerateSwissRound,
  t,
}: Props) {
  return (
    <section className={rubanCardPadded}>
      <h2 className={`${rubanCardTitle} mb-4`}>{t.autoToolsTitle}</h2>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <button
          type="button"
          data-case="normal"
          onClick={onAutoByes}
          disabled={loadingActions}
          className={rubanRowLink}
        >
          <ToolBody
            icon={ICON.byes}
            title={t.autoByeTitle}
            desc={t.autoByeDesc}
          />
        </button>

        {stage.stage_type === 'bracket' && (
          <button
            type="button"
            data-case="normal"
            onClick={onOpenAutoSeed}
            disabled={loadingActions}
            className={rubanRowLink}
          >
            <ToolBody
              icon={ICON.seed}
              title={t.autoSeedTitle}
              desc={t.autoSeedDesc}
            />
          </button>
        )}

        {stage.stage_type === 'bracket' && (
          <Link
            href={`/admin/stages/${stage.id}/seeding`}
            className={rubanRowLink}
          >
            <ToolBody
              icon={ICON.seeding}
              title={t.seedingComparatorTitle}
              desc={t.seedingComparatorDesc}
            />
          </Link>
        )}

        {stage.stage_type === 'swiss' && (
          <button
            type="button"
            data-case="normal"
            onClick={onGenerateSwissRound}
            disabled={loadingActions}
            className={rubanRowLink}
          >
            <ToolBody
              icon={ICON.swiss}
              title={t.genSwissTitle}
              desc={t.genSwissDesc}
            />
          </button>
        )}
      </div>

      {loadingActions && (
        <div className={`mt-4 flex items-center gap-2 text-xs ${rubanMuted}`}>
          <div className="h-3 w-3 animate-spin rounded-full border border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)]" />
          {t.processing}
        </div>
      )}
    </section>
  );
}

export default React.memo(AutomatedToolsSection);
