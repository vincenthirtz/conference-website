// components/admin/caster/ScrimSceneEditor.tsx
//
// Éditeur web de la scène `scrim` — port fidèle du form desktop
// (womenscup-caster/src/renderer/scrimEditor.js). Champs persistés EXACTS de
// son read() : { mode, scrimId, title, hashtag, socials }. Les données live
// (équipes, score, horaire) ne transitent PAS par scene.data — l'overlay les
// tire lui-même de l'API, même découpage que sur desktop (canal `scrim`).
//
// Le picker de scrim (mode matchup) est peuplé via GET /api/scrims?limit=50
// (même API publique que l'app desktop, ici en same-origin).

import { useEffect, useState } from 'react';

import type { CasterScene, ScrimSceneData } from '@/types/caster';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import BrandSocialsFields from './BrandSocialsFields';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

/** Ligne brute de GET /api/scrims (champs utilisés par le picker). */
type ApiScrim = {
  id: string;
  slug?: string | null;
  status?: string | null;
  scheduled_date?: string | null;
  team1?: { name?: string | null } | null;
  team2?: { name?: string | null } | null;
};

const EMPTY_SOCIALS = {
  site: '',
  discord: '',
  twitch: '',
  youtube: '',
  x: '',
  instagram: '',
  tiktok: '',
};

function normalizeForm(raw: Record<string, unknown>): ScrimSceneData {
  const d = (raw || {}) as Partial<ScrimSceneData>;
  const mode =
    d.mode === 'next' || d.mode === 'list' || d.mode === 'matchup'
      ? d.mode
      : 'matchup';
  return {
    mode,
    scrimId: d.scrimId || null,
    title: d.title || '',
    hashtag: d.hashtag || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: ScrimSceneData
): Record<string, unknown> {
  return {
    ...raw,
    mode: draft.mode,
    scrimId: draft.scrimId,
    title: draft.title,
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

export default function ScrimSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  const { draft, patch, saveState } = useSceneDraft<ScrimSceneData>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  // Liste des scrims publics pour le picker (null = pas encore chargée).
  const [scrims, setScrims] = useState<ApiScrim[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [listSeq, setListSeq] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setListError(null);
    void (async () => {
      try {
        const res = await fetch('/api/scrims?limit=50');
        const json = await res.json().catch(() => null);
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        if (!cancelled) {
          setScrims(Array.isArray(json?.scrims) ? json.scrims : []);
        }
      } catch (err) {
        if (!cancelled) {
          setListError((err as Error)?.message || 'error');
          setScrims((prev) => prev ?? []);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [listSeq]);

  const statusLabels: Record<string, string> = {
    scheduled: t.scrimStatusScheduled,
    running: t.scrimStatusRunning,
    completed: t.scrimStatusCompleted,
    cancelled: t.scrimStatusCancelled,
  };

  /** Libellé d'option — même format que le picker desktop. */
  function scrimLabel(s: ApiScrim): string {
    const t1 = s.team1?.name || t.scrimTbd;
    const t2 = s.team2?.name || t.scrimTbd;
    const when = s.scheduled_date
      ? ' — ' +
        new Date(s.scheduled_date).toLocaleString('fr-FR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
    const status = (s.status && statusLabels[s.status]) || s.status || '';
    return `${t1} vs ${t2}${when}${status ? ` [${status}]` : ''}`;
  }

  // scrimId peut être un UUID OU un slug (contrat desktop) : on résout vers
  // l'id de la ligne correspondante pour le <select> contrôlé. Un scrim absent
  // de la liste (privé/ancien) reste sélectionnable via une option fantôme —
  // il n'est jamais écrasé tant que le caster ne touche pas au select.
  const selectedId = draft.scrimId || '';
  const matched = (scrims || []).find(
    (s) => s.id === selectedId || s.slug === selectedId
  );
  const selectValue = matched?.id ?? selectedId;
  const ghost = selectedId && !matched ? selectedId : null;

  return (
    <div className="space-y-4" data-testid="caster-scrim-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.scrimTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t.scrimTitlePlaceholder}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>{t.scrimModeLabel}</span>
        <select
          value={draft.mode}
          onChange={(e) =>
            patch({ mode: e.target.value as ScrimSceneData['mode'] })
          }
          className={inputClass}
        >
          <option value="matchup">{t.scrimModeMatchup}</option>
          <option value="next">{t.scrimModeNext}</option>
          <option value="list">{t.scrimModeList}</option>
        </select>
      </label>

      {/* Picker de scrim — visible uniquement en mode matchup (parité desktop). */}
      {draft.mode === 'matchup' && (
        <div className="space-y-2" data-testid="caster-scrim-picker">
          <label className="block">
            <span className={labelClass}>{t.scrimPickLabel}</span>
            <select
              value={selectValue}
              onChange={(e) => patch({ scrimId: e.target.value || null })}
              className={inputClass}
              disabled={scrims === null}
            >
              {scrims === null ? (
                <option value="">{t.scrimListLoading}</option>
              ) : (
                <>
                  <option value="">{t.scrimPickNone}</option>
                  {ghost && <option value={ghost}>{ghost}</option>}
                  {scrims.map((s) => (
                    <option key={s.id} value={s.id}>
                      {scrimLabel(s)}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setListSeq((n) => n + 1)}
              className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
              data-testid="caster-scrim-reload"
            >
              {t.scrimReload}
            </button>
            {listError && (
              <span className="text-xs text-red-300">
                {format(t.scrimListError, { message: listError })}
              </span>
            )}
          </div>
        </div>
      )}

      <p className="text-[11px] text-neutral-500">{t.scrimHint}</p>

      <BrandSocialsFields
        socials={draft.socials}
        onSocialsChange={(socials) => patch({ socials })}
        hashtag={{
          value: draft.hashtag,
          onChange: (hashtag) => patch({ hashtag }),
        }}
      />
    </div>
  );
}
