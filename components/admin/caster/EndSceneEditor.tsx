// components/admin/caster/EndSceneEditor.tsx
//
// Éditeur web de la scène `end` — port fidèle du form desktop
// (SCENE_FORMS.end) : titre (défaut « Merci ! »), sous-titre, textarea crédits
// (parseCredits ↔ creditsToText), partenaires (liste à virgules) et bloc
// marque & réseaux SANS hashtag (la scène end n'en porte pas — un hashtag
// existant en base est préservé par le spread). Écrit la shape EndSceneData.

import type { CasterScene, EndSceneData } from '@/types/caster';
import { useAdminT } from '@/lib/i18n/useAdminT';
import {
  creditsToText,
  parseCommaList,
  parseCredits,
} from '@/utils/caster/sceneParse';

import BrandSocialsFields from './BrandSocialsFields';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

/** Les textareas restent en texte brut dans le form ; parsés au save. */
type EndForm = Omit<EndSceneData, 'credits' | 'sponsors'> & {
  creditsText: string;
  sponsorsText: string;
};

const EMPTY_SOCIALS = {
  site: '',
  discord: '',
  twitch: '',
  youtube: '',
  instagram: '',
  tiktok: '',
};

function normalizeForm(raw: Record<string, unknown>): EndForm {
  const d = (raw || {}) as Partial<EndSceneData> & { message?: string };
  return {
    // Mêmes défauts visibles que les champs desktop.
    title: d.title || 'Merci !',
    subtitle: d.subtitle || d.message || '',
    creditsText: creditsToText(d.credits),
    sponsorsText: Array.isArray(d.sponsors)
      ? d.sponsors.join(', ')
      : d.sponsors || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: EndForm
): Record<string, unknown> {
  return {
    ...raw,
    title: draft.title,
    subtitle: draft.subtitle,
    credits: parseCredits(draft.creditsText),
    sponsors: parseCommaList(draft.sponsorsText),
    socials: { ...draft.socials },
  };
}

export default function EndSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { draft, patch, saveState } = useSceneDraft<EndForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  return (
    <div className="space-y-4" data-testid="caster-end-editor">
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
        <span className={labelClass}>{t.endSubtitleLabel}</span>
        <input
          type="text"
          value={draft.subtitle}
          onChange={(e) => patch({ subtitle: e.target.value })}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>{t.creditsLabel}</span>
        <textarea
          rows={4}
          value={draft.creditsText}
          onChange={(e) => patch({ creditsText: e.target.value })}
          placeholder={t.creditsPlaceholder}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>{t.sponsorsLabel}</span>
        <input
          type="text"
          value={draft.sponsorsText}
          onChange={(e) => patch({ sponsorsText: e.target.value })}
          className={inputClass}
        />
      </label>

      {/* Pas de hashtag sur la scène end (parité desktop). */}
      <BrandSocialsFields
        socials={draft.socials}
        onSocialsChange={(socials) => patch({ socials })}
      />
    </div>
  );
}
