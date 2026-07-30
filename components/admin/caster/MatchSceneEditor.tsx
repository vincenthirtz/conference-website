// components/admin/caster/MatchSceneEditor.tsx
//
// Éditeur web de la scène `match` du cockpit caster — port React fidèle de
// l'éditeur de l'app desktop womenscup-caster (src/renderer/matchEditor.js +
// teamFields.js + brandSocials.js + heroBans.js). Écrit EXACTEMENT la shape
// MatchSceneData dans `caster_scenes.data` pour rester interopérable.
//
// Lot 2 : la machinerie draft/auto-save/anti-clobber vit dans useSceneDraft
// (comportement inchangé) ; les blocs marque/logos/steppers sont partagés
// (BrandSocialsFields, LogosFields, ScoreStepper) ; les bans héros deviennent
// éditables via deux <select> peuplés du manifeste statique ow-heroes.json.
//
// Lot 5 : le <select> map est alimenté par le map pool du tournoi sélectionné
// dans le match picker quand il y en a un (prop `tournamentMaps`).
//
//  - Bans : valeur du <select> = clé héros ('' = aucun) ; la sélection est
//    résolue en objet complet { key, name, portrait } via resolveHero — un ban
//    legacy à clé inconnue reste sélectionnable (option fantôme) et est
//    préservé tel quel (sémantique desktop). Visibles seulement quand le HUD
//    Overwatch est actif, comme dans l'app.

import { useCallback, useMemo } from 'react';

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { CasterScene, HeroBan, MatchSceneData } from '@/types/caster';
import { loadHeroes, resolveHero, type OwHero } from '@/utils/caster/heroBans';
import {
  mapOptions,
  normalizeBan,
  normalizeMatchData,
  parseCastersInput,
  teamInitial,
} from '@/utils/caster/matchScene';
import owHeroesJson from '@/lib/data/ow-heroes.json';

import BrandSocialsFields from './BrandSocialsFields';
import LogosFields from './LogosFields';
import ScoreStepper from './ScoreStepper';
import SaveIndicator from './SaveIndicator';
import {
  detailsClass,
  inputClass,
  labelClass,
  summaryClass,
} from './fieldClasses';
import { useSceneDraft } from './useSceneDraft';

// Manifeste statique (aucune requête réseau) — validé une fois au chargement.
const HERO_LIST: OwHero[] = loadHeroes(owHeroesJson);

type Props = {
  scene: CasterScene;
  /** saveSceneData du hook useCasterScenes (throw en cas d'erreur RLS/réseau). */
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
  /**
   * Map pool du tournoi sélectionné dans le match picker (lot 5). Absent/vide →
   * pool Overwatch par défaut, comme avant.
   */
  tournamentMaps?: Array<{ map_name: string }> | null;
};

/** État de formulaire : la data normalisée + le texte brut du champ casters. */
type MatchForm = MatchSceneData & { castersText: string };

/** Texte du champ casters depuis la data brute (tableau → « A, B »). */
function castersTextFrom(raw: Record<string, unknown>): string {
  const casters = raw?.casters;
  return Array.isArray(casters) ? casters.filter(Boolean).join(', ') : '';
}

function normalizeForm(raw: Record<string, unknown>): MatchForm {
  return { ...normalizeMatchData(raw), castersText: castersTextFrom(raw) };
}

/**
 * Payload complet écrit en base : data brute d'abord (préserve les champs que
 * cet éditeur ne connaît pas), puis les champs édités — shape MatchSceneData.
 */
