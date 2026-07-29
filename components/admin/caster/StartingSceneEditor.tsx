// components/admin/caster/StartingSceneEditor.tsx
//
// Éditeur web de la scène `starting` — port fidèle du form desktop
// (womenscup-caster/src/renderer/editor.js, SCENE_FORMS.starting) : titre,
// countdown en secondes, prochain match (équipes + format optionnel) et bloc
// marque & réseaux (hashtag inclus). Écrit la shape StartingSceneData.

import type { CasterScene, StartingSceneData } from '@/types/caster';
import { useAdminT } from '@/lib/i18n/useAdminT';

import BrandSocialsFields from './BrandSocialsFields';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

/** Le select format garde la chaîne ('' = —) ; converti au save. */
type StartingForm = Omit<StartingSceneData, 'nextMatch'> & {
  nextMatch: { team1: string; team2: string };
  nextBestOf: string;
};

const EMPTY_SOCIALS = {
  site: '',
  discord: '',
  twitch: '',
  youtube: '',
  instagram: '',
  tiktok: '',
};

function normalizeForm(raw: Record<string, unknown>): StartingForm {
  const d = (raw || {}) as Partial<StartingSceneData>;
  const nm = (d.nextMatch || {}) as Partial<StartingSceneData['nextMatch']>;
  return {
    title: d.title || '',
    // Défaut desktop : 300 s (le seed historique vaut 600).
    countdown: Number(d.countdown) || 300,
    nextMatch: { team1: nm.team1 || '', team2: nm.team2 || '' },
    nextBestOf: nm.bestOf ? String(nm.bestOf) : '',
    hashtag: d.hashtag || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: StartingForm
): Record<string, unknown> {
  return {
    ...raw,
    title: draft.title,
    countdown: draft.countdown,
    nextMatch: {
      team1: draft.nextMatch.team1,
      team2: draft.nextMatch.team2,
      // '' = — : la clé disparaît du jsonb (undefined), comme sur desktop.
      bestOf: draft.nextBestOf ? parseInt(draft.nextBestOf, 10) : undefined,
    },
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

export default function StartingSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { draft, patch, saveState } = useSceneDraft<StartingForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  return (
    <div className="space-y-4" data-testid="caster-starting-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.startingTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>{t.countdownSecondsLabel}</span>
        <input
          type="number"
          min={0}
          value={draft.countdown}
          onChange={(e) =>
            patch({ countdown: parseInt(e.target.value, 10) || 300 })
          }
          className={inputClass}
        />
      </label>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>{t.nextTeam1Label}</span>
          <input
            type="text"
            value={draft.nextMatch.team1}
            onChange={(e) =>
              patch({
                nextMatch: { ...draft.nextMatch, team1: e.target.value },
              })
            }
            placeholder={t.nextTeam1Placeholder}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t.nextTeam2Label}</span>
          <input
            type="text"
            value={draft.nextMatch.team2}
            onChange={(e) =>
              patch({
                nextMatch: { ...draft.nextMatch, team2: e.target.value },
              })
            }
            className={inputClass}
          />
        </label>
      </div>

      <label className="block">
        <span className={labelClass}>{t.nextBestOfLabel}</span>
        <select
          value={draft.nextBestOf}
          onChange={(e) => patch({ nextBestOf: e.target.value })}
          className={inputClass}
        >
          <option value="">{t.bestOfNone}</option>
          <option value="3">{t.bo3}</option>
          <option value="5">{t.bo5}</option>
          <option value="7">{t.bo7}</option>
        </select>
      </label>

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
