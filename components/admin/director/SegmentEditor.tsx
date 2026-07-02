// components/admin/director/SegmentEditor.tsx
// Feature: Run-of-show — Lot 3 + Lot 6 (timing/drift).
// Formulaire d'edition d'un segment. Le statut/ord/started_at/ended_at ne
// sont PAS editables ici (controlees par /start /skip /end /reorder cote API).
// Champs editables :
//   - title (string)
//   - duration_min (number?)
//   - planned_start_at (ancrage horaire, Lot 6)
//   - broadcast_message (objet structure)
//   - caster_checklist (array d'items {key, label})
//
// La sauvegarde est manuelle ("Enregistrer") pour eviter les PATCH a chaque
// keystroke + simplifier l'UX. On affichera un "dirty" indicator si besoin.
//
// Lot 6 : section "Horaire" en haut.
//   - Mode "Auto (calcule)"  -> planned_start_at IS NULL.
//   - Mode "Ancre"           -> planned_start_at = ISO derive de la date du
//     run + HH:MM choisie par le Director. On combine `run.scheduled_at` (qui
//     donne le jour) avec l'heure (HH:MM) saisie. Cle UX : pas de calendrier
//     date, juste l'heure ; on assume que le Director ancre TOUJOURS dans la
//     fenetre du jour du run.

import { useEffect, useState } from 'react';
import { segmentTypeLabel } from '@/utils/eventSegmentLabels';
import type {
  EventBroadcastMessage,
  EventCasterChecklistItem,
  EventRun,
  EventSegment,
  EventStation,
  EventWave,
} from '@/types/events';

type Props = {
  segment: EventSegment | null;
  /** Run parent — utilise pour composer planned_start_at (date du run + heure saisie). */
  run: EventRun | null;
  busy: boolean;
  /** Waves du run pour le select d'assignation. */
  waves?: EventWave[];
  /** Stations du run pour le select d'assignation. */
  stations?: EventStation[];
  onSave: (patch: {
    title?: string;
    duration_min?: number | null;
    planned_start_at?: string | null;
    broadcast_message?: EventBroadcastMessage | null;
    caster_checklist?: EventCasterChecklistItem[];
  }) => Promise<void>;
  /**
   * Assigne (ou detache) le segment courant a une wave/station. PATCH immediat
   * (pas de "Enregistrer") — l'assignation est une action atomique et rapide.
   * Passer null pour detacher.
   */
  onAssign?: (patch: {
    wave_id?: string | null;
    station_id?: string | null;
  }) => Promise<void>;
};

type FormState = {
  title: string;
  duration_min: string;
  /** Mode "ancre" ON/OFF. */
  anchorEnabled: boolean;
  /** Heure HH:MM saisie quand anchorEnabled = true. */
  anchorTime: string;
  bm_discord: string;
  bm_push_title: string;
  bm_push_body: string;
  bm_email_subject: string;
  checklist: EventCasterChecklistItem[];
};

/**
 * Convertit un ISO timestamp en "HH:MM" pour pre-remplir le champ time.
 * On utilise le fuseau local (coherent avec ce que voit le Director).
 */
function isoToLocalHHMM(iso: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '';
  }
}

/**
 * Combine la date (YYYY-MM-DD) du `runScheduledAt` avec une heure HH:MM en
 * fuseau local et renvoie un ISO UTC. Renvoie null si l'heure est invalide.
 */
function composeAnchorIso(
  runScheduledAt: string | null | undefined,
  hhmm: string
): string | null {
  if (!runScheduledAt) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return null;
  }
  const runDate = new Date(runScheduledAt);
  if (Number.isNaN(runDate.getTime())) return null;
  // On reconstruit a partir des composantes LOCALES du run pour eviter le
  // glissement de jour pres de minuit UTC.
  const anchored = new Date(
    runDate.getFullYear(),
    runDate.getMonth(),
    runDate.getDate(),
    hours,
    minutes,
    0,
    0
  );
  return anchored.toISOString();
}

