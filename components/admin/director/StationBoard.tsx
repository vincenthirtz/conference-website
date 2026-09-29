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
import { stationStatusLabel } from '@/utils/eventSegmentLabels';
import type { ChipTone } from '@/features/admin/_shared/ui/Chip';
import type {
  EventSegment,
  EventStation,
  EventStationStatus,
} from '@/types/events';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  rubanCard,
  rubanEyebrow,
  rubanInput,
  rubanInset,
  rubanRow,
} from '@/features/admin/diffusion/ui/rubanClasses';
import nsAdminDirectorStationBoard from '@/lib/i18n/locales/admin-fr/adminDirectorStationBoard';

type Dict = typeof nsAdminDirectorStationBoard.fr;

/** Ton de puce d'un statut de station (couleur = signal). */
const STATION_STATUS_TONE: Record<EventStationStatus, ChipTone> = {
  idle: 'neutral',
  in_use: 'ok',
  offline: 'err',
};

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
          data-testid="station-create-toggle"
        >
          {showCreate ? t.cancel : t.addStation}
        </AdminButton>
      </div>

      {showCreate && (
        <div className={`${rubanInset} p-3 space-y-2`}>
          <input
            value={createForm.name}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, name: e.target.value }))
            }
            placeholder={t.namePlaceholder}
            className={rubanInput}
            data-testid="station-create-name"
          />
          <input
            value={createForm.stream_url}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, stream_url: e.target.value }))
            }
            placeholder={t.streamPlaceholder}
            className={rubanInput}
          />
          <textarea
            value={createForm.notes}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, notes: e.target.value }))
            }
            rows={2}
            placeholder={t.notesPlaceholder}
            className={rubanInput}
          />
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
            data-testid="station-create-submit"
          >
            {t.createStation}
          </AdminButton>
        </div>
      )}

      {sorted.length === 0 ? (
        <p className="text-xs text-[var(--t4,#807984)]">{t.empty}</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((s) => {
            const liveSeg = liveSegByStation.get(s.id);
            const isEditing = editingId === s.id;
            return (
              <li
                key={s.id}
                className={`${rubanRow(!!liveSeg)} p-3`}
                data-testid={`station-row-${s.id}`}
                data-station-status={s.status}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => onSetStatus(s, nextStatus(s.status))}
                    disabled={busy}
                    title={t.statusTitle}
                    className="rounded-[3px] disabled:opacity-50"
                    data-testid={`station-status-${s.id}`}
                  >
                    <Chip tone={STATION_STATUS_TONE[s.status] ?? 'neutral'}>
                      {stationStatusLabel(s.status)}
                    </Chip>
                  </button>
                  <span className="font-semibold text-[var(--t1,#f4edf7)] truncate max-w-[220px]">
                    {s.name}
                  </span>
                  {s.stream_url && (
                    <a
                      href={s.stream_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-[var(--or-200,#eec4ff)] hover:text-[var(--or-100,#f6e1ff)] underline truncate max-w-[200px]"
                      data-testid={`station-stream-${s.id}`}
                    >
                      {t.streamLink}
                    </a>
                  )}
                </div>

                {s.notes && (
                  <p className="mt-1.5 text-[11px] text-[var(--t3,#a39ba6)] whitespace-pre-wrap">
                    {s.notes}
                  </p>
                )}

                {/* Segment live rattache */}
                <div className="mt-1.5 text-[11px]">
                  {liveSeg ? (
                    <span
                      className="inline-flex items-center gap-1.5 font-semibold text-[var(--lf-200,#b3e7a3)]"
                      data-testid={`station-live-seg-${s.id}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--lf,#7fca65)] animate-pulse" />
                      {format(t.liveNow, { title: liveSeg.title })}
                    </span>
                  ) : (
                    <span className="text-[var(--t4,#807984)]">{t.noLive}</span>
                  )}
                </div>

                <div className="mt-2 flex items-center gap-1.5">
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    onClick={() =>
                      isEditing ? setEditingId(null) : startEdit(s)
                    }
                    disabled={busy}
                    data-testid={`station-edit-${s.id}`}
                  >
                    {isEditing ? t.close : t.edit}
                  </AdminButton>
                  <AdminButton
                    variant="ghost"
                    size="xs"
                    onClick={() => onDelete(s)}
                    disabled={busy}
                    className="hover:border-[rgba(255,107,107,.45)] hover:text-[var(--err,#ff6b6b)]"
                    data-testid={`station-delete-${s.id}`}
                  >
                    {t.delete}
                  </AdminButton>
                </div>

                {isEditing && (
                  <div className={`mt-3 p-3 space-y-2 ${rubanCard}`}>
                    <input
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, name: e.target.value }))
                      }
                      placeholder={t.editNamePlaceholder}
                      className={rubanInput}
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
                      className={rubanInput}
                    />
                    <textarea
                      value={editForm.notes}
                      onChange={(e) =>
                        setEditForm((f) => ({ ...f, notes: e.target.value }))
                      }
                      rows={2}
                      placeholder={t.editNotesPlaceholder}
                      className={rubanInput}
                    />
                    {editError && (
                      <div className="text-xs text-[var(--err,#ff6b6b)]">
                        {editError}
                      </div>
                    )}
                    <AdminButton
                      variant="secondary"
                      size="xs"
                      onClick={() => submitEdit(s.id)}
                      disabled={busy}
                      data-testid={`station-edit-submit-${s.id}`}
                    >
                      {t.save}
                    </AdminButton>
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
