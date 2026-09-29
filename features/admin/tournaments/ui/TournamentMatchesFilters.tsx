// features/admin/tournaments/ui/TournamentMatchesFilters.tsx — la ligne de
// filtres de l'écran « matchs du tournoi » (phase, statut, round, résultat,
// dates, recherche). Présentationnelle : la page possède les valeurs et leurs
// setters ; chaque changement de filtre ramène la pagination au début, comme
// avant l'extraction. Commandes d'écran : le PDF imprime la liste filtrée,
// pas les filtres.

import { useId, type FormEvent } from 'react';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  FilterSelect,
  ListSearch,
} from '@/features/admin/_shared/ui/ListToolbar';
import type { StageSummary } from '@/types/admin';
import {
  stageLabel,
  type TournamentMatchesDict,
} from './TournamentMatchesShared';

/** Champ libre à l'allure d'un FilterSelect (« ROUND : # »). */
function FilterInput({
  label,
  type,
  value,
  onChange,
  placeholder,
  width,
}: {
  label: string;
  type: 'number' | 'date';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  width: string;
}) {
  const id = useId();
  return (
    <div
      className={`inline-flex h-[38px] items-center gap-1.5 rounded-[var(--r-ctrl,4px)] border px-[13px] font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] [font-stretch:75%] ${
        value
          ? 'border-[var(--or,#b467d1)] text-[var(--or-200,#eec4ff)]'
          : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)]'
      }`}
    >
      <label htmlFor={id} className="whitespace-nowrap">
        {label} :
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${width} bg-transparent text-[12px] normal-case tracking-normal text-[var(--t1,#f4edf7)] outline-none [color-scheme:dark]`}
      />
    </div>
  );
}

export default function TournamentMatchesFilters({
  t,
  stages,
  onSubmit,
  stageFilter,
  setStageFilter,
  statusFilter,
  setStatusFilter,
  roundFilter,
  setRoundFilter,
  resultFilter,
  setResultFilter,
  dateFromFilter,
  setDateFromFilter,
  dateToFilter,
  setDateToFilter,
  search,
  setSearch,
  setOffset,
}: {
  t: TournamentMatchesDict;
  stages: StageSummary[];
  onSubmit: (e: FormEvent) => void;
  stageFilter: string;
  setStageFilter: (v: string) => void;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  roundFilter: string;
  setRoundFilter: (v: string) => void;
  resultFilter: string;
  setResultFilter: (v: string) => void;
  dateFromFilter: string;
  setDateFromFilter: (v: string) => void;
  dateToFilter: string;
  setDateToFilter: (v: string) => void;
  search: string;
  setSearch: (v: string) => void;
  setOffset: (v: number) => void;
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="mb-6 flex flex-wrap items-center gap-3 print:hidden"
    >
      <ListSearch
        value={search}
        onChange={(v) => setSearch(v)}
        placeholder={t.searchPlaceholder}
        label={t.filterSearch}
      />

      <FilterSelect
        label={t.filterStage}
        allLabel={t.allStages}
        value={stageFilter}
        onChange={(v) => {
          setStageFilter(v ?? '');
          setOffset(0);
        }}
        options={stages
          .slice()
          .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
          .map((s) => ({ value: s.id, label: stageLabel(t, s) }))}
      />

      <FilterSelect
        label={t.filterStatus}
        allLabel={t.allStatuses}
        value={statusFilter}
        onChange={(v) => {
          setStatusFilter(v ?? '');
          setOffset(0);
        }}
        options={[
          { value: 'pending', label: t.statusPending },
          { value: 'ongoing', label: t.statusOngoing },
          { value: 'finished', label: t.statusFinished },
          { value: 'cancelled', label: t.statusCancelled },
        ]}
      />

      <FilterInput
        label={t.filterRound}
        type="number"
        width="w-12"
        value={roundFilter}
        onChange={(v) => {
          setRoundFilter(v);
          setOffset(0);
        }}
        placeholder="#"
      />

      <FilterSelect
        label={t.filterResult}
        allLabel={t.resultAll}
        value={resultFilter}
        onChange={(v) => {
          setResultFilter(v ?? '');
          setOffset(0);
        }}
        options={[
          { value: 'win', label: t.resultWin },
          { value: 'no_result', label: t.resultNoResult },
          { value: 'bye', label: t.resultBye },
        ]}
      />

      <FilterInput
        label={t.filterDateFrom}
        type="date"
        width="w-[120px]"
        value={dateFromFilter}
        onChange={(v) => {
          setDateFromFilter(v);
          setOffset(0);
        }}
      />

      <FilterInput
        label={t.filterDateTo}
        type="date"
        width="w-[120px]"
        value={dateToFilter}
        onChange={(v) => {
          setDateToFilter(v);
          setOffset(0);
        }}
      />

      <div className="flex gap-2">
        <AdminButton type="submit" variant="secondary" size="sm">
          {t.filter}
        </AdminButton>
        <AdminButton
          variant="ghost"
          size="sm"
          onClick={() => {
            setStageFilter('');
            setStatusFilter('');
            setRoundFilter('');
            setResultFilter('');
            setDateFromFilter('');
            setDateToFilter('');
            setSearch('');
            setOffset(0);
          }}
        >
          {t.reset}
        </AdminButton>
      </div>
    </form>
  );
}
