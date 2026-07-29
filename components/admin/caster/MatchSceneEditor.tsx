// components/admin/caster/MatchSceneEditor.tsx
//
// Éditeur web de la scène `match` du cockpit caster — port React fidèle de
// l'éditeur de l'app desktop womenscup-caster (src/renderer/matchEditor.js +
// teamFields.js + brandSocials.js). Écrit EXACTEMENT la shape MatchSceneData
// dans `caster_scenes.data` pour rester interopérable avec l'app desktop.
//
// Comportement clé :
//  - Draft local initialisé via normalizeMatchData(scene.data), auto-save
//    debounce ~600 ms via onSave(scene.id, next) où next = { ...scene.data,
//    ...champs édités } — le spread de la data brute d'abord préserve les
//    champs inconnus/futurs (obsScene, matchId, banLabel, castersLabel…).
//  - Anti-clobber : tant que le draft est dirty ou qu'une sauvegarde est en
//    vol, les mises à jour Realtime de la scène active sont ignorées ; le
//    draft est ré-initialisé quand une maj distante arrive draft propre. Le
//    parent remonte le composant (key={scene.id}) au changement de scène.
//  - Bans héros : AFFICHAGE SEUL dans ce lot (édition au lot 2). Les valeurs
//    ban1/ban2 ne changent que via « Échanger les équipes » (swap), sinon
//    elles sont réécrites telles quelles au save.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { CasterScene, MatchSceneData } from '@/types/caster';
import {
  mapOptions,
  normalizeBan,
  normalizeMatchData,
  parseCastersInput,
  teamInitial,
} from '@/utils/caster/matchScene';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  scene: CasterScene;
  /** saveSceneData du hook useCasterScenes (throw en cas d'erreur RLS/réseau). */
  onSave: (sceneId: string, data: Record<string, unknown>) => Promise<void>;
};

/** Clamp d'un score de série : entier entre 0 et 9 (comme le stepper desktop). */
function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(9, Math.max(0, Math.trunc(value)));
}

/** Texte du champ casters depuis la data brute (tableau → « A, B »). */
function castersTextFrom(raw: Record<string, unknown>): string {
  const casters = raw?.casters;
  return Array.isArray(casters) ? casters.filter(Boolean).join(', ') : '';
}

/**
 * Payload complet écrit en base : data brute d'abord (préserve les champs que
 * cet éditeur ne connaît pas), puis les champs édités — shape MatchSceneData.
 */
function buildPayload(
  raw: Record<string, unknown>,
  draft: MatchSceneData,
  castersText: string
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
    // Pas d'édition des bans dans ce lot : seules les valeurs existantes
    // (éventuellement échangées par le swap) sont réécrites telles quelles.
    ban1: draft.ban1,
    ban2: draft.ban2,
    casters: parseCastersInput(castersText),
    team1Logo: draft.team1Logo,
    team2Logo: draft.team2Logo,
    hashtag: draft.hashtag,
    socials: { ...draft.socials },
  };
}

/** Vignette d'un ban héros (nom + portrait si dispo) — lecture seule (lot 1). */
function BanChip({ ban, teamName }: { ban: unknown; teamName: string }) {
  const t = useAdminT('adminCasterScenes');
  const b = normalizeBan(ban);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950/60 px-2.5 py-2">
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
      <div className="min-w-0">
        <p className="text-[11px] text-neutral-500 truncate">
          {format(t.banTeamLabel, { team: teamName })}
        </p>
        <p className="text-sm text-neutral-200 truncate">
          {b ? b.name : t.banNone}
        </p>
      </div>
    </div>
  );
}

/** Champ score avec steppers −/+ (réglage rapide à l'antenne, sans clavier). */
function ScoreStepper({
  value,
  label,
  minusLabel,
  plusLabel,
  onChange,
}: {
  value: number;
  label: string;
  minusLabel: string;
  plusLabel: string;
  onChange: (next: number) => void;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border border-neutral-700 bg-neutral-950 overflow-hidden">
      <button
        type="button"
        tabIndex={-1}
        aria-label={minusLabel}
        onClick={() => onChange(clampScore(value - 1))}
        className="px-3 py-2 text-neutral-300 hover:bg-neutral-800 text-lg leading-none"
      >
        −
      </button>
      <input
        type="number"
        min={0}
        max={9}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(clampScore(Number(e.target.value)))}
        className="w-14 bg-transparent text-center text-xl font-extrabold text-white py-1.5 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={plusLabel}
        onClick={() => onChange(clampScore(value + 1))}
        className="px-3 py-2 text-neutral-300 hover:bg-neutral-800 text-lg leading-none"
      >
        +
      </button>
    </div>
  );
}

