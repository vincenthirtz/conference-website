// components/admin/caster/MvpSceneEditor.tsx
//
// Éditeur web de la scène `mvp` — port du form desktop
// (womenscup-caster/src/renderer/mvpEditor.js). Champs persistés de son
// read() : { title, candidates } où candidates = [{ id: '1'..'8', label }]
// (max 8). Le desktop saisit les candidates dans un textarea (1/ligne) ; ici,
// liste ajout/suppression — même shape écrite en base.
//
// `total` / `isOpen` = état du poll (votes chat Twitch) : affiché ici en
// LECTURE SEULE. Le poll live (démarrer/arrêter/reset + tally des votes) est
// piloté par MvpPollPanel, monté au niveau de la PAGE pour survivre au
// changement de scène ; il publie son snapshot dans cette même `data`. Ces
// champs traversent le payload intacts via le spread de la data brute.

import type { CasterScene } from '@/types/caster';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

const MAX_CANDIDATES = 8;

/** Form : libellés bruts (les lignes vides sont filtrées au save). */
type MvpForm = {
  title: string;
  candidates: string[];
};

/** Libellé d'une candidate, tolérant aux deux shapes rencontrées en base
 *  ({ id, label } écrit par l'app desktop ; { name } sur d'anciennes lignes). */
function candidateLabel(c: unknown): string {
  if (!c || typeof c !== 'object') return '';
  const o = c as { label?: string; name?: string };
  return o.label || o.name || '';
}

function normalizeForm(raw: Record<string, unknown>): MvpForm {
  const d = (raw || {}) as { title?: string; candidates?: unknown };
  const candidates = Array.isArray(d.candidates)
    ? d.candidates.map(candidateLabel).slice(0, MAX_CANDIDATES)
    : [];
  return {
    // Même défaut visible que le champ desktop (value="Vote MVP").
    title: d.title || 'Vote MVP',
    candidates,
  };
}

/** Compteurs déjà publiés par le poll, indexés par id de candidate. */
function existingCounts(
  raw: Record<string, unknown>
): Record<string, { count?: number; percent?: number }> {
  const list = Array.isArray(raw?.candidates) ? raw.candidates : [];
  const out: Record<string, { count?: number; percent?: number }> = {};
  for (const c of list) {
    const o = (c || {}) as { id?: unknown; count?: unknown; percent?: unknown };
    if (o.id == null) continue;
    if (o.count == null && o.percent == null) continue;
    out[String(o.id)] = {
      count: Number(o.count) || 0,
      percent: Number(o.percent) || 0,
    };
  }
  return out;
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: MvpForm
): Record<string, unknown> {
  // Le poll live (MvpPollPanel) publie count/percent dans ces mêmes objets :
  // on les reporte pour qu'une simple correction de libellé ne remette pas
  // l'overlay à zéro en attendant la prochaine publication du tally.
  const counts = existingCounts(raw);
  const candidates = draft.candidates
    .map((label) => label.trim())
    .filter(Boolean)
    .slice(0, MAX_CANDIDATES)
    .map((label, i) => {
      const id = String(i + 1);
      return counts[id] ? { id, label, ...counts[id] } : { id, label };
    });
  return {
    ...raw,
    title: draft.title || 'Vote MVP',
    candidates,
  };
}

export default function MvpSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { draft, patch, saveState } = useSceneDraft<MvpForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  // État du poll en lecture seule (snapshot en base — tally live au lot 4).
  const total = Number((scene.data as { total?: unknown })?.total) || 0;
  const isOpen = (scene.data as { isOpen?: unknown })?.isOpen === true;

  return (
    <div className="space-y-4" data-testid="caster-mvp-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.mvpTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t.mvpTitlePlaceholder}
          className={inputClass}
        />
      </label>

      {/* Candidates : ajout/suppression (max 8, numérotées 1..N au save). */}
      <div className="space-y-2" data-testid="caster-mvp-candidates">
        <p className="text-xs font-medium text-neutral-400">
          {t.mvpCandidatesLabel}
        </p>
        {draft.candidates.length === 0 && (
          <p className="text-xs text-neutral-500">{t.mvpNoCandidates}</p>
        )}
        {draft.candidates.map((label, i) => (
          // key par index : liste ordonnée éditée par position, pas d'identité stable
          <div key={i} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-xs font-bold text-neutral-500 text-right">
              {i + 1}
            </span>
            <input
              type="text"
              value={label}
              onChange={(e) => {
                const next = [...draft.candidates];
                next[i] = e.target.value;
                patch({ candidates: next });
              }}
              placeholder={t.mvpCandidatePlaceholder}
              aria-label={format(t.mvpCandidateAria, { index: i + 1 })}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() =>
                patch({
                  candidates: draft.candidates.filter((_, j) => j !== i),
                })
              }
              title={format(t.mvpRemoveCandidate, { index: i + 1 })}
              aria-label={format(t.mvpRemoveCandidate, { index: i + 1 })}
              className="shrink-0 px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => patch({ candidates: [...draft.candidates, ''] })}
          disabled={draft.candidates.length >= MAX_CANDIDATES}
          className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="caster-mvp-add"
        >
          {t.mvpAddCandidate}
        </button>
      </div>

      {/* État du poll (snapshot lecture seule). */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5 space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs">
          <span
            className={
              isOpen ? 'text-emerald-300 font-medium' : 'text-neutral-400'
            }
          >
            {isOpen ? t.mvpPollOpen : t.mvpPollClosed}
          </span>
          <span className="text-neutral-300">
            {format(t.mvpPollTotal, { total: String(total) })}
          </span>
        </div>
        <p className="text-[11px] text-neutral-500">{t.mvpPollPanelNote}</p>
      </div>

      <p className="text-[11px] text-neutral-500">{t.mvpHint}</p>
    </div>
  );
}
