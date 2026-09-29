// components/admin/director/WaveBoard.tsx
// Feature: Waves + Stations (event director).
//
// Liste ordonnee des waves d'un event_run. Une wave = regroupement logique de
// segments (ex "Poules matin", "Finale"). Chaque wave affiche :
//   - un badge de statut (upcoming/live/done/skipped) — meme ton que les
//     segments (SEGMENT_STATUS_TONE),
//   - l'horaire prevu + la duree,
//   - le nombre de segments rattaches,
//   - des boutons de transition (Demarrer / Terminer / Skip),
//   - reorder via fleches ↑/↓ (pas de drag-drop, coherent avec la contrainte
//     d'accessibilite + simplicite ; le reorder appelle POST /waves/reorder),
//   - editer (title, planned_start_at, duration_min) inline + supprimer.
//
// La creation/edition se fait via un mini-formulaire depliable (pas de modal
// dediee : on reste leger et coherent avec le reste du director).
//
// Toutes les mutations passent par les callbacks du parent (director.tsx), qui
// centralise idempotency + refetch. Ce composant est "presentationnel piloté".

import { useMemo, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { waveStatusLabel } from '@/utils/eventSegmentLabels';
import type { EventSegment, EventWave, EventWaveStatus } from '@/types/events';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  SEGMENT_STATUS_TONE,
  rubanCard,
  rubanEyebrow,
  rubanInput,
  rubanInset,
  rubanLabel,
  rubanRow,
} from '@/features/admin/_shared/ui/ruban';
import nsAdminDirectorWaveBoard from '@/lib/i18n/locales/admin-fr/adminDirectorWaveBoard';
import { clockHHMM } from '@/utils/director/clock';

type Dict = typeof nsAdminDirectorWaveBoard.fr;

/** Patch envoye au parent pour create/update. */
export type WaveFormPatch = {
  title: string;
  planned_start_at: string | null;
  duration_min: number | null;
};

type Props = {
  waves: EventWave[];
  segments: EventSegment[];
  busy: boolean;
  onCreate: (patch: WaveFormPatch) => Promise<void>;
  onUpdate: (waveId: string, patch: Partial<WaveFormPatch>) => Promise<void>;
  onSetStatus: (wave: EventWave, status: EventWaveStatus) => Promise<void>;
  onDelete: (wave: EventWave) => Promise<void>;
  onReorder: (orderedIds: string[]) => Promise<void>;
};