export default function MatchSceneEditor({ scene, onSave }: Props) {
  const t = useAdminT('adminCasterScenes');
  const { addToast } = useToast();

  const [draft, setDraft] = useState<MatchSceneData>(() =>
    normalizeMatchData(scene.data)
  );
  const [castersText, setCastersText] = useState(() =>
    castersTextFrom(scene.data)
  );
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  // Data brute la plus fraîche (base du spread au save — préserve les champs
  // inconnus, dont ceux mis à jour à distance pendant l'édition).
  const rawRef = useRef<Record<string, unknown>>(scene.data);
  useEffect(() => {
    rawRef.current = scene.data;
  }, [scene.data]);

  // Anti-clobber : save en vol + numéro de séquence des éditions locales.
  const inFlightRef = useRef(false);
  const editSeqRef = useRef(0);

  // Maj distante (Realtime) alors que le draft est propre → ré-init du draft.
  // Gardé par identité pour ne pas ré-initialiser quand seul `dirty` bouge
  // (retour à propre après save : l'écho Realtime n'est pas encore arrivé).
  const lastAppliedRef = useRef<Record<string, unknown>>(scene.data);
  useEffect(() => {
    if (scene.data === lastAppliedRef.current) return;
    lastAppliedRef.current = scene.data;
    if (dirty || inFlightRef.current) return;
    setDraft(normalizeMatchData(scene.data));
    setCastersText(castersTextFrom(scene.data));
  }, [scene.data, dirty]);

  // Auto-save debounce ~600 ms : chaque édition re-arme le timer (le draft est
  // une dépendance de l'effet), la fermeture capture donc l'état le plus frais.
  useEffect(() => {
    if (!dirty) return undefined;
    const seq = editSeqRef.current;
    const timer = setTimeout(async () => {
      inFlightRef.current = true;
      setSaveState('saving');
      try {
        await onSave(
          scene.id,
          buildPayload(rawRef.current, draft, castersText)
        );
        // Une édition pendant le vol re-déclenchera un save : on ne repasse à
        // propre que si rien n'a bougé depuis la capture du payload.
        if (editSeqRef.current === seq) {
          setDirty(false);
          setSaveState('saved');
        }
      } catch (err) {
        setSaveState('error');
        addToast(
          format(t.saveErrorToast, {
            message: (err as Error)?.message || '',
          }),
          'error'
        );
      } finally {
        inFlightRef.current = false;
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [dirty, draft, castersText, scene.id, onSave, addToast, t]);

  // Flush best-effort à l'unmount (changement de scène / navigation) pour ne
  // pas perdre une édition tombée dans la fenêtre de debounce.
  const latestRef = useRef({ draft, castersText, dirty });
  useEffect(() => {
    latestRef.current = { draft, castersText, dirty };
  });
  useEffect(() => {
    return () => {
      const l = latestRef.current;
      if (!l.dirty) return;
      void onSave(
        scene.id,
        buildPayload(rawRef.current, l.draft, l.castersText)
      ).catch(() => {
        /* best-effort : la page se démonte, pas de toast possible */
      });
    };
  }, [scene.id, onSave]);

  const markEdit = useCallback(() => {
    editSeqRef.current += 1;
    setDirty(true);
    setSaveState('saving');
  }, []);

  const patch = useCallback(
    (p: Partial<MatchSceneData>) => {
      setDraft((d) => ({ ...d, ...p }));
      markEdit();
    },
    [markEdit]
  );

  const swapTeams = useCallback(() => {
    setDraft((d) => ({
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
    markEdit();
  }, [markEdit]);

  // Pas de maps tournoi dans ce lot : pool par défaut + valeur courante.
  const maps = useMemo(() => mapOptions(null, draft.map), [draft.map]);

  const linkedMatchId =
    (scene.data?.matchId as string | null | undefined) ?? null;

  const socialsFields: Array<{
    key: keyof MatchSceneData['socials'];
    label: string;
    placeholder: string;
  }> = [
    {
      key: 'site',
      label: t.socialSiteLabel,
      placeholder: t.socialSitePlaceholder,
    },
    {
      key: 'discord',
      label: t.socialDiscordLabel,
      placeholder: t.socialDiscordPlaceholder,
    },
    {
      key: 'twitch',
      label: t.socialTwitchLabel,
      placeholder: t.socialTwitchPlaceholder,
    },
    {
      key: 'youtube',
      label: t.socialYoutubeLabel,
      placeholder: t.socialYoutubePlaceholder,
    },
    {
      key: 'instagram',
      label: t.socialInstagramLabel,
      placeholder: t.socialInstagramPlaceholder,
    },
    {
      key: 'tiktok',
      label: t.socialTiktokLabel,
      placeholder: t.socialTiktokPlaceholder,
    },
  ];

  const inputClass =
    'w-full rounded-md bg-neutral-950 border border-neutral-700 px-2.5 py-2 text-sm text-white placeholder:text-neutral-600';

  return (
    <div className="space-y-4" data-testid="caster-match-editor">
      {/* Indicateur de sauvegarde (auto-save) */}
      <div className="flex items-center justify-end min-h-[1rem]">
        <span
          role="status"
          aria-live="polite"
          className={`text-[11px] font-medium ${
            saveState === 'error'
              ? 'text-red-300'
              : saveState === 'saving'
                ? 'text-amber-300'
                : 'text-neutral-500'
          }`}
          data-testid="caster-save-indicator"
        >
          {saveState === 'saving'
            ? t.saveSaving
            : saveState === 'saved'
              ? t.saveSaved
              : saveState === 'error'
                ? t.saveErrorShort
                : ''}
        </span>
      </div>

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
          <span className="block text-xs text-neutral-400 mb-1">
            {t.mapLabel}
          </span>
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
          <span className="block text-xs text-neutral-400 mb-1">
            {t.bestOfLabel}
          </span>
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
      <details className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-neutral-200 py-1">
          {t.optionsSummary}
        </summary>
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

          {/* Bans héros : affichage seul (édition au lot 2, valeurs préservées).
              Comme l'app desktop, visibles uniquement quand le HUD OW est actif. */}
          {draft.overwatchHud && (
            <div className="space-y-2" data-testid="caster-hero-bans">
              <p className="text-xs font-medium text-neutral-400">
                {t.bansTitle}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <BanChip
                  ban={draft.ban1}
                  teamName={draft.team1 || t.team1Placeholder}
                />
                <BanChip
                  ban={draft.ban2}
                  teamName={draft.team2 || t.team2Placeholder}
                />
              </div>
              <p className="text-[11px] text-neutral-500">{t.bansLot2Note}</p>
            </div>
          )}

          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1">
              {t.castersLabel}
            </span>
            <input
              type="text"
              value={castersText}
              onChange={(e) => {
                setCastersText(e.target.value);
                markEdit();
              }}
              placeholder={t.castersPlaceholder}
              className={inputClass}
            />
          </label>
        </div>
      </details>

      {/* Logos des équipes (repliable) */}
      <details className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-neutral-200 py-1">
          {t.logosSummary}
        </summary>
        <div className="space-y-3 pt-2 pb-1">
          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1">
              {t.team1LogoLabel}
            </span>
            <input
              type="text"
              value={draft.team1Logo}
              onChange={(e) => patch({ team1Logo: e.target.value })}
              placeholder={t.logo1Placeholder}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1">
              {t.team2LogoLabel}
            </span>
            <input
              type="text"
              value={draft.team2Logo}
              onChange={(e) => patch({ team2Logo: e.target.value })}
              placeholder={t.logo2Placeholder}
              className={inputClass}
            />
          </label>
        </div>
      </details>

      {/* Marque & réseaux (repliable) */}
      <details className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium text-neutral-200 py-1">
          {t.brandSummary}
        </summary>
        <div className="space-y-3 pt-2 pb-1">
          <label className="block">
            <span className="block text-xs text-neutral-400 mb-1">
              {t.hashtagLabel}
            </span>
            <input
              type="text"
              value={draft.hashtag}
              onChange={(e) => patch({ hashtag: e.target.value })}
              placeholder={t.hashtagPlaceholder}
              className={inputClass}
            />
          </label>
          {socialsFields.map((f) => (
            <label key={f.key} className="block">
              <span className="block text-xs text-neutral-400 mb-1">
                {f.label}
              </span>
              <input
                type="text"
                value={draft.socials[f.key]}
                onChange={(e) =>
                  patch({
                    socials: { ...draft.socials, [f.key]: e.target.value },
                  })
                }
                placeholder={f.placeholder}
                className={inputClass}
              />
            </label>
          ))}
        </div>
      </details>
    </div>
  );
}
