// components/admin/caster/BracketSceneEditor.tsx
//
// Éditeur web de la scène `bracket` — port fidèle du form desktop
// (womenscup-caster/src/renderer/bracketEditor.js). Champs persistés EXACTS de
// son read() : { title, tournamentId, tournamentName, theme }. Pas de bloc
// marque & réseaux : l'overlay bracket est l'arbre embarqué du site, il n'a pas
// de bandeau de marque (parité desktop).
//
// Le picker est alimenté par GET /api/public/v1/tournaments (même-origine, sans
// token) — plus large que /api/caster/v1/* : il inclut les tournois `completed`,
// dont l'arbre reste diffusable après la finale.
//
// « Aperçu navigateur » ouvre l'embed du site sur cette même origine
// (/embed/tournament/<id>/bracket?theme=…) au lieu du owwomenscup.fr codé en dur
// du desktop : en préprod/local on veut voir SON arbre, pas celui de la prod.

import type { BracketSceneData, CasterScene } from '@/types/caster';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { labelWithStatus } from '@/utils/caster/dataSceneOptions';
import { fetchPublicTournaments } from '@/utils/caster/publicApiClient';

import PublicDataPicker from './PublicDataPicker';
import SaveIndicator from './SaveIndicator';
import { inputClass, labelClass } from './fieldClasses';
import { usePublicList } from './usePublicList';
import { useSceneDraft } from './useSceneDraft';

type Props = {
  scene: CasterScene;
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

function normalizeForm(raw: Record<string, unknown>): BracketSceneData {
  const d = (raw || {}) as Partial<BracketSceneData>;
  return {
    title: d.title || '',
    tournamentId: d.tournamentId || null,
    tournamentName: d.tournamentName || '',
    theme: d.theme === 'light' ? 'light' : 'dark',
  };
}

function buildPayload(
  raw: Record<string, unknown>,
  draft: BracketSceneData
): Record<string, unknown> {
  return {
    ...raw,
    title: draft.title,
    tournamentId: draft.tournamentId,
    tournamentName: draft.tournamentName,
    theme: draft.theme,
  };
}

/** URL de l'embed d'aperçu (null tant qu'aucun tournoi n'est choisi). */
export function bracketEmbedPath(draft: {
  tournamentId: string | null;
  theme: 'dark' | 'light';
}): string | null {
  if (!draft.tournamentId) return null;
  return `/embed/tournament/${encodeURIComponent(draft.tournamentId)}/bracket?theme=${draft.theme}`;
}

export default function BracketSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { draft, patch, saveState } = useSceneDraft<BracketSceneData>({
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
          // Le desktop accepte un slug comme référence persistée.
          aliases: row.slug ? [row.slug] : undefined,
        }));

  const previewPath = bracketEmbedPath(draft);

  return (
    <div className="space-y-4" data-testid="caster-bracket-editor">
      <SaveIndicator state={saveState} />

      <label className="block">
        <span className={labelClass}>{t.bracketTitleLabel}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(e) => patch({ title: e.target.value })}
          placeholder={t.bracketTitlePlaceholder}
          className={inputClass}
        />
      </label>

      <PublicDataPicker
        testId="caster-bracket-picker"
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

      <label className="block">
        <span className={labelClass}>{t.bracketThemeLabel}</span>
        <select
          value={draft.theme}
          onChange={(e) =>
            patch({ theme: e.target.value === 'light' ? 'light' : 'dark' })
          }
          className={inputClass}
        >
          <option value="dark">{t.bracketThemeDark}</option>
          <option value="light">{t.bracketThemeLight}</option>
        </select>
      </label>

      {previewPath ? (
        <a
          href={previewPath}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium"
          data-testid="caster-bracket-preview"
        >
          {t.bracketPreview}
        </a>
      ) : (
        <p className="text-[11px] text-neutral-500">{t.bracketPreviewHint}</p>
      )}

      <p className="text-[11px] text-neutral-500">{t.bracketHint}</p>
    </div>
  );
}
