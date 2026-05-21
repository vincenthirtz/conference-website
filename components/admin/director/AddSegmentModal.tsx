// components/admin/director/AddSegmentModal.tsx
// Feature: Run-of-show — Lot 3.
// Modal d'ajout d'un segment. Champs : type, title, match_id (si match),
// duration_min. L'API auto-set ord = MAX+1 — pas de control ici.
//
// Pas d'autocomplete de matches en Lot 3 : pas d'endpoint admin "matches
// scoped tenant" (un fix API serait scope api-agent, hors scope ici). On
// laisse un champ UUID simple, accompagne d'un helper texte. L'API valide
// que le match existe et appartient au tenant — un mauvais UUID renverra
// 400 INVALID_MATCH_ID.

import { useEffect, useState } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import {
  SEGMENT_TYPE_LABEL,
  segmentTypeLabel,
} from '@/utils/eventSegmentLabels';
import type { EventSegmentType } from '@/types/events';

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
      setError('Le titre est obligatoire.');
      return;
    }
    if (type === 'match') {
      if (!matchId.trim() || !UUID_RE.test(matchId.trim())) {
        setError(
          'Pour un segment de type "match", un match_id (UUID) valide est obligatoire.'
        );
        return;
      }
    }
    let duration_min: number | null = null;
    if (durationMin.trim()) {
      const n = Number.parseInt(durationMin.trim(), 10);
      if (!Number.isFinite(n) || n <= 0) {
        setError('La duree doit etre un entier positif (en minutes).');
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
      setError((err as Error)?.message ?? 'Creation echouee.');
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
        className="w-full max-w-md bg-neutral-900 border border-neutral-700/60 rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-neutral-700/60">
          <h2 id="add-segment-title" className="text-lg font-semibold">
            Ajouter un segment
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Le segment sera ajoute en fin de timeline.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-sm text-neutral-300 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as EventSegmentType)}
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white focus:outline-none focus:border-purple-500"
            >
              {TYPE_OPTIONS.map((t) => (
                <option key={t} value={t}>
                  {SEGMENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              Titre <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={
                type === 'match'
                  ? 'Quart 1 : Team A vs Team B'
                  : segmentTypeLabel(type)
              }
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
              required
            />
          </div>
          {type === 'match' && (
            <div>
              <label className="block text-sm text-neutral-300 mb-1">
                Match ID (UUID) <span className="text-red-400">*</span>
              </label>
              <input
                value={matchId}
                onChange={(e) => setMatchId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 font-mono text-xs focus:outline-none focus:border-purple-500"
              />
              <p className="text-xs text-neutral-500 mt-1">
                L&apos;UUID du match. Tu peux le copier depuis l&apos;URL
                d&apos;un match admin.
              </p>
            </div>
          )}
          <div>
            <label className="block text-sm text-neutral-300 mb-1">
              Duree prevue (minutes)
            </label>
            <input
              type="number"
              min={1}
              step={1}
              value={durationMin}
              onChange={(e) => setDurationMin(e.target.value)}
              placeholder="ex: 30"
              className="w-full px-3 py-2.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 focus:outline-none focus:border-purple-500"
            />
          </div>
          {error && (
            <div className="rounded-lg bg-red-900/30 border border-red-500/40 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
