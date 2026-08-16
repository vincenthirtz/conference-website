// components/admin/director/StationBoard.tsx
// Feature: Waves + Stations (event director).
//
// Liste des stations de production (postes stream/caster) d'un event_run.
// Chaque station affiche :
//   - un badge de statut (idle/in_use/offline) avec toggle (cycle des 3 etats),
//   - le stream_url en lien cliquable si present,
//   - les notes,
//   - le segment actuellement 'live' rattache a la station (calcule depuis
//     segments.station_id + status === 'live'),
//   - create / edit (name, stream_url, notes) / delete.
//
// Comme WaveBoard, ce composant est pilote : toutes les mutations remontent au
// parent (director.tsx) via callbacks.

import { useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  stationStatusBadgeClasses,
  stationStatusDotClasses,
  stationStatusLabel,
} from '@/utils/eventSegmentLabels';
import type {
  EventSegment,
  EventStation,
  EventStationStatus,
} from '@/types/events';
import nsAdminDirectorStationBoard from '@/lib/i18n/locales/admin-fr/adminDirectorStationBoard';

type Dict = typeof nsAdminDirectorStationBoard.fr;

/** Ordre de cycle du toggle de statut. */
const STATUS_CYCLE: EventStationStatus[] = ['idle', 'in_use', 'offline'];

export type StationFormPatch = {
  name: string;
  stream_url: string | null;
  notes: string | null;
};

type Props = {
  stations: EventStation[];
  segments: EventSegment[];
  busy: boolean;
  onCreate: (patch: StationFormPatch) => Promise<void>;
  onUpdate: (
    stationId: string,
    patch: Partial<StationFormPatch>
  ) => Promise<void>;
  onSetStatus: (
    station: EventStation,
    status: EventStationStatus
  ) => Promise<void>;
  onDelete: (station: EventStation) => Promise<void>;
};

type EditState = {
  name: string;
  stream_url: string;
  notes: string;
};

function emptyEdit(): EditState {
  return { name: '', stream_url: '', notes: '' };
}

function editFromStation(s: EventStation): EditState {
  return {
    name: s.name,
    stream_url: s.stream_url ?? '',
    notes: s.notes ?? '',
  };
}

function parseEdit(
  edit: EditState,
  tx: Dict
): StationFormPatch | { error: string } {
  const name = edit.name.trim();
  if (!name) return { error: tx.nameRequired };
  return {
    name,
    stream_url: edit.stream_url.trim() || null,
    notes: edit.notes.trim() || null,
  };
}

