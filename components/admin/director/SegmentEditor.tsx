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
//
// Passe « Le Ruban » (lot 10C) : surfaces d'encre, titres étroits, champs et
// boutons de l'admin — mêmes champs, mêmes `data-testid`, même validation.

import { useEffect, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { segmentTypeLabel } from '@/utils/eventSegmentLabels';
import type {
  EventBroadcastMessage,
  EventCasterChecklistItem,
  EventRun,
  EventSegment,
  EventStation,
  EventWave,
} from '@/types/events';
import nsAdminDirectorSegmentEditor from '@/lib/i18n/locales/admin-fr/adminDirectorSegmentEditor';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCard,
  rubanErr,
  rubanEyebrow,
  rubanInput,
  rubanInset,
  rubanLabel,
} from '@/features/admin/diffusion/ui/rubanClasses';

/** Champ compact des lignes de checklist. */
const rowInput =
  'px-2 py-1 rounded-[var(--r-ctrl,4px)] bg-[var(--s1,#100812)] border border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t1,#f4edf7)] text-xs outline-none focus:border-[var(--or,#b467d1)]';

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
  const t = useAdminT(nsAdminDirectorSegmentEditor);
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
      <div className={`${rubanCard} p-6 text-sm text-[var(--t3,#a39ba6)]`}>
        {t.selectPrompt}
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
      setError((err as Error)?.message ?? t.assignFailed);
    } finally {
      setAssigning(false);
    }
  }

  async function handleSave() {
    setError(null);
    if (!form.title.trim()) {
      setError(t.titleRequired);
      return;
    }
    const durRaw = form.duration_min.trim();
    let duration_min: number | null = null;
    if (durRaw.length > 0) {
      const n = Number.parseInt(durRaw, 10);
      if (!Number.isFinite(n) || n <= 0) {
        setError(t.durationPositive);
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
        setError(t.anchorNoDate);
        return;
      }
      const composed = composeAnchorIso(run.scheduled_at, form.anchorTime);
      if (!composed) {
        setError(t.anchorInvalid);
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
        setError(t.checklistIncomplete);
        return;
      }
      if (seenKeys.has(it.key)) {
        setError(format(t.checklistDuplicate, { key: it.key }));
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
      setError((err as Error)?.message ?? t.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={`${rubanCard} p-5 space-y-4`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className={rubanEyebrow}>{t.heading}</h3>
          <p className="mt-1 text-xs text-[var(--t4,#807984)]">
            {format(t.typeOrd, {
              type: segmentTypeLabel(segment.type),
              ord: segment.ord,
            })}
          </p>
        </div>
        <AdminButton
          variant="secondary"
          size="sm"
          onClick={handleSave}
          disabled={saving || busy}
        >
          {saving ? t.saving : t.save}
        </AdminButton>
      </div>

      {/* Section Horaire (Lot 6) — en HAUT pour signaler la criticite. */}
      <div className={`${rubanInset} p-3 space-y-2`}>
        <div className="flex items-center justify-between">
          <h4 className={rubanEyebrow}>{t.scheduleHeading}</h4>
          {form.anchorEnabled ? (
            <span
              className="inline-flex items-center gap-1 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--warn,#f5a524)]"
              aria-label={t.anchored}
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
              {t.anchored}
            </span>
          ) : (
            <span className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--t4,#807984)]">
              {t.autoComputed}
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
              className="h-[30px] px-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s1,#100812)] border border-[rgba(245,165,36,.45)] text-[var(--t1,#f4edf7)] text-sm font-mono outline-none focus:border-[var(--warn,#f5a524)]"
            />
            <AdminButton
              variant="ghost"
              size="xs"
              onClick={handleReleaseAnchor}
              data-testid="segment-anchor-release"
            >
              {t.release}
            </AdminButton>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-[var(--t4,#807984)]">
              {t.computedHelp}
            </p>
            <AdminButton
              variant="ghost"
              size="xs"
              onClick={handleEnableAnchor}
              data-testid="segment-anchor-enable"
              disabled={!run?.scheduled_at}
            >
              {t.anchorAction}
            </AdminButton>
          </div>
        )}
      </div>

      {/* Assignation Wave / Station (PATCH immediat). */}
      {onAssign && (
        <div className={`${rubanInset} p-3 space-y-2`}>
          <h4 className={rubanEyebrow}>{t.assignHeading}</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={rubanLabel}>{t.waveLabel}</label>
              <select
                value={segment.wave_id ?? ''}
                disabled={assigning || busy}
                onChange={(e) =>
                  handleAssign({ wave_id: e.target.value || null })
                }
                className={rubanInput}
                data-testid="segment-wave-select"
              >
                <option value="">{t.none}</option>
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
              <label className={rubanLabel}>{t.stationLabel}</label>
              <select
                value={segment.station_id ?? ''}
                disabled={assigning || busy}
                onChange={(e) =>
                  handleAssign({ station_id: e.target.value || null })
                }
                className={rubanInput}
                data-testid="segment-station-select"
              >
                <option value="">{t.none}</option>
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
          <label className={rubanLabel}>
            {t.titleLabel} <span className="text-[var(--err,#ff6b6b)]">*</span>
          </label>
          <input
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
            className={rubanInput}
          />
        </div>
        <div>
          <label className={rubanLabel}>{t.durationLabel}</label>
          <input
            type="number"
            min={1}
            step={1}
            value={form.duration_min}
            onChange={(e) => update('duration_min', e.target.value)}
            placeholder={t.durationPlaceholder}
            className={rubanInput}
          />
        </div>
        {segment.type === 'match' && (
          <div className="text-xs text-neutral-500">
            <span className="text-neutral-400">{t.linkedMatch}</span>{' '}
            <code>{segment.match_id ?? '—'}</code>
            <span className="ml-2 text-neutral-600">{t.linkedMatchHint}</span>
          </div>
        )}
      </div>

      <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-4 space-y-3">
        <h4 className={rubanEyebrow}>{t.broadcastHeading}</h4>
        <div>
          <label className={rubanLabel}>{t.discordLabel}</label>
          <textarea
            value={form.bm_discord}
            onChange={(e) => update('bm_discord', e.target.value)}
            rows={2}
            placeholder={t.discordPlaceholder}
            className={rubanInput}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={rubanLabel}>Push title</label>
            <input
              value={form.bm_push_title}
              onChange={(e) => update('bm_push_title', e.target.value)}
              className={rubanInput}
            />
          </div>
          <div>
            <label className={rubanLabel}>Email subject</label>
            <input
              value={form.bm_email_subject}
              onChange={(e) => update('bm_email_subject', e.target.value)}
              className={rubanInput}
            />
          </div>
        </div>
        <div>
          <label className={rubanLabel}>Push body</label>
          <input
            value={form.bm_push_body}
            onChange={(e) => update('bm_push_body', e.target.value)}
            className={rubanInput}
          />
        </div>
      </div>

      <div className="border-t border-[var(--line,rgba(194,196,201,.12))] pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className={rubanEyebrow}>Checklist caster</h4>
          <AdminButton variant="secondary" size="xs" onClick={addChecklistItem}>
            {t.addItem}
          </AdminButton>
        </div>
        {form.checklist.length === 0 ? (
          <p className="text-xs text-neutral-500">{t.emptyChecklist}</p>
        ) : (
          <ul className="space-y-2">
            {form.checklist.map((it, idx) => (
              <li
                key={idx}
                className={`flex items-center gap-2 p-2 ${rubanInset}`}
              >
                <input
                  value={it.key}
                  onChange={(e) =>
                    updateChecklistItem(idx, { key: e.target.value })
                  }
                  placeholder={t.keyPlaceholder}
                  className={`w-32 font-mono ${rowInput}`}
                />
                <input
                  value={it.label}
                  onChange={(e) =>
                    updateChecklistItem(idx, { label: e.target.value })
                  }
                  placeholder={t.labelPlaceholder}
                  className={`flex-1 ${rowInput}`}
                />
                <button
                  type="button"
                  onClick={() => removeChecklistItem(idx)}
                  className="px-2 py-1 rounded-[var(--r-ctrl,4px)] text-xs text-[var(--t3,#a39ba6)] hover:text-[var(--err,#ff6b6b)]"
                  aria-label={t.deleteAria}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <div className={`${rubanErr} px-3 py-2 text-xs`}>{error}</div>}
    </div>
  );
}