function toForm(segment: EventSegment | null): FormState {
  if (!segment) {
    return {
      title: '',
      duration_min: '',
      anchorEnabled: false,
      anchorTime: '',
      bm_discord: '',
      bm_push_title: '',
      bm_push_body: '',
      bm_email_subject: '',
      checklist: [],
    };
  }
  const bm = segment.broadcast_message ?? {};
  return {
    title: segment.title ?? '',
    duration_min:
      typeof segment.duration_min === 'number'
        ? String(segment.duration_min)
        : '',
    anchorEnabled: !!segment.planned_start_at,
    anchorTime: isoToLocalHHMM(segment.planned_start_at),
    bm_discord: bm.discord ?? '',
    bm_push_title: bm.push_title ?? '',
    bm_push_body: bm.push_body ?? '',
    bm_email_subject: bm.email_subject ?? '',
    checklist: Array.isArray(segment.caster_checklist)
      ? segment.caster_checklist
      : [],
  };
}

function buildBroadcastMessage(form: FormState): EventBroadcastMessage | null {
  const bm: EventBroadcastMessage = {};
  if (form.bm_discord.trim()) bm.discord = form.bm_discord.trim();
  if (form.bm_push_title.trim()) bm.push_title = form.bm_push_title.trim();
  if (form.bm_push_body.trim()) bm.push_body = form.bm_push_body.trim();
  if (form.bm_email_subject.trim())
    bm.email_subject = form.bm_email_subject.trim();
  return Object.keys(bm).length === 0 ? null : bm;
}