export default function StationBoard({
  stations,
  segments,
  busy,
  onCreate,
  onUpdate,
  onSetStatus,
  onDelete,
}: Props) {
  const t = useAdminT(nsAdminDirectorStationBoard);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<EditState>(emptyEdit());
  const [createError, setCreateError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<EditState>(emptyEdit());
  const [editError, setEditError] = useState<string | null>(null);

  const sorted = [...stations].sort((a, b) => a.ord - b.ord);

  // Segment 'live' rattache par station (au plus un pertinent).
  const liveSegByStation = new Map<string, EventSegment>();
  for (const s of segments) {
    if (s.station_id && s.status === 'live') {
      liveSegByStation.set(s.station_id, s);
    }
  }

  function nextStatus(current: EventStationStatus): EventStationStatus {
    const i = STATUS_CYCLE.indexOf(current);
    return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
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

  async function submitEdit(stationId: string) {
    setEditError(null);
    const parsed = parseEdit(editForm, t);
    if ('error' in parsed) {
      setEditError(parsed.error);
      return;
    }
    await onUpdate(stationId, parsed);
    setEditingId(null);
  }

  function startEdit(s: EventStation) {
    setEditForm(editFromStation(s));
    setEditError(null);
    setEditingId(s.id);
  }

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">Stations</h3>
          <p className="text-xs text-neutral-500">{t.subtitle}</p>
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
          data-testid="station-create-toggle"
        >
          {showCreate ? t.cancel : t.addStation}
        </button>
      </div>

      {showCreate && (
        <div className="rounded-xl border border-neutral-700/40 bg-neutral-900/40 p-3 space-y-2">
          <input
            value={createForm.name}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, name: e.target.value }))
            }
            placeholder={t.namePlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
            data-testid="station-create-name"
          />
          <input
            value={createForm.stream_url}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, stream_url: e.target.value }))
            }
            placeholder={t.streamPlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
          />
          <textarea
            value={createForm.notes}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, notes: e.target.value }))
            }
            rows={2}
            placeholder={t.notesPlaceholder}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
          />
          {createError && (
            <div className="text-xs text-red-300">{createError}</div>
          )}
          <button
            type="button"
            onClick={submitCreate}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-medium"
            data-testid="station-create-submit"
          >
            {t.createStation}
          </button>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-neutral-500">{t.empty}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((s) => {
            const liveSeg = liveSegByStation.get(s.id);
            const isEditing = editingId === s.id;
            return (
              <li
                key={s.id}
                className="rounded-xl border border-neutral-700/60 bg-neutral-800/60 p-3"
                data-testid={`station-row-${s.id}`}
                data-station-status={s.status}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onSetStatus(s, nextStatus(s.status))}
                    disabled={busy}
                    title={t.statusTitle}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold disabled:opacity-50 ${stationStatusBadgeClasses(
                      s.status
                    )}`}
                    data-testid={`station-status-${s.id}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${stationStatusDotClasses(
                        s.status
                      )}`}
                    />
                    {stationStatusLabel(s.status)}
                  </button>
                  <span className="font-medium text-white truncate max-w-[220px]">
                    {s.name}
                  </span>
                  {s.stream_url && (
                    <a
                      href={s.stream_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-purple-300 hover:text-purple-200 underline truncate max-w-[200px]"
                      data-testid={`station-stream-${s.id}`}
                    >
                      {t.streamLink}
                    </a>
                  )}
                </div>

                {s.notes && (
                  <p className="mt-1.5 text-[11px] text-neutral-400 whitespace-pre-wrap">
                    {s.notes}
                  </p>
                )}

                {/* Segment live rattache */}
                <div className="mt-1.5 text-[11px]">
                  {liveSeg ? (
                    <span
                      className="inline-flex items-center gap-1.5 text-emerald-300"
                      data-testid={`station-live-seg-${s.id}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {format(t.liveNow, { title: liveSeg.title })}
                    </span>
                  ) : (
                    <span className="text-neutral-500">{t.noLive}</span>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      isEditing ? setEditingId(null) : startEdit(s)
                    }
                    disabled={busy}
                    className="px-2 py-1 rounded-md text-xs bg-neutral-700/50 hover:bg-neutral-600/60 text-neutral-200 border border-neutral-600/40 disabled:opacity-50"
                    data-testid={`station-edit-${s.id}`}
                  >
                    {isEditing ? t.close : t.edit}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(s)}
                    disabled={busy}
                    className="px-2 py-1 rounded-md text-xs bg-neutral-700/50 hover:bg-red-700/40 text-neutral-300 hover:text-red-200 border border-neutral-600/40 disabled:opacity-50"
                    data-testid={`station-delete-${s.id}`}
                  >
                    {t.delete}
                  </button>
                </div>

                {isEditing && (
                  <div className="mt-3 rounded-lg border border-neutral-700/40 bg-neutral-900/40 p-3 space-y-2">
                    <input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder={t.editNamePlaceholder}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
                      data-testid={`station-edit-name-${s.id}`}
                    />
                    <input
                      value={editForm.stream_url}
                      onChange={(e) =>
                        setEditForm((f) => ({
                          ...f,
                          stream_url: e.target.value,
                        }))
                      }
                      placeholder={t.editStreamPlaceholder}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                    <textarea
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      rows={2}
                      placeholder={t.editNotesPlaceholder}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
                    />
                    {editError && (
                      <div className="text-xs text-red-300">{editError}</div>
                    )}
                    <button
                      type="button"
                      onClick={() => submitEdit(s.id)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-medium"
                      data-testid={`station-edit-submit-${s.id}`}
                    >
                      {t.save}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