/** ISO -> valeur pour <input type="datetime-local"> (fuseau local). */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** Valeur d'un <input datetime-local> -> ISO UTC (ou null si vide/invalide). */
function localInputToIso(value: string): string | null {
  if (!value.trim()) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type EditState = {
  title: string;
  planned: string;
  duration: string;
};

function emptyEdit(): EditState {
  return { title: '', planned: '', duration: '' };
}

function editFromWave(w: EventWave): EditState {
  return {
    title: w.title,
    planned: isoToLocalInput(w.planned_start_at),
    duration: typeof w.duration_min === 'number' ? String(w.duration_min) : '',
  };
}

function parseEdit(
  edit: EditState,
  tx: Dict
): WaveFormPatch | { error: string } {
  const title = edit.title.trim();
  if (!title) return { error: tx.titleRequired };
  let duration_min: number | null = null;
  if (edit.duration.trim()) {
    const n = Number.parseInt(edit.duration, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return { error: tx.durationPositive };
    }
    duration_min = n;
  }
  return {
    title,
    planned_start_at: localInputToIso(edit.planned),
    duration_min,
  };
}

export default function WaveBoard({
  waves,
  segments,
  busy,
  onCreate,
  onUpdate,
  onSetStatus,
  onDelete,
  onReorder,
}: Props) {
  const t = useAdminT(nsAdminDirectorWaveBoard);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<EditState>(emptyEdit());
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState>(emptyEdit());
  const [editError, setEditError] = useState<string | null>(null);

  // Tri memoisé : la page Director se re-render toutes les secondes, on ne veut
  // pas recloner+retrier `waves` à chaque render (uniquement quand la prop change).
  const sorted = useMemo(
    () => [...waves].sort((a, b) => a.ord - b.ord),
    [waves]
  );
  const segCountByWave = new Map<string, number>();
  for (const s of segments) {
    if (s.wave_id) {
      segCountByWave.set(s.wave_id, (segCountByWave.get(s.wave_id) ?? 0) + 1);
    }
  }

  function move(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= sorted.length) return;
    const ids = sorted.map((w) => w.id);
    const tmp = ids[index];
    ids[index] = ids[target];
    ids[target] = tmp;
    void onReorder(ids);
  }

  async function submitCreate() {
    setCreateError(null);
    const parsed = parseEdit(createForm, t);
    if ('error' in parsed) {
      setCreateError(parsed.error);
      return;
    }
    await onCreate(parsed);
    setCreateForm(emptyEdit());
    setShowCreate(false);
  }

  async function submitEdit(waveId: string) {
    setEditError(null);
    const parsed = parseEdit(editForm, t);
    if ('error' in parsed) {
      setEditError(parsed.error);
      return;
    }
    await onUpdate(waveId, parsed);
    setEditingId(null);
  }

  function startEdit(w: EventWave) {
    setEditForm(editFromWave(w));
    setEditError(null);
    setEditingId(w.id);
  }

  return (
    <div className={`${rubanCard} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className={rubanEyebrow}>{t.heading}</h3>
          <p className="mt-1 text-xs text-[var(--t4,#807984)]">{t.subtitle}</p>
        </div>
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={() => {
            setShowCreate((v) => !v);
            setCreateForm(emptyEdit());
            setCreateError(null);
          }}
          disabled={busy}
          data-testid="wave-create-toggle"
        >
          {showCreate ? t.cancel : t.addWave}
        </AdminButton>
      </div>

      {showCreate && (
        <div className={`${rubanInset} p-3 space-y-2`}>
          <input
            value={createForm.title}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, title: e.target.value }))
            }
            placeholder={t.titlePlaceholder}
            className={rubanInput}
            data-testid="wave-create-title"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={rubanLabel}>{t.startLabel}</label>
              <input
                type="datetime-local"
                value={createForm.planned}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, planned: e.target.value }))
                }
                className={rubanInput}
              />
            </div>
            <div>
              <label className={rubanLabel}>{t.durationLabel}</label>
              <input
                type="number"
                min={1}
                value={createForm.duration}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, duration: e.target.value }))
                }
                placeholder={t.durationPlaceholder}
                className={rubanInput}
              />
            </div>
          </div>
          {createError && (
            <div className="text-xs text-[var(--err,#ff6b6b)]">
              {createError}
            </div>
          )}
          <AdminButton
            variant="secondary"
            size="xs"
            onClick={submitCreate}
            disabled={busy}
            data-testid="wave-create-submit"
          >
            {t.createWave}
          </AdminButton>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--t4,#807984)]">{t.empty}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((w, idx) => {
            const count = segCountByWave.get(w.id) ?? 0;
            const hhmm = clockHHMM(w.planned_start_at);
            const isEditing = editingId === w.id;
            return (
              <li
                key={w.id}
                className={`${rubanRow(w.status === 'live')} p-3`}
                data-testid={`wave-row-${w.id}`}
                data-wave-status={w.status}
              >
                <div className="flex items-start gap-3">
                  {/* Reorder */}
                  <div className="flex flex-col gap-1 pt-0.5">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={busy || idx === 0}
                      className="text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)] disabled:opacity-30 text-xs leading-none"
                      aria-label={t.upAria}
                      data-testid={`wave-up-${w.id}`}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={busy || idx === sorted.length - 1}
                      className="text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)] disabled:opacity-30 text-xs leading-none"
                      aria-label={t.downAria}
                      data-testid={`wave-down-${w.id}`}
                    >
                      ▼
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Chip tone={SEGMENT_STATUS_TONE[w.status] ?? 'neutral'}>
                        {w.status === 'live' && (
                          <span
                            aria-hidden
                            className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--lf,#7fca65)]"
                          />
                        )}
                        {waveStatusLabel(w.status)}
                      </Chip>
                      <span className="font-semibold text-[var(--t1,#f4edf7)] truncate max-w-[220px]">
                        {w.title}
                      </span>
                      {hhmm && (
                        <span className="text-[11px] text-neutral-300 font-mono">
                          {hhmm}
                        </span>
                      )}
                      {typeof w.duration_min === 'number' && (
                        <span className="text-xs text-neutral-400">
                          {w.duration_min} min
                        </span>
                      )}
                      <span
                        className="text-[11px] text-[var(--t3,#a39ba6)] bg-[var(--s3,#2f2732)] px-1.5 py-0.5 rounded-[3px]"
                        title={t.segCountTitle}
                        data-testid={`wave-segcount-${w.id}`}
                      >
                        {format(count > 1 ? t.segment_other : t.segment_one, {
                          count,
                        })}
                      </span>
                    </div>

                    {/* Actions statut */}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {w.status === 'upcoming' && (
                        <>
                          <AdminButton
                            variant="secondary"
                            size="xs"
                            onClick={() => onSetStatus(w, 'live')}
                            disabled={busy}
                            data-testid={`wave-start-${w.id}`}
                          >
                            {t.start}
                          </AdminButton>
                          <AdminButton
                            variant="ghost"
                            size="xs"
                            onClick={() => onSetStatus(w, 'skipped')}
                            disabled={busy}
                            data-testid={`wave-skip-${w.id}`}
                          >
                            {t.skip}
                          </AdminButton>
                        </>
                      )}
                      {w.status === 'live' && (
                        <AdminButton
                          variant="danger"
                          size="xs"
                          onClick={() => onSetStatus(w, 'done')}
                          disabled={busy}
                          data-testid={`wave-end-${w.id}`}
                        >
                          {t.end}
                        </AdminButton>
                      )}
                      <AdminButton
                        variant="ghost"
                        size="xs"
                        onClick={() =>
                          isEditing ? setEditingId(null) : startEdit(w)
                        }
                        disabled={busy}
                        data-testid={`wave-edit-${w.id}`}
                      >
                        {isEditing ? t.close : t.edit}
                      </AdminButton>
                      <AdminButton
                        variant="ghost"
                        size="xs"
                        onClick={() => onDelete(w)}
                        disabled={busy}
                        className="hover:border-[rgba(255,107,107,.45)] hover:text-[var(--err,#ff6b6b)]"
                        data-testid={`wave-delete-${w.id}`}
                      >
                        {t.delete}
                      </AdminButton>
                    </div>

                    {/* Formulaire d'edition inline */}
                    {isEditing && (
                      <div className={`mt-3 p-3 space-y-2 ${rubanCard}`}>
                        <input
                          value={editForm.title}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              title: e.target.value,
                            }))
                          }
                          placeholder={t.editTitlePlaceholder}
                          className={rubanInput}
                          data-testid={`wave-edit-title-${w.id}`}
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="datetime-local"
                            value={editForm.planned}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                planned: e.target.value,
                              }))
                            }
                            className={rubanInput}
                          />
                          <input
                            type="number"
                            min={1}
                            value={editForm.duration}
                            onChange={(e) =>
                              setEditForm((f) => ({
                                ...f,
                                duration: e.target.value,
                              }))
                            }
                            placeholder={t.editDurationPlaceholder}
                            className={rubanInput}
                          />
                        </div>
                        {editError && (
                          <div className="text-xs text-[var(--err,#ff6b6b)]">
                            {editError}
                          </div>
                        )}
                        <AdminButton
                          variant="secondary"
                          size="xs"
                          onClick={() => submitEdit(w.id)}
                          disabled={busy}
                          data-testid={`wave-edit-submit-${w.id}`}
                        >
                          {t.save}
                        </AdminButton>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