export default function SegmentEditor({
  segment,
  run,
  busy,
  waves = [],
  stations = [],
  onSave,
  onAssign,
}: Props) {
  const [form, setForm] = useState<FormState>(toForm(segment));
  const [saving, setSaving] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(toForm(segment));
    setError(null);
  }, [segment?.id, segment]);

  if (!segment) {
    return (
      <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-6 text-sm text-neutral-400">
        Selectionne un segment dans la timeline pour l&apos;editer.
      </div>
    );
  }

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function addChecklistItem() {
    update('checklist', [
      ...form.checklist,
      { key: `item_${Date.now()}`, label: '' },
    ]);
  }

  function updateChecklistItem(
    idx: number,
    patch: Partial<EventCasterChecklistItem>
  ) {
    update(
      'checklist',
      form.checklist.map((it, i) => (i === idx ? { ...it, ...patch } : it))
    );
  }

  function removeChecklistItem(idx: number) {
    update(
      'checklist',
      form.checklist.filter((_, i) => i !== idx)
    );
  }

  function handleEnableAnchor() {
    // Pre-remplit avec l'heure courante en local si rien n'est saisi.
    const now = new Date();
    const initial =
      form.anchorTime ||
      `${String(now.getHours()).padStart(2, '0')}:${String(
        now.getMinutes()
      ).padStart(2, '0')}`;
    setForm((prev) => ({
      ...prev,
      anchorEnabled: true,
      anchorTime: initial,
    }));
  }

  function handleReleaseAnchor() {
    setForm((prev) => ({
      ...prev,
      anchorEnabled: false,
      anchorTime: '',
    }));
  }

  async function handleAssign(patch: {
    wave_id?: string | null;
    station_id?: string | null;
  }) {
    if (!onAssign) return;
    setError(null);
    setAssigning(true);
    try {
      await onAssign(patch);
    } catch (err) {
      setError((err as Error)?.message ?? 'Assignation echouee.');
    } finally {
      setAssigning(false);
    }
  }

  async function handleSave() {
    setError(null);
    if (!form.title.trim()) {
      setError('Le titre est obligatoire.');
      return;
    }
    const durRaw = form.duration_min.trim();
    let duration_min: number | null = null;
    if (durRaw.length > 0) {
      const n = Number.parseInt(durRaw, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setError('La duree doit etre un entier positif (en minutes).');
        return;
      }
      duration_min = n;
    }

    // Validate planned_start_at : si l'utilisateur a active l'ancre, il DOIT
    // fournir une heure valide. Sinon on n'envoie null que pour effacer une
    // ancre PRE-EXISTANTE (sinon on n'inclut pas le champ — pas de PATCH no-op).
    let planned_start_at: string | null | undefined;
    if (form.anchorEnabled) {
      if (!run?.scheduled_at) {
        setError("Impossible d'ancrer : la date du run est introuvable.");
        return;
      }
      const composed = composeAnchorIso(run.scheduled_at, form.anchorTime);
      if (!composed) {
        setError("Heure d'ancrage invalide. Format attendu : HH:MM.");
        return;
      }
      planned_start_at = composed;
    } else if (segment && segment.planned_start_at) {
      planned_start_at = null;
    }

    // Validate checklist : keys uniques + non-vides, labels non-vides.
    const seenKeys = new Set<string>();
    for (const it of form.checklist) {
      if (!it.key.trim() || !it.label.trim()) {
        setError(
          'Chaque element de checklist doit avoir une cle et un libelle.'
        );
        return;
      }
      if (seenKeys.has(it.key)) {
        setError(`Cle de checklist en doublon : "${it.key}".`);
        return;
      }
      seenKeys.add(it.key);
    }

    setSaving(true);
    try {
      await onSave({
        title: form.title.trim(),
        duration_min,
        ...(planned_start_at !== undefined ? { planned_start_at } : {}),
        broadcast_message: buildBroadcastMessage(form),
        caster_checklist: form.checklist,
      });
    } catch (err) {
      setError((err as Error)?.message ?? 'Sauvegarde echouee.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-700/50 bg-neutral-800/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-neutral-200">
            Editer le segment
          </h3>
          <p className="text-xs text-neutral-500">
            Type : {segmentTypeLabel(segment.type)} · ord {segment.ord}
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || busy}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-xs font-medium"
        >
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
      </div>

      {/* Section Horaire (Lot 6) — en HAUT pour signaler la criticite. */}
      <div className="rounded-xl border border-neutral-700/40 bg-neutral-900/40 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
            Horaire
          </h4>
          {form.anchorEnabled ? (
            <span
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide text-amber-300"
              aria-label="Ancre"
              data-testid="segment-anchor-active"
            >
              <svg
                width="10"
                height="12"
                viewBox="0 0 10 12"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M2 5h6v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5zm1.5-3.5a1.5 1.5 0 1 1 3 0V5h-3V1.5z" />
              </svg>
              Ancre
            </span>
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-neutral-500">
              Auto (calcule)
            </span>
          )}
        </div>

        {form.anchorEnabled ? (
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={form.anchorTime}
              onChange={(e) => update('anchorTime', e.target.value)}
              data-testid="segment-anchor-time"
              className="px-2 py-1 rounded-md bg-neutral-900/80 border border-amber-500/40 text-white text-sm font-mono focus:outline-none focus:border-amber-400"
            />
            <button
              type="button"
              onClick={handleReleaseAnchor}
              data-testid="segment-anchor-release"
              className="px-2 py-1 rounded-md text-[11px] text-neutral-300 hover:text-white border border-neutral-700/60 hover:border-neutral-500"
            >
              Liberer
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-neutral-500">
              L&apos;horaire est calcule depuis les segments precedents.
            </p>
            <button
              type="button"
              onClick={handleEnableAnchor}
              data-testid="segment-anchor-enable"
              disabled={!run?.scheduled_at}
              className="px-2 py-1 rounded-md text-[11px] text-amber-200 border border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-40"
            >
              Ancrer cet horaire
            </button>
          </div>
        )}
      </div>

      {/* Assignation Wave / Station (PATCH immediat). */}
      {onAssign && (
        <div className="rounded-xl border border-neutral-700/40 bg-neutral-900/40 p-3 space-y-2">
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
            Assignation
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">
                Wave
              </label>
              <select
                value={segment.wave_id ?? ''}
                disabled={assigning || busy}
                onChange={(e) =>
                  handleAssign({ wave_id: e.target.value || null })
                }
                className="w-full px-2 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
                data-testid="segment-wave-select"
              >
                <option value="">— aucune</option>
                {[...waves]
                  .sort((a, b) => a.ord - b.ord)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] text-neutral-500 mb-1">
                Station
              </label>
              <select
                value={segment.station_id ?? ''}
                disabled={assigning || busy}
                onChange={(e) =>
                  handleAssign({ station_id: e.target.value || null })
                }
                className="w-full px-2 py-1.5 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
                data-testid="segment-station-select"
              >
                <option value="">— aucune</option>
                {[...stations]
                  .sort((a, b) => a.ord - b.ord)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-neutral-400 mb-1">
            Titre <span className="text-red-400">*</span>
          </label>
          <input
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1">
            Duree prevue (minutes)
          </label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.duration_min}
            onChange={(e) => update('duration_min', e.target.value)}
            placeholder="ex: 30"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
        {segment.type === 'match' && (
          <div className="text-xs text-neutral-500">
            <span className="text-neutral-400">Match lie :</span>{' '}
            <code>{segment.match_id ?? '—'}</code>
            <span className="ml-2 text-neutral-600">
              (le match_id se definit a la creation du segment.)
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-neutral-700/40 pt-4 space-y-3">
        <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
          Message diffuse
        </h4>
        <div>
          <label className="block text-xs text-neutral-400 mb-1">
            Discord (texte)
          </label>
          <textarea
            value={form.bm_discord}
            onChange={(e) => update('bm_discord', e.target.value)}
            rows={2}
            placeholder="Le segment X demarre maintenant !"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-neutral-400 mb-1">
              Push title
            </label>
            <input
              value={form.bm_push_title}
              onChange={(e) => update('bm_push_title', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400 mb-1">
              Email subject
            </label>
            <input
              value={form.bm_email_subject}
              onChange={(e) => update('bm_email_subject', e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-neutral-400 mb-1">
            Push body
          </label>
          <input
            value={form.bm_push_body}
            onChange={(e) => update('bm_push_body', e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white text-sm focus:outline-none focus:border-purple-500"
          />
        </div>
      </div>

      <div className="border-t border-neutral-700/40 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold text-neutral-300 uppercase tracking-wide">
            Checklist caster
          </h4>
          <button
            type="button"
            onClick={addChecklistItem}
            className="text-xs text-purple-300 hover:text-purple-200"
          >
            + Ajouter
          </button>
        </div>
        {form.checklist.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Aucun item de checklist. Le caster ne verra rien a cocher pour ce
            segment.
          </p>
        ) : (
          <ul className="space-y-2">
            {form.checklist.map((it, idx) => (
              <li
                key={idx}
                className="flex items-center gap-2 rounded-lg bg-neutral-900/40 border border-neutral-700/60 p-2"
              >
                <input
                  value={it.key}
                  onChange={(e) =>
                    updateChecklistItem(idx, { key: e.target.value })
                  }
                  placeholder="key (slug)"
                  className="w-32 px-2 py-1 rounded bg-neutral-900/80 border border-neutral-700 text-white text-xs font-mono focus:outline-none focus:border-purple-500"
                />
                <input
                  value={it.label}
                  onChange={(e) =>
                    updateChecklistItem(idx, { label: e.target.value })
                  }
                  placeholder="Libelle visible par le caster"
                  className="flex-1 px-2 py-1 rounded bg-neutral-900/80 border border-neutral-700 text-white text-xs focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={() => removeChecklistItem(idx)}
                  className="px-2 py-1 rounded text-xs text-neutral-400 hover:text-red-300"
                  aria-label="Supprimer"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-500/40 px-3 py-2 text-xs text-red-300">
          {error}
        </div>
      )}
    </div>
  );
}
