// components/admin/caster/MatchPickerPanel.tsx
//
// Match picker du cockpit caster web (lot 5) — port React de
// womenscup-caster/src/renderer/matchPicker.js : sélecteur tournoi → match,
// recherche accent-insensible au-delà de 8 matchs, pastilles de statut et heure
// programmée dans les libellés, import dans la scène, indicateur « score en
// direct » et bouton « Détacher ».
//
// Le panneau n'est affiché que pour les scènes pilotées par le tournoi
// (`match` / `results`), comme sur desktop (toggleMatchPicker).
//
// Découpage : ce composant ne fait QUE l'UI + le choix. Les données viennent de
// useCasterTournaments (props `picker`), l'écriture dans la scène est remontée à
// la page (onImport / onDetach) qui possède saveSceneData. Le suivi du score
// live est dans useLinkedMatchTracker (poll — voir l'en-tête du hook pour le
// pourquoi ce n'est pas du Realtime).

import { useMemo, useState } from 'react';

import EmptyState from '@/components/admin/EmptyState';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import type { UseCasterTournaments } from '@/hooks/useCasterTournaments';
import {
  MATCH_FILTER_THRESHOLD,
  filterMatches,
  matchOptionLabel,
  matchScores,
  teamLabel,
} from '@/utils/caster/matchPickerFormat';
import type { CasterApiMatch, CasterScene } from '@/types/caster';

import { inputClass, labelClass } from './fieldClasses';

const smallBtnClass =
  'px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-xs font-medium disabled:opacity-50';

type Props = {
  /** Scène cible de l'import (type `match` ou `results`). */
  scene: CasterScene;
  picker: UseCasterTournaments;
  /** Dernier état connu du match lié (poll) — null si aucun/pas encore lu. */
  linkedMatch: CasterApiMatch | null;
  /** Importe le match dans la scène (fetch détail + écriture) côté page. */
  onImport: (matchId: string) => Promise<void>;
  /** Coupe le lien (matchId → null) pour repasser en saisie manuelle. */
  onDetach: () => Promise<void>;
};

