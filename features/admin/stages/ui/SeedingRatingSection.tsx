// features/admin/stages/ui/SeedingRatingSection.tsx — section « seed par
// rating » (Glicko + SoS) du comparateur de seeding
// (pages/admin/stages/[stageId]/seeding.tsx) : contrôles méthode / pattern /
// poids SoS, garde-fous, tableau du classement proposé.
//
// Purement présentationnel : l'état, le chargement de l'aperçu et
// l'application du seed restent dans la page, qui les passe en props.

import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminStageSeeding from '@/lib/i18n/locales/admin-fr/adminStageSeeding';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  RatingRow,
  type RatingBreakdownRow,
  SEED_EMPTY,
  SEED_FIELD_LABEL,
  SEED_SELECT,
  SeedColumn,
} from '@/features/admin/stages/ui/SeedingParts';
import {
  ERROR_BOX,
  MUTED,
  WARN_BOX,
} from '@/features/admin/stages/ui/rubanClasses';

const SECTION_ROW =
  'border-b border-[var(--line2,rgba(194,196,201,.2))] px-4 py-3';
const INLINE_LINK =
  'text-[var(--or-200,#eec4ff)] underline hover:text-[var(--t1,#f4edf7)]';

export type SeedingPattern = 'standard' | 'sequential';

export type RatingMethod = 'rating' | 'rating_sos';

export type RatingPreviewResponse = {
  proposed: { matchId: string; slot: 1 | 2; teamId: string; seed: number }[];
  breakdown: RatingBreakdownRow[];
  bracketMatchCount: number;
  lock: { locked: boolean; reasons: string[] };
  method: RatingMethod;
  pattern: SeedingPattern;
};

export default function SeedingRatingSection({
  ratingData,
  ratingMethod,
  onRatingMethodChange,
  ratingPattern,
  onRatingPatternChange,
  sosWeight,
  onSosWeightChange,
  ratingLoading,
  ratingError,
  ratingLocked,
  ratingNoBracket,
  ratingEmpty,
  submitting,
  onApply,
  onGoToStage,
}: {
  ratingData: RatingPreviewResponse | null;
  ratingMethod: RatingMethod;
  onRatingMethodChange: (v: RatingMethod) => void;
  ratingPattern: SeedingPattern;
  onRatingPatternChange: (v: SeedingPattern) => void;
  sosWeight: string;
  onSosWeightChange: (v: string) => void;
  ratingLoading: boolean;
  ratingError: string | null;
  ratingLocked: boolean;
  ratingNoBracket: boolean;
  ratingEmpty: boolean;
  submitting: boolean;
  onApply: () => void;
  onGoToStage: () => void;
}) {
  const t = useAdminT(nsAdminStageSeeding);
  return (
    <SeedColumn
      className="mt-6"
      title={t.ratingTitle}
      count={format(t.ratingRankedCount, {
        count: ratingData?.breakdown.length ?? 0,
      })}
      footer={
        <AdminButton
          variant="primary"
          className="w-full"
          onClick={onApply}
          disabled={
            submitting ||
            ratingLoading ||
            ratingLocked ||
            ratingNoBracket ||
            ratingEmpty ||
            !ratingData
          }
        >
          {submitting ? t.applying : t.applyRating}
        </AdminButton>
      }
    >
      <div className={`${SECTION_ROW} text-xs leading-relaxed ${MUTED}`}>
        {t.ratingIntroBefore}{' '}
        <Link href="/admin/ratings" className={INLINE_LINK}>
          {t.ratingIntroLink}
        </Link>{' '}
        {t.ratingIntroAfter}
      </div>

      {/* Contrôles */}
      <div className={`${SECTION_ROW} grid grid-cols-1 gap-3 md:grid-cols-3`}>
        <label className="text-sm">
          <span className={SEED_FIELD_LABEL}>{t.methodLabel}</span>
          <select
            value={ratingMethod}
            onChange={(e) =>
              onRatingMethodChange(e.target.value as RatingMethod)
            }
            disabled={submitting}
            className={SEED_SELECT}
          >
            <option value="rating_sos">{t.methodRatingSos}</option>
            <option value="rating">{t.methodRating}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className={SEED_FIELD_LABEL}>{t.patternLabel}</span>
          <select
            value={ratingPattern}
            onChange={(e) =>
              onRatingPatternChange(e.target.value as SeedingPattern)
            }
            disabled={submitting}
            className={SEED_SELECT}
          >
            <option value="standard">{t.patternStandard}</option>
            <option value="sequential">{t.patternSequential}</option>
          </select>
        </label>
        <label className="text-sm">
          <span className={SEED_FIELD_LABEL}>
            {t.sosWeightLabel}{' '}
            <span className="text-[var(--t4,#807984)]">{t.sosWeightHint}</span>
          </span>
          <input
            type="number"
            step="0.1"
            inputMode="decimal"
            value={sosWeight}
            onChange={(e) => onSosWeightChange(e.target.value)}
            disabled={submitting || ratingMethod === 'rating'}
            placeholder={t.sosWeightPlaceholder}
            className={SEED_SELECT}
          />
        </label>
      </div>

      {/* Lock / garde-fous */}
      {ratingData && ratingLocked && (
        <div className={`mx-4 mt-3 !text-xs ${ERROR_BOX}`}>
          {ratingData.lock.reasons.length > 0
            ? ratingData.lock.reasons.join(' ')
            : t.ratingLockReason}
        </div>
      )}
      {ratingData && !ratingLocked && ratingNoBracket && (
        <div className={`mx-4 mt-3 !text-xs ${WARN_BOX}`}>
          {t.ratingNoBracketNotice}
        </div>
      )}

      {/* Tableau breakdown */}
      <div className="px-4 py-3">
        {ratingLoading && <div className={SEED_EMPTY}>{t.loadingShort}</div>}

        {!ratingLoading && ratingError && (
          <div className={ERROR_BOX}>{ratingError}</div>
        )}

        {!ratingLoading && !ratingError && ratingEmpty && (
          <div className={SEED_EMPTY}>
            {t.ratingEmptyBefore}{' '}
            <button
              type="button"
              data-case="normal"
              onClick={onGoToStage}
              className={INLINE_LINK}
            >
              {t.ratingEmptyLink}
            </button>
            .
          </div>
        )}

        {!ratingLoading && !ratingError && ratingData && !ratingEmpty && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line2,rgba(194,196,201,.2))] text-left">
                  <th scope="col" className="py-2 pr-3">
                    {t.thRank}
                  </th>
                  <th scope="col" className="py-2 pr-3">
                    {t.thTeam}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {t.thRating}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {t.thSos}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right">
                    {t.thScore}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
                {ratingData.breakdown.map((row) => (
                  <RatingRow key={row.teamId} row={row} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </SeedColumn>
  );
}
