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
//
// Passe « Le Ruban » (lot 10C) : le score en direct du match lié porte la
// lueur de l'antenne ; import en AdminButton — mêmes confirmations.

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

import {
  errNoticeClass,
  inputClass,
  labelClass,
  smallBtnClass,
} from './fieldClasses';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

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
  const t = useAdminT(nsAdminCasterScenes);
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
      className="rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3.5 mb-4"
      data-testid="caster-match-picker"
    >
      {dialog}

      <div className="flex flex-wrap items-center gap-2 mb-1.5">
        <h3 className="font-[family-name:var(--fd)] text-[13px] font-bold uppercase tracking-[0.12em] text-[var(--t1,#f4edf7)] [font-stretch:75%]">
          {t.pickerTitle}
        </h3>
      </div>
      <p className="text-[11px] text-neutral-500 mb-3">{t.pickerIntro}</p>

      {/* Erreur réseau : bandeau non bloquant, la sélection reste utilisable. */}
      {error && (
        <div
          className={`mb-3 px-3 py-2 text-xs flex flex-wrap items-center justify-between gap-2 ${errNoticeClass}`}
        >
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
        <AdminButton
          variant="secondary"
          size="xs"
          onClick={() => void handleImport()}
          disabled={!selectedMatchId || busy}
          data-testid="caster-import-match"
        >
          {busy ? t.pickerImporting : t.pickerImport}
        </AdminButton>

        {/* Indicateur « score en direct » + détachement du match lié. */}
        {linkedMatchId && (
          <div
            className="flex flex-wrap items-center gap-2"
            data-testid="caster-live-score-indicator"
          >
            <span
              role="status"
              className="inline-flex items-center gap-1.5 rounded-[3px] border border-[rgba(127,202,101,.55)] bg-[rgba(127,202,101,.13)] px-2.5 py-1 font-mono text-[12px] font-bold text-[var(--lf-200,#b3e7a3)] tabular-nums shadow-[var(--glow-live)]"
            >
              <span
                aria-hidden="true"
                className="h-2 w-2 rounded-full bg-[var(--lf,#7fca65)] animate-pulse"
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