function buildPayload(
  raw: Record<string, unknown>,
  draft: MatchForm
): Record<string, unknown> {
  return {
    ...raw,
    team1: draft.team1,
    team2: draft.team2,
    score1: draft.score1,
    score2: draft.score2,
    map: draft.map,
    bestOf: draft.bestOf,
    seriesDots: draft.seriesDots,
    overwatchHud: draft.overwatchHud,
    // Bans résolus au moment de la sélection (resolveHero) puis réécrits tels
    // quels — un ban legacy non touché est préservé.
    ban1: draft.ban1,
    ban2: draft.ban2,
    casters: parseCastersInput(draft.castersText),
    team1Logo: draft.team1Logo,
    team2Logo: draft.team2Logo,
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

/**
 * Sélecteur de ban héros + vignette portrait. La valeur est la clé du héros ;
 * un ban existant à clé hors manifeste est gardé sélectionnable (option
 * fantôme) pour ne pas l'effacer d'un simple passage sur la scène.
 */
function BanSelect({
  ban,
  teamName,
  onChange,
}: {
  ban: HeroBan;
  teamName: string;
  onChange: (next: HeroBan) => void;
}) {
  const t = useAdminT('adminCasterScenes');
  const b = normalizeBan(ban);
  const currentKey = (ban && typeof ban === 'object' && ban.key) || '';
  const ghost =
    currentKey && !HERO_LIST.some((h) => h.key === currentKey)
      ? { key: currentKey, name: b?.name || currentKey }
      : null;

  return (
    <div className="flex items-center gap-2">
      {b?.portrait ? (
        // eslint-disable-next-line @next/next/no-img-element -- portrait externe (CDN Blizzard), pas d'optimisation next/image nécessaire
        <img
          src={b.portrait}
          alt=""
          aria-hidden="true"
          className="h-8 w-8 rounded-md object-cover shrink-0"
        />
      ) : (
        <span
          aria-hidden="true"
          className="h-8 w-8 rounded-md bg-neutral-800 text-neutral-400 text-xs font-bold flex items-center justify-center shrink-0"
        >
          {b ? teamInitial(b.name) : '—'}
        </span>
      )}
      <label className="block flex-1 min-w-0">
        <span className={labelClass}>
          {format(t.banTeamLabel, { team: teamName })}
        </span>
        <select
          value={currentKey}
          onChange={(e) =>
            onChange(
              resolveHero(
                HERO_LIST,
                e.target.value,
                ban && typeof ban === 'object' ? ban : null
              )
            )
          }
          className={inputClass}
        >
          <option value="">{t.banNoneOption}</option>
          {ghost && <option value={ghost.key}>{ghost.name}</option>}
          {HERO_LIST.map((h) => (
            <option key={h.key} value={h.key}>
              {h.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export default function MatchSceneEditor({
  scene,
  onSave,
  tournamentMaps = null,
}: Props) {
  const t = useAdminT('adminCasterScenes');

  const { draft, patch, update, saveState } = useSceneDraft<MatchForm>({
    scene,
    onSave,
    normalize: normalizeForm,
    buildPayload,
  });

  const swapTeams = useCallback(() => {
    update((d) => ({
      ...d,
      team1: d.team2,
      team2: d.team1,
      score1: d.score2,
      score2: d.score1,
      team1Logo: d.team2Logo,
      team2Logo: d.team1Logo,
      ban1: d.ban2,
      ban2: d.ban1,
    }));
  }, [update]);

  // Maps du tournoi sélectionné dans le match picker si dispo, sinon le pool par
  // défaut ; la valeur courante est conservée même hors liste (map renommée).
  const maps = useMemo(
    () => mapOptions(tournamentMaps, draft.map),
    [tournamentMaps, draft.map]
  );

  const linkedMatchId =
    (scene.data?.matchId as string | null | undefined) ?? null;

  return (
    <div className="space-y-4" data-testid="caster-match-editor">
      <SaveIndicator state={saveState} />

      {/* Match lié au site : le score live peut écraser la saisie manuelle. */}
      {linkedMatchId && (
        <div
          role="status"
          className="rounded-xl border border-cyan-500/30 bg-cyan-900/15 px-3 py-2.5 text-xs text-cyan-100 flex items-center gap-2"
          data-testid="caster-live-score-banner"
        >
          <span
            aria-hidden="true"
            className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0"
          />
          {t.liveMatchBanner}
        </div>
      )}

      {/* Scoreboard : équipes + scores + swap */}
      <div className="grid grid-cols-[1fr,auto,1fr] items-start gap-3">
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
        <div className="flex flex-col items-center gap-2 pt-1.5">
          <span className="text-xs font-bold text-neutral-500">{t.vs}</span>
          <button
            type="button"
            onClick={swapTeams}
            title={t.swapTeams}
            aria-label={t.swapTeams}
            className="px-2.5 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm"
            data-testid="caster-swap-teams"
          >
            ⇄
          </button>
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

      {/* Map + format */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>{t.mapLabel}</span>
          <select
            value={draft.map}
            onChange={(e) => patch({ map: e.target.value })}
            className={inputClass}
          >
            {maps.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelClass}>{t.bestOfLabel}</span>
          <select
            value={String(draft.bestOf)}
            onChange={(e) => patch({ bestOf: Number(e.target.value) || 5 })}
            className={inputClass}
          >
            <option value="3">{t.bo3}</option>
            <option value="5">{t.bo5}</option>
            <option value="7">{t.bo7}</option>
          </select>
        </label>
      </div>

      {/* Options match (repliable) */}
      <details className={detailsClass}>
        <summary className={summaryClass}>{t.optionsSummary}</summary>
        <div className="space-y-3 pt-2 pb-1">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={draft.seriesDots}
              onChange={(e) => patch({ seriesDots: e.target.checked })}
              className="accent-purple-500"
            />
            {t.seriesDotsLabel}
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={draft.overwatchHud}
              onChange={(e) => patch({ overwatchHud: e.target.checked })}
              className="accent-purple-500"
            />
            {t.overwatchHudLabel}
          </label>

          {/* Bans héros : sélecteurs peuplés du manifeste statique. Comme
              l'app desktop, visibles uniquement quand le HUD OW est actif. */}
          {draft.overwatchHud && (
            <div className="space-y-2" data-testid="caster-hero-bans">
              <p className="text-xs font-medium text-neutral-400">
                {t.bansTitle}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <BanSelect
                  ban={draft.ban1}
                  teamName={draft.team1 || t.team1Placeholder}
                  onChange={(next) => patch({ ban1: next })}
                />
                <BanSelect
                  ban={draft.ban2}
                  teamName={draft.team2 || t.team2Placeholder}
                  onChange={(next) => patch({ ban2: next })}
                />
              </div>
            </div>
          )}

          <label className="block">
            <span className={labelClass}>{t.castersLabel}</span>
            <input
              type="text"
              value={draft.castersText}
              onChange={(e) => patch({ castersText: e.target.value })}
              placeholder={t.castersPlaceholder}
              className={inputClass}
            />
          </label>
        </div>
      </details>

      {/* Logos des équipes (repliable) */}
      <LogosFields
        team1Logo={draft.team1Logo}
        team2Logo={draft.team2Logo}
        onChange={(p) => patch(p)}
      />

      {/* Marque & réseaux (repliable) */}
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
