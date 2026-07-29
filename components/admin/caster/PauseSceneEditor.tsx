// components/admin/caster/PauseSceneEditor.tsx
//
// Éditeur web de la scène `pause` — port fidèle du form desktop
// (SCENE_FORMS.pause) : titre (défaut « Be Right Back »), message, bandeau
// défilant optionnel et bloc marque & réseaux. Écrit la shape PauseSceneData.

import type { CasterScene, PauseSceneData } from '@/types/caster';
import { useAdminT } from '@/lib/i18n/useAdminT';

import BrandSocialsFields from './BrandSocialsFields';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

const EMPTY_SOCIALS = {
  site: '',
  discord: '',
  twitch: '',
  youtube: '',
  instagram: '',
  tiktok: '',
};

function normalizeForm(raw: Record<string, unknown>): PauseSceneData {
  const d = (raw || {}) as Partial<PauseSceneData>;
  return {
    // Même défaut visible que le champ desktop (value="Be Right Back").
    title: d.title || 'Be Right Back',
    message: d.message || '',
    marquee: d.marquee || '',
    hashtag: d.hashtag || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: PauseSceneData
): Record<string, unknown> {
  return {
    ...raw,
    title: draft.title,
    message: draft.message,
    marquee: draft.marquee,
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

export default function PauseSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { draft, patch, saveState } = useSceneDraft<PauseSceneData>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  return (
    <div className="space-y-4" data-testid="caster-pause-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.bigTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>{t.pauseMessageLabel}</span>
        <input
          type="text"
          value={draft.message}
          onChange={(e) => patch({ message: e.target.value })}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>{t.marqueeLabel}</span>
        <input
          type="text"
          value={draft.marquee}
          onChange={(e) => patch({ marquee: e.target.value })}
          placeholder={t.marqueePlaceholder}
          className={inputClass}
        />
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
