// components/admin/director/SegmentEditor.tsx
// Feature: Run-of-show — Lot 3.
// Formulaire d'edition d'un segment. Le statut/ord/started_at/ended_at ne
// sont PAS editables ici (controlees par /start /skip /end /reorder cote API).
// Champs editables :
//   - title (string)
//   - duration_min (number?)
//   - broadcast_message (objet structure)
//   - caster_checklist (array d'items {key, label})
//
// La sauvegarde est manuelle ("Enregistrer") pour eviter les PATCH a chaque
// keystroke + simplifier l'UX. On affichera un "dirty" indicator si besoin.

import { useEffect, useState } from 'react';
import { segmentTypeLabel } from '@/utils/eventSegmentLabels';
import type {
  EventBroadcastMessage,
  EventCasterChecklistItem,
  EventSegment,
} from '@/types/events';

type Props = {
  segment: EventSegment | null;
  busy: boolean;
  onSave: (patch: {
    title?: string;
    duration_min?: number | null;
    broadcast_message?: EventBroadcastMessage | null;
    caster_checklist?: EventCasterChecklistItem[];
  }) => Promise<void>;
};

type FormState = {
  title: string;
  duration_min: string;
  bm_discord: string;
  bm_push_title: string;
  bm_push_body: string;
  bm_email_subject: string;
  checklist: EventCasterChecklistItem[];
};

function toForm(segment: EventSegment | null): FormState {
  if (!segment) {
    return {
      title: '',
      duration_min: '',
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

export default function SegmentEditor({ segment, busy, onSave }: Props) {
  const [form, setForm] = useState<FormState>(toForm(segment));
  const [saving, setSaving] = useState(false);
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
