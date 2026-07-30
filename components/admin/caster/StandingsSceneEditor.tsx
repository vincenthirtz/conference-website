// components/admin/caster/StandingsSceneEditor.tsx
//
// Éditeur web de la scène `standings` (classement final d'un tournoi) — port
// fidèle du form desktop (womenscup-caster/src/renderer/standingsEditor.js).
// Champs persistés EXACTS de son read() : { title, tournamentId,
// tournamentName, hashtag, socials }.
//
// La scène ne stocke que la référence du tournoi : le podium + les prix sont
// chargés par l'overlay depuis GET /api/public/v1/tournaments/:id/standings.
// Le picker utilise la liste PUBLIQUE des tournois (published/running/completed)
// et non /api/caster/v1/tournaments comme le desktop : un classement final
// concerne surtout un tournoi `completed`, que la liste caster exclut.

import type { CasterScene, StandingsSceneData } from '@/types/caster';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { labelWithStatus } from '@/utils/caster/dataSceneOptions';
import { fetchPublicTournaments } from '@/utils/caster/publicApiClient';

import BrandSocialsFields from './BrandSocialsFields';
import PublicDataPicker from './PublicDataPicker';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { usePublicList } from './usePublicList';
import { useSceneDraft } from './useSceneDraft';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

/** `hashtag` optionnel dans la shape ; le formulaire le tient en chaîne. */
type StandingsForm = StandingsSceneData & { hashtag: string };

const EMPTY_SOCIALS = {
  site: '',
  discord: '',
  twitch: '',
  youtube: '',
  instagram: '',
  tiktok: '',
};

function normalizeForm(raw: Record<string, unknown>): StandingsForm {
  const d = (raw || {}) as Partial<StandingsSceneData>;
  return {
    title: d.title || '',
    tournamentId: d.tournamentId || null,
    tournamentName: d.tournamentName || '',
    hashtag: d.hashtag || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: StandingsForm
): Record<string, unknown> {
  return {
    ...raw,
    title: draft.title,
    tournamentId: draft.tournamentId,
    tournamentName: draft.tournamentName,
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

export default function StandingsSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { draft, patch, saveState } = useSceneDraft<StandingsForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  const tournaments = usePublicList(fetchPublicTournaments);
  const options =
    tournaments.items === null
      ? null
      : tournaments.items.map((row) => ({
          value: row.id,
          label: labelWithStatus(row.name, row.status),
          name: (row.name || '').trim(),
          aliases: row.slug ? [row.slug] : undefined,
        }));

  return (
    <div className="space-y-4" data-testid="caster-standings-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.standingsTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t.standingsTitlePlaceholder}
          className={inputClass}
        />
      </label>

      <PublicDataPicker
        testId="caster-standings-picker"
        label={t.pickerTournamentLabel}
        options={options}
        selected={draft.tournamentId}
        memorizedLabel={draft.tournamentName}
        onSelect={(value, name) =>
          patch({ tournamentId: value || null, tournamentName: name })
        }
        onResolvedName={(tournamentName) => patch({ tournamentName })}
        ghostNote={t.pickerGhostNote}
        onReload={tournaments.reload}
        loadingLabel={t.pickerLoading}
        noneLabel={t.pickerTournamentNone}
        reloadLabel={t.dataReload}
        error={
          tournaments.error
            ? format(t.tournamentListError, { message: tournaments.error })
            : null
        }
      />

      <p className="text-[11px] text-neutral-500">{t.standingsHint}</p>

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
