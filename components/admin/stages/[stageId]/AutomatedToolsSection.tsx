// components/admin/stages/[stageId]/AutomatedToolsSection.tsx
import React from 'react';
import Link from 'next/link';
import type { Stage } from '@/types/admin';
import type { Dict } from './stageDisplay';

type Props = {
  stage: Stage;
  loadingActions: boolean;
  onAutoByes: () => void;
  onOpenAutoSeed: () => void;
  onGenerateSwissRound: () => void;
  t: Dict;
};

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
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg
          className="w-5 h-5 text-neutral-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        {t.autoToolsTitle}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={onAutoByes}
          disabled={loadingActions}
          className={`p-4 rounded-xl border text-left transition-all ${
            loadingActions
              ? 'bg-neutral-800/50 border-neutral-700 cursor-wait opacity-50'
              : 'bg-neutral-900/50 border-neutral-700 hover:bg-neutral-800 hover:border-neutral-600'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-600/20 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-orange-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
            </div>
            <div>
              <div className="font-medium text-sm">{t.autoByeTitle}</div>
              <div className="text-xs text-neutral-500">{t.autoByeDesc}</div>
            </div>
          </div>
        </button>

        {stage.stage_type === 'bracket' && (
          <button
            type="button"
            onClick={onOpenAutoSeed}
            disabled={loadingActions}
            className={`p-4 rounded-xl border text-left transition-all ${
              loadingActions
                ? 'bg-neutral-800/50 border-neutral-700 cursor-wait opacity-50'
                : 'bg-purple-900/20 border-purple-700/50 hover:bg-purple-900/30 hover:border-purple-600/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-600/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-purple-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
              </div>
              <div>
                <div className="font-medium text-sm text-purple-200">
                  {t.autoSeedTitle}
                </div>
                <div className="text-xs text-purple-400/70">
                  {t.autoSeedDesc}
                </div>
              </div>
            </div>
          </button>
        )}

        {stage.stage_type === 'bracket' && (
          <Link
            href={`/admin/stages/${stage.id}/seeding`}
            className="p-4 rounded-xl border text-left transition-all bg-indigo-900/20 border-indigo-700/50 hover:bg-indigo-900/30 hover:border-indigo-600/50"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-indigo-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"
                  />
                </svg>
              </div>
              <div>
                <div className="font-medium text-sm text-indigo-200">
                  {t.seedingComparatorTitle}
                </div>
                <div className="text-xs text-indigo-400/70">
                  {t.seedingComparatorDesc}
                </div>
              </div>
            </div>
          </Link>
        )}

        {stage.stage_type === 'swiss' && (
          <button
            type="button"
            onClick={onGenerateSwissRound}
            disabled={loadingActions}
            className={`p-4 rounded-xl border text-left transition-all ${
              loadingActions
                ? 'bg-neutral-800/50 border-neutral-700 cursor-wait opacity-50'
                : 'bg-amber-900/20 border-amber-700/50 hover:bg-amber-900/30 hover:border-amber-600/50'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-amber-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                  />
                </svg>
              </div>
              <div>
                <div className="font-medium text-sm text-amber-200">
                  {t.genSwissTitle}
                </div>
                <div className="text-xs text-amber-400/70">
                  {t.genSwissDesc}
                </div>
              </div>
            </div>
          </button>
        )}
      </div>

      {loadingActions && (
        <div className="mt-4 text-xs text-neutral-400 flex items-center gap-2">
          <div className="w-3 h-3 border border-neutral-500 border-t-white rounded-full animate-spin" />
          {t.processing}
        </div>
      )}
    </section>
  );
}

export default React.memo(AutomatedToolsSection);
