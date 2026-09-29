// components/admin/director/AddSegmentModal.tsx
// Feature: Run-of-show — Lot 3 + polish.
// Modal d'ajout d'un segment. Champs : type, title, match_id (si match),
// duration_min. L'API auto-set ord = MAX+1 — pas de control ici.
//
// Pour type=match, on utilise <MatchPicker> (autocomplete sur
// /api/admin/matches/search) au lieu du champ UUID brut. Le match_id
// envoye a l'API reste un UUID. L'API valide tenant + existence — un
// mauvais UUID renverra 400 INVALID_MATCH_ID.
//
// Passe « Le Ruban » (lot 10C) : surface d'encre, champs et boutons admin.

import { useEffect, useState } from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import MatchPicker from '@/components/admin/director/MatchPicker';
import {
  SEGMENT_TYPE_LABEL,
  segmentTypeLabel,
} from '@/utils/eventSegmentLabels';
import type { EventSegmentType } from '@/types/events';
import nsAdminDirectorAddSegmentModal from '@/lib/i18n/locales/admin-fr/adminDirectorAddSegmentModal';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCard,
  rubanErr,
  rubanInput,
  rubanLabel,
} from '@/features/admin/diffusion/ui/rubanClasses';

type Props = {
  onClose: () => void;
  onSubmit: (payload: {
    type: EventSegmentType;
    title: string;
    match_id?: string | null;
    duration_min?: number | null;
  }) => Promise<void>;
};

const TYPE_OPTIONS: EventSegmentType[] = [
  'intro',
  'match',
  'break',
  'outro',
  'custom',
];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function AddSegmentModal({ onClose, onSubmit }: Props) {
  const t = useAdminT(nsAdminDirectorAddSegmentModal);
  const ref = useFocusTrap<HTMLDivElement>();
  const [type, setType] = useState<EventSegmentType>('intro');
  const [title, setTitle] = useState('');
  const [matchId, setMatchId] = useState('');
  const [durationMin, setDurationMin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim()) {
      setError(t.titleRequired);
      return;
    }
    if (type === 'match') {
      if (!matchId.trim() || !UUID_RE.test(matchId.trim())) {
        setError(t.matchIdRequired);
        return;
      }
    }
    let duration_min: number | null = null;
    if (durationMin.trim()) {
      const n = Number.parseInt(durationMin.trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        setError(t.durationPositive);
        return;
      }
      duration_min = n;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        type,
        title: title.trim(),
        match_id: type === 'match' ? matchId.trim() : null,
        duration_min,
      });
    } catch (err) {
      setError((err as Error)?.message ?? t.createFailed);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-segment-title"
      onClick={onClose}
    >
      <div
        ref={ref}
        className={`w-full max-w-md shadow-xl ${rubanCard}`}
        onClick={(e) => e.stopPropagation()}
        data-testid="add-segment-modal"
      >
        <div className="px-6 py-4 border-b border-[var(--line,rgba(194,196,201,.12))]">
          <h2
            id="add-segment-title"
            className="text-lg font-semibold text-[var(--t1,#f4edf7)]"
          >
            {t.heading}
          </h2>
          <p className="text-xs text-[var(--t3,#a39ba6)] mt-0.5">
            {t.subtitle}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className={rubanLabel}>{t.typeLabel}</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EventSegmentType)}
              data-testid="add-segment-type"
              className={rubanInput}
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {SEGMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={rubanLabel}>
              {t.titleLabel}{' '}
              <span className="text-[var(--err,#ff6b6b)]">*</span>
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="add-segment-title-input"
              placeholder={
                type === 'match' ? t.matchPlaceholder : segmentTypeLabel(type)
              }
              className={rubanInput}
              required
            />
          </div>
          {type === 'match' && (
            <div>
              <label className={rubanLabel}>
                {t.matchLabel}{' '}
                <span className="text-[var(--err,#ff6b6b)]">*</span>
              </label>
              <MatchPicker
                value={matchId || null}
                onChange={(id) => setMatchId(id ?? '')}
                disabled={submitting}
                testId="add-segment-match-id"
              />
              <p className="text-xs text-[var(--t4,#807984)] mt-1">
                {t.matchHint}
              </p>
            </div>
          )}
          <div>
            <label className={rubanLabel}>{t.durationLabel}</label>
            <input
              type="number"
              min={1}
              step={1}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              data-testid="add-segment-duration"
              placeholder={t.durationPlaceholder}
              className={rubanInput}
            />
          </div>
          {error && (
            <div className={`${rubanErr} px-3 py-2 text-sm`}>{error}</div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <AdminButton
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              type="submit"
              disabled={
                submitting ||
                !title.trim() ||
                (type === 'match' && !UUID_RE.test(matchId.trim()))
              }
              data-testid="add-segment-submit"
            >
              {submitting ? t.submitting : t.submit}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
