// components/admin/caster/LeaderboardSceneEditor.tsx
//
// Éditeur web de la scène `leaderboard` — port fidèle du form desktop
// (womenscup-caster/src/renderer/leaderboardEditor.js). Champs persistés EXACTS
// de son read() : { title, mode, leagueSlug, leagueName, topN, hashtag,
// socials }.
//
// Deux modes : `leaderboard` (classement Glicko-2 des joueuses) et `league`
// (standings d'une ligue). Le picker de ligue n'est affiché QU'EN mode league
// (parité desktop, qui masque le champ), et sa liste n'est chargée que dans ce
// mode : inutile d'appeler l'API pour un mode qui ne s'en sert pas.
//
// Le topN est tenu en CHAÎNE dans le draft et borné [3..20] à l'écriture
// (clampTopN) : borner à chaque frappe rendrait la saisie de « 15 » impossible
// (le « 1 » remonterait à 3). Après enregistrement, l'écho Realtime renormalise
// le champ sur la valeur réellement stockée.

import type { CasterScene, LeaderboardSceneData } from '@/types/caster';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  TOP_N_MAX,
  TOP_N_MIN,
  clampTopN,
  labelWithStatus,
} from '@/utils/caster/dataSceneOptions';
import { fetchPublicLeagues } from '@/utils/caster/publicApiClient';

import BrandSocialsFields from './BrandSocialsFields';
import PublicDataPicker from './PublicDataPicker';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { usePublicList } from './usePublicList';
import { useSceneDraft } from './useSceneDraft';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

/** topN en chaîne le temps de la saisie ; hashtag toujours présent en form. */
type LeaderboardForm = Omit<LeaderboardSceneData, 'topN' | 'hashtag'> & {
  topNInput: string;
  hashtag: string;
};

const EMPTY_SOCIALS = {
  site: '',
  discord: '',
  twitch: '',
  youtube: '',
  instagram: '',
  tiktok: '',
};

function normalizeForm(raw: Record<string, unknown>): LeaderboardForm {
  const d = (raw || {}) as Partial<LeaderboardSceneData>;
  return {
    title: d.title || '',
    mode: d.mode === 'league' ? 'league' : 'leaderboard',
    leagueSlug: d.leagueSlug || null,
    leagueName: d.leagueName || '',
    topNInput: String(clampTopN(d.topN)),
    hashtag: d.hashtag || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: LeaderboardForm
): Record<string, unknown> {
  return {
    ...raw,
    title: draft.title,
    mode: draft.mode,
    leagueSlug: draft.leagueSlug,
    leagueName: draft.leagueName,
    topN: clampTopN(draft.topNInput),
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

export default function LeaderboardSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  const { draft, patch, saveState } = useSceneDraft<LeaderboardForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  const isLeague = draft.mode === 'league';
  const leagues = usePublicList(fetchPublicLeagues, { enabled: isLeague });
  const options =
    leagues.items === null
      ? null
      : leagues.items.map((row) => ({
          value: row.slug,
          label: labelWithStatus(row.name, row.status),
          name: (row.name || '').trim(),
        }));

  return (
    <div className="space-y-4" data-testid="caster-leaderboard-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.leaderboardTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t.leaderboardTitlePlaceholder}
          className={inputClass}
        />
      </label>

      <label className="block">
        <span className={labelClass}>{t.leaderboardModeLabel}</span>
        <select
          value={draft.mode}
          onChange={(e) =>
            patch({
              mode: e.target.value === 'league' ? 'league' : 'leaderboard',
            })
          }
          className={inputClass}
        >
          <option value="leaderboard">{t.leaderboardModePlayers}</option>
          <option value="league">{t.leaderboardModeLeague}</option>
        </select>
      </label>

      {/* Picker de ligue — mode league seulement (parité desktop). */}
      {isLeague && (
        <PublicDataPicker
          testId="caster-leaderboard-league-picker"
          label={t.leaguePickLabel}
          options={options}
          selected={draft.leagueSlug}
          memorizedLabel={draft.leagueName}
          onSelect={(value, name) =>
            patch({ leagueSlug: value || null, leagueName: name })
          }
          onResolvedName={(leagueName) => patch({ leagueName })}
          ghostNote={t.pickerGhostNote}
          onReload={leagues.reload}
          loadingLabel={t.pickerLoading}
          noneLabel={t.leaguePickNone}
          reloadLabel={t.dataReload}
          error={
            leagues.error
              ? format(t.leagueListError, { message: leagues.error })
              : null
          }
        />
      )}

      <label className="block">
        <span className={labelClass}>{t.leaderboardTopNLabel}</span>
        <input
          type="number"
          min={TOP_N_MIN}
          max={TOP_N_MAX}
          value={draft.topNInput}
          onChange={(e) => patch({ topNInput: e.target.value })}
          onBlur={() =>
            patch({ topNInput: String(clampTopN(draft.topNInput)) })
          }
          className={inputClass}
        />
        <span className="mt-1 block text-[11px] text-neutral-500">
          {format(t.leaderboardTopNHint, {
            min: String(TOP_N_MIN),
            max: String(TOP_N_MAX),
          })}
        </span>
      </label>

      <p className="text-[11px] text-neutral-500">{t.leaderboardHint}</p>

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
