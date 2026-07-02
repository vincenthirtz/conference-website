// components/admin/director/WaveBoard.tsx
// Feature: Waves + Stations (event director).
//
// Liste ordonnee des waves d'un event_run. Une wave = regroupement logique de
// segments (ex "Poules matin", "Finale"). Chaque wave affiche :
//   - un badge de statut (upcoming/live/done/skipped) — meme style que les
//     segments (waveStatusBadgeClasses),
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

import { useState } from 'react';
import {
  waveStatusBadgeClasses,
  waveStatusDotClasses,
  waveStatusLabel,
} from '@/utils/eventSegmentLabels';
import type { EventSegment, EventWave, EventWaveStatus } from '@/types/events';

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

function formatHHMM(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
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

function parseEdit(edit: EditState): WaveFormPatch | { error: string } {
  const title = edit.title.trim();
  if (!title) return { error: 'Le titre est obligatoire.' };
  let duration_min: number | null = null;
  if (edit.duration.trim()) {
    const n = Number.parseInt(edit.duration, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return { error: 'La duree doit etre un entier positif.' };
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
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<EditState>(emptyEdit());
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState>(emptyEdit());
  const [editError, setEditError] = useState<string | null>(null);

  const sorted = [...waves].sort((a, b) => a.ord - b.ord);
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
    const parsed = parseEdit(createForm);
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
    const parsed = parseEdit(editForm);
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
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">Waves</h3>
          <p className="text-xs text-neutral-500">
            Regroupements de segments (poules, finale…).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowCreate((v) => !v);
            setCreateForm(emptyEdit());
            setCreateError(null);
          }}
          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-xs font-medium"
          disabled={busy}
          data-testid="wave-create-toggle"
        >
          {showCreate ? 'Annuler' : '+ Wave'}
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-neutral-700/40 bg-neutral-900/40 p-3 space-y-2">
          <input
            value={createForm.title}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, title: e.target.value }))
            }
            placeholder="Titre de la wave"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
            data-testid="wave-create-title"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">
                Debut prevu
              </label>
              <input
                type="datetime-local"
                value={createForm.planned}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, planned: e.target.value }))
                }
                className="w-full px-2 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">
                Duree (min)
              </label>
              <input
                type="number"
                min={1}
                value={createForm.duration}
                onChange={(e) =>
                  setCreateForm((f) => ({ ...f, duration: e.target.value }))
                }
                placeholder="ex: 90"
                className="w-full px-2 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>
          {createError && (
            <div className="text-xs text-red-300">{createError}</div>
          )}
          <button
            type="button"
            onClick={submitCreate}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-medium"
            data-testid="wave-create-submit"
          >
            Creer la wave
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-neutral-500">
          Aucune wave. Cree-en une pour regrouper des segments.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((w, idx) => {
            const count = segCountByWave.get(w.id) ?? 0;
            const hhmm = formatHHMM(w.planned_start_at);
            const isEditing = editingId === w.id;
            return (
              <li
                key={w.id}
                className="rounded-xl border border-neutral-700/60 bg-neutral-800/60 p-3"
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
                      className="text-neutral-400 hover:text-white disabled:opacity-30 text-xs leading-none"
                      aria-label="Monter"
                      data-testid={`wave-up-${w.id}`}
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={busy || idx === sorted.length - 1}
                      className="text-neutral-400 hover:text-white disabled:opacity-30 text-xs leading-none"
                      aria-label="Descendre"
                      data-testid={`wave-down-${w.id}`}
                    >
                      ▼
                    </button>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${waveStatusBadgeClasses(
                          w.status
                        )}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${waveStatusDotClasses(
                            w.status
                          )}`}
                        />
                        {waveStatusLabel(w.status)}
                      </span>
                      <span className="font-medium text-white truncate max-w-[220px]">
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
                        className="text-[11px] text-neutral-400 bg-neutral-700/50 px-1.5 py-0.5 rounded"
                        title="Segments rattaches"
                        data-testid={`wave-segcount-${w.id}`}
                      >
                        {count} segment{count > 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Actions statut */}
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {w.status === 'upcoming' && (
                        <>
                          <button
                            type="button"
                            onClick={() => onSetStatus(w, 'live')}
                            disabled={busy}
                            className="px-2 py-1 rounded-md text-xs bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/40 disabled:opacity-50"
                            data-testid={`wave-start-${w.id}`}
                          >
                            Demarrer
                          </button>
                          <button
                            type="button"
                            onClick={() => onSetStatus(w, 'skipped')}
                            disabled={busy}
                            className="px-2 py-1 rounded-md text-xs bg-amber-600/30 hover:bg-amber-600/50 text-amber-200 border border-amber-500/40 disabled:opacity-50"
                            data-testid={`wave-skip-${w.id}`}
                          >
                            Skip
                          </button>
                        </>
                      )}
                      {w.status === 'live' && (
                        <button
                          type="button"
                          onClick={() => onSetStatus(w, 'done')}
                          disabled={busy}
                          className="px-2 py-1 rounded-md text-xs bg-red-600/30 hover:bg-red-600/50 text-red-200 border border-red-500/40 disabled:opacity-50"
                          data-testid={`wave-end-${w.id}`}
                        >
                          Terminer
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          isEditing ? setEditingId(null) : startEdit(w)
                        }
                        disabled={busy}
                        className="px-2 py-1 rounded-md text-xs bg-neutral-700/50 hover:bg-neutral-600/60 text-neutral-200 border border-neutral-600/40 disabled:opacity-50"
                        data-testid={`wave-edit-${w.id}`}
                      >
                        {isEditing ? 'Fermer' : 'Editer'}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(w)}
                        disabled={busy}
                        className="px-2 py-1 rounded-md text-xs bg-neutral-700/50 hover:bg-red-700/40 text-neutral-300 hover:text-red-200 border border-neutral-600/40 disabled:opacity-50"
                        data-testid={`wave-delete-${w.id}`}
                      >
                        Supprimer
                      </button>
                    </div>

                    {/* Formulaire d'edition inline */}
                    {isEditing && (
                      <div className="mt-3 rounded-lg border border-neutral-700/40 bg-neutral-900/40 p-3 space-y-2">
                        <input
                          value={editForm.title}
                          onChange={(e) =>
                            setEditForm((f) => ({
                              ...f,
                              title: e.target.value,
                            }))
                          }
                          placeholder="Titre"
                          className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
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
                            className="w-full px-2 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
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
                            placeholder="Duree (min)"
                            className="w-full px-2 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        {editError && (
                          <div className="text-xs text-red-300">
                            {editError}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => submitEdit(w.id)}
                          disabled={busy}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-medium"
                          data-testid={`wave-edit-submit-${w.id}`}
                        >
                          Enregistrer
                        </button>
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
