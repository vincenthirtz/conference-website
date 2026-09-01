// components/admin/caster/ResultsSceneEditor.tsx
//
// Éditeur web de la scène `results` — port fidèle du form desktop
// (SCENE_FORMS.results) : équipes + scores (steppers), format optionnel, MVP,
// textarea « résultats par map » (parseMapResults ↔ mapResultsToText), logos
// et bloc marque & réseaux. Écrit la shape ResultsSceneData.

import type { CasterScene, ResultsSceneData } from '@/types/caster';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { mapResultsToText, parseMapResults } from '@/utils/caster/sceneParse';

import BrandSocialsFields from './BrandSocialsFields';
import LogosFields from './LogosFields';
import ScoreStepper from './ScoreStepper';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

/** Le textarea maps reste en texte brut dans le form ; parsé au save. */
type ResultsForm = Omit<ResultsSceneData, 'bestOf' | 'mapResults'> & {
  bestOf: string;
  mapResultsText: string;
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

function normalizeForm(raw: Record<string, unknown>): ResultsForm {
  const d = (raw || {}) as Partial<ResultsSceneData>;
  return {
    team1: d.team1 || '',
    team2: d.team2 || '',
    score1: Number(d.score1) || 0,
    score2: Number(d.score2) || 0,
    bestOf: d.bestOf ? String(d.bestOf) : '',
    mvp: d.mvp || '',
    mapResultsText: mapResultsToText(d.mapResults),
    team1Logo: d.team1Logo || '',
    team2Logo: d.team2Logo || '',
    hashtag: d.hashtag || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: ResultsForm
): Record<string, unknown> {
  return {
    ...raw,
    team1: draft.team1,
    team2: draft.team2,
    score1: draft.score1,
    score2: draft.score2,
    team1Logo: draft.team1Logo,
    team2Logo: draft.team2Logo,
    // '' = — : la clé disparaît du jsonb (undefined), comme sur desktop.
    bestOf: draft.bestOf ? parseInt(draft.bestOf, 10) : undefined,
    mvp: draft.mvp,
    mapResults: parseMapResults(draft.mapResultsText),
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

export default function ResultsSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  const { draft, patch, saveState } = useSceneDraft<ResultsForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  return (
    <div className="space-y-4" data-testid="caster-results-editor">
      <SaveIndicator state={saveState} />

      {/* Scoreboard final : équipes + scores */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        <div className="space-y-2">
          <input
            type="text"
            value={draft.team1}
            onChange={(e) => patch({ team1: e.target.value })}
            placeholder={t.team1Placeholder}
            aria-label={t.team1Label}
            className={`${inputClass} font-semibold`}
          />
          <ScoreStepper
            value={draft.score1}
            label={t.scoreTeam1}
            minusLabel={t.scoreMinus}
            plusLabel={t.scorePlus}
            onChange={(n) => patch({ score1: n })}
          />
        </div>
        <div className="flex items-center pt-2.5">
          <span className="text-xs font-bold text-neutral-500">{t.vs}</span>
        </div>
        <div className="space-y-2">
          <input
            type="text"
            value={draft.team2}
            onChange={(e) => patch({ team2: e.target.value })}
            placeholder={t.team2Placeholder}
            aria-label={t.team2Label}
            className={`${inputClass} font-semibold`}
          />
          <div className="flex justify-end">
            <ScoreStepper
              value={draft.score2}
              label={t.scoreTeam2}
              minusLabel={t.scoreMinus}
              plusLabel={t.scorePlus}
              onChange={(n) => patch({ score2: n })}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>{t.bestOfLabel}</span>
          <select
            value={draft.bestOf}
            onChange={(e) => patch({ bestOf: e.target.value })}
            className={inputClass}
          >
            <option value="">{t.bestOfNone}</option>
            <option value="3">{t.bo3}</option>
            <option value="5">{t.bo5}</option>
            <option value="7">{t.bo7}</option>
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>{t.resultsMvpLabel}</span>
          <input
            type="text"
            value={draft.mvp}
            onChange={(e) => patch({ mvp: e.target.value })}
            placeholder={t.resultsMvpPlaceholder}
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>{t.mapResultsLabel}</span>
        <textarea
          rows={4}
          value={draft.mapResultsText}
          onChange={(e) => patch({ mapResultsText: e.target.value })}
          placeholder={t.mapResultsPlaceholder}
          className={inputClass}
        />
      </label>

      <LogosFields
        team1Logo={draft.team1Logo}
        team2Logo={draft.team2Logo}
        onChange={(p) => patch(p)}
      />

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