export default function MatchPickerPanel({
  scene,
  picker,
  linkedMatch,
  onImport,
  onDetach,
}: Props) {
  const t = useAdminT('adminCasterScenes');
  const { confirm, dialog } = useConfirmDialog();

  const [selectedMatchId, setSelectedMatchId] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);

  const {
    tournaments,
    tournamentsLoading,
    tournamentId,
    matches,
    matchesLoading,
    error,
    selectTournament,
    reloadMatches,
  } = picker;

  const linkedMatchId =
    typeof scene.data?.matchId === 'string' && scene.data.matchId
      ? scene.data.matchId
      : null;

  const showFilter = matches.length > MATCH_FILTER_THRESHOLD;

  // Liste affichée : filtrée, mais le match sélectionné reste toujours présent
  // (sinon le <select> perdrait sa valeur dès que la recherche l'exclut).
  const visibleMatches = useMemo(() => {
    const filtered = filterMatches(matches, showFilter ? query : '');
    if (!selectedMatchId || filtered.some((m) => m.id === selectedMatchId)) {
      return filtered;
    }
    const selected = matches.find((m) => m.id === selectedMatchId);
    return selected ? [selected, ...filtered] : filtered;
  }, [matches, query, selectedMatchId, showFilter]);

  async function handleImport() {
    if (!selectedMatchId || busy) return;
    // Garde-fou : la scène est déjà branchée sur un AUTRE match et elle est
    // peut-être à l'antenne — on ne remplace pas son contenu en silence.
    if (linkedMatchId && linkedMatchId !== selectedMatchId) {
      const ok = await confirm({
        title: t.pickerReplaceConfirmTitle,
        subtitle: t.pickerReplaceConfirmBody,
        variant: 'warning',
        confirmLabel: t.pickerReplaceConfirmLabel,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await onImport(selectedMatchId);
    } finally {
      setBusy(false);
    }
  }

  async function handleDetach() {
    setBusy(true);
    try {
      await onDetach();
    } finally {
      setBusy(false);
    }
  }

  const live = linkedMatch ? matchScores(linkedMatch) : null;

  return (
    <section
      className="rounded-2xl border border-neutral-800 bg-neutral-950/40 p-3.5 mb-4"
      data-testid="caster-match-picker"
    >
      {dialog}

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h3 className="text-sm font-bold">{t.pickerTitle}</h3>
      </div>
      <p className="text-[11px] text-neutral-500 mb-3">{t.pickerIntro}</p>

      {/* Erreur réseau : bandeau non bloquant, la sélection reste utilisable. */}
      {error && (
        <div className="mb-3 rounded-xl bg-red-900/30 border border-red-500/40 px-3 py-2 text-xs text-red-200 flex flex-wrap items-center justify-between gap-2">
          <span>{format(t.pickerLoadError, { message: error })}</span>
          <button
            type="button"
            onClick={reloadMatches}
            className={smallBtnClass}
          >
            {t.retry}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block">
          <span className={labelClass}>{t.pickerTournamentLabel}</span>
          <select
            value={tournamentId ?? ''}
            onChange={(e) => {
              setSelectedMatchId('');
              setQuery('');
              selectTournament(e.target.value || null);
            }}
            disabled={tournamentsLoading}
            className={inputClass}
            data-testid="caster-pick-tournament"
          >
            <option value="">
              {tournamentsLoading ? t.pickerLoading : t.pickerTournamentNone}
            </option>
            {tournaments.map((tour) => (
              <option key={tour.id} value={tour.id}>
                {`${tour.name} (${tour.status})`}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={labelClass}>{t.pickerMatchLabel}</span>
          <div className="flex items-center gap-2">
            <select
              value={selectedMatchId}
              onChange={(e) => setSelectedMatchId(e.target.value)}
              disabled={!tournamentId || matchesLoading}
              className={inputClass}
              data-testid="caster-pick-match"
            >
              <option value="">
                {matchesLoading ? t.pickerLoading : t.pickerMatchNone}
              </option>
              {visibleMatches.map((m) => (
                <option key={m.id} value={m.id}>
                  {matchOptionLabel(m, { tbdLabel: t.scrimTbd })}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={reloadMatches}
              disabled={!tournamentId || matchesLoading}
              title={t.pickerRefresh}
              aria-label={t.pickerRefresh}
              className={`${smallBtnClass} shrink-0`}
              data-testid="caster-refresh-matches"
            >
              ⟳
            </button>
          </div>
        </label>
      </div>

      {/* Recherche : révélée seulement quand la liste est assez longue pour
          que faire défiler coûte plus cher que taper (seuil desktop). */}
      {showFilter && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.pickerSearchPlaceholder}
          aria-label={t.pickerSearchPlaceholder}
          className={`${inputClass} mt-3`}
          data-testid="caster-match-filter"
        />
      )}

      {/* Liste vide : tournoi sans match diffusable, ou recherche sans résultat. */}
      {tournamentId && !matchesLoading && matches.length === 0 && (
        <EmptyState
          title={t.pickerNoMatchesTitle}
          description={t.pickerNoMatchesBody}
        />
      )}
      {showFilter && visibleMatches.length === 0 && (
        <p className="mt-2 text-xs text-neutral-500">
          {t.pickerNoSearchResult}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleImport()}
          disabled={!selectedMatchId || busy}
          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 border border-purple-400/40 text-xs font-semibold disabled:opacity-50"
          data-testid="caster-import-match"
        >
          {busy ? t.pickerImporting : t.pickerImport}
        </button>

        {/* Indicateur « score en direct » + détachement du match lié. */}
        {linkedMatchId && (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="caster-live-score-indicator"
          >
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-2.5 py-1 text-[11px] text-cyan-100 tabular-nums"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse"
              />
              {linkedMatch && live
                ? format(t.pickerLiveScore, {
                    team1: teamLabel(linkedMatch.team1, t.scrimTbd),
                    team2: teamLabel(linkedMatch.team2, t.scrimTbd),
                    score1: live.score1,
                    score2: live.score2,
                  })
                : t.pickerLiveScoreLoading}
            </span>
            <button
              type="button"
              onClick={() => void handleDetach()}
              disabled={busy}
              className={smallBtnClass}
              data-testid="caster-detach-match"
            >
              {t.pickerDetach}
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-neutral-600">
        {linkedMatchId ? t.pickerLiveHint : t.pickerHint}
      </p>
    </section>
  );
}
