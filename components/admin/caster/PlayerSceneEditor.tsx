// components/admin/caster/PlayerSceneEditor.tsx
//
// Éditeur web de la scène `player` (Player Spotlight) — port fidèle du form
// desktop (womenscup-caster/src/renderer/playerEditor.js). Champs persistés
// EXACTS de son read() : { title, userId, playerName, hashtag, socials }.
//
// La scène ne stocke qu'une RÉFÉRENCE (`userId`) : le profil (rating Glicko-2,
// bilan, forme, H2H, palmarès) est chargé par l'overlay depuis
// GET /api/public/v1/players/:userId. Le picker liste les joueuses classées via
// GET /api/public/v1/leaderboard?limit=100 — exactement la source du desktop,
// ici en same-origin (donc préprod/local voient leurs propres joueuses).

import type { CasterScene, PlayerSceneData } from '@/types/caster';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import {
  isUuid,
  playerDisplayName,
  playerOptionLabel,
} from '@/utils/caster/dataSceneOptions';
import { fetchPublicLeaderboard } from '@/utils/caster/publicApiClient';

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

/** `hashtag` est optionnel dans la shape ; le formulaire le tient en chaîne. */
type PlayerForm = PlayerSceneData & { hashtag: string };

const EMPTY_SOCIALS = {
  site: '',
  discord: '',
  twitch: '',
  youtube: '',
  instagram: '',
  tiktok: '',
};

function normalizeForm(raw: Record<string, unknown>): PlayerForm {
  const d = (raw || {}) as Partial<PlayerSceneData>;
  return {
    title: d.title || '',
    userId: d.userId || null,
    playerName: d.playerName || '',
    hashtag: d.hashtag || '',
    socials: { ...EMPTY_SOCIALS, ...(d.socials || {}) },
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: PlayerForm
): Record<string, unknown> {
  return {
    ...raw,
    title: draft.title,
    userId: draft.userId,
    playerName: draft.playerName,
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

export default function PlayerSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  const { draft, patch, saveState } = useSceneDraft<PlayerForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  const players = usePublicList(fetchPublicLeaderboard);
  const options =
    players.items === null
      ? null
      : players.items.map((row) => ({
          value: row.userId,
          label: playerOptionLabel(row, t.playerFallbackName),
          name: playerDisplayName(row, t.playerFallbackName),
        }));

  return (
    <div className="space-y-4" data-testid="caster-player-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.playerTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t.playerTitlePlaceholder}
          className={inputClass}
        />
      </label>

      <PublicDataPicker
        testId="caster-player-picker"
        label={t.playerPickLabel}
        options={options}
        selected={draft.userId}
        memorizedLabel={draft.playerName}
        onSelect={(value, name) =>
          patch({ userId: value || null, playerName: name })
        }
        onResolvedName={(playerName) => patch({ playerName })}
        onReload={players.reload}
        loadingLabel={t.pickerLoading}
        noneLabel={t.playerPickNone}
        reloadLabel={t.dataReload}
        error={
          players.error
            ? format(t.playerListError, { message: players.error })
            : null
        }
      />

      {/* `data.userId` DOIT être un UUID : GET /api/public/v1/players/:userId
          répond 400 sur autre chose, et l'overlay affiche « profil
          indisponible » à l'antenne. Cas possible sur une scène bricolée à la
          main côté desktop — on le signale au lieu de le découvrir en direct. */}
      {draft.userId && !isUuid(draft.userId) && (
        <p
          className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-[11px] text-amber-200"
          data-testid="caster-player-invalid-ref"
        >
          {t.playerInvalidRef}
        </p>
      )}

      <p className="text-[11px] text-neutral-500">{t.playerHint}</p>

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
