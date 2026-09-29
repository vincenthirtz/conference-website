// features/admin/tasks/ui/TaskBoardFilters.tsx — recherche, filtres et tri du
// board actif, plus les puces des filtres actifs. Tout est client-side : la
// page tient les valeurs, ce bloc les affiche et remonte les changements.
//
// Les sélecteurs restent natifs (et gardent leurs `id`) : `FilterSelect` ne
// sait ni se désactiver (« Mes cartes » verrouille l'assignée) ni porter
// l'option « Non assignée ».

import { format } from '@/lib/i18n/useAdminT';
import { ListSearch } from '@/features/admin/_shared/ui/ListToolbar';
import {
  type BoardLabel,
  type CardSort,
  type Dict,
  type Priority,
  type StaffOption,
  FILTER_UNASSIGNED,
  PRIORITIES,
  priorityLabel,
  readableTextColor,
} from '@/components/admin/tasks/taskBoardModel';
import {
  TB_CHECKBOX,
  TB_FIELD_SM,
  TB_FILTER_CHIP,
  TB_SURFACE,
} from './taskBoardClasses';

function RemoveMark() {
  return <span aria-hidden="true">✕</span>;
}

export default function TaskBoardFilters({
  t,
  staff,
  staffNameById,
  availableLabels,
  labelDefByName,
  filterSearch,
  onFilterSearchChange,
  debouncedSearch,
  filterAssignee,
  onFilterAssigneeChange,
  filterPriority,
  onFilterPriorityChange,
  filterLabel,
  onFilterLabelChange,
  filterMine,
  onFilterMineChange,
  cardSort,
  onCardSortChange,
  dndEnabled,
  hasActiveFilters,
  onClearFilters,
}: {
  t: Dict;
  staff: StaffOption[];
  staffNameById: Map<string, string>;
  availableLabels: string[];
  labelDefByName: Map<string, BoardLabel>;
  filterSearch: string;
  onFilterSearchChange: (value: string) => void;
  debouncedSearch: string;
  filterAssignee: string;
  onFilterAssigneeChange: (value: string) => void;
  filterPriority: string;
  onFilterPriorityChange: (value: string) => void;
  filterLabel: string;
  onFilterLabelChange: (value: string) => void;
  filterMine: boolean;
  onFilterMineChange: (value: boolean) => void;
  cardSort: CardSort;
  onCardSortChange: (value: CardSort) => void;
  dndEnabled: boolean;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}) {
  const labelDef = filterLabel ? labelDefByName.get(filterLabel) : undefined;
  return (
    <div className={`mb-5 p-3 ${TB_SURFACE}`}>
      <div className="flex flex-wrap items-center gap-2">
        <ListSearch
          value={filterSearch}
          onChange={onFilterSearchChange}
          placeholder={t.filterSearchPlaceholder}
          label={t.filterSearchLabel}
        />
        <label className="sr-only" htmlFor="filter-assignee">
          {t.assigneeLabel}
        </label>
        <select
          id="filter-assignee"
          value={filterMine ? '' : filterAssignee}
          disabled={filterMine}
          onChange={(e) => onFilterAssigneeChange(e.target.value)}
          className={TB_FIELD_SM}
        >
          <option value="">{t.filterAllAssignees}</option>
          <option value={FILTER_UNASSIGNED}>{t.unassigned}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-priority">
          {t.priorityLabel}
        </label>
        <select
          id="filter-priority"
          value={filterPriority}
          onChange={(e) => onFilterPriorityChange(e.target.value)}
          className={TB_FIELD_SM}
        >
          <option value="">{t.filterAllPriorities}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityLabel(t, p)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="filter-label">
          {t.filterLabelLabel}
        </label>
        <select
          id="filter-label"
          value={filterLabel}
          onChange={(e) => onFilterLabelChange(e.target.value)}
          disabled={availableLabels.length === 0}
          className={TB_FIELD_SM}
        >
          <option value="">{t.filterAllLabels}</option>
          {availableLabels.map((lbl) => (
            <option key={lbl} value={lbl}>
              {lbl}
            </option>
          ))}
        </select>
        <label className="inline-flex cursor-pointer items-center gap-2 px-2 text-sm text-[var(--t2,#c7bfca)]">
          <input
            type="checkbox"
            checked={filterMine}
            onChange={(e) => onFilterMineChange(e.target.checked)}
            className={TB_CHECKBOX}
          />
          {t.filterMyCards}
        </label>
        <label
          className="inline-flex items-center gap-2 text-sm text-[var(--t2,#c7bfca)]"
          htmlFor="card-sort"
        >
          <span className="text-[var(--t3,#a39ba6)]">{t.sortLabel}</span>
          <select
            id="card-sort"
            value={cardSort}
            onChange={(e) => onCardSortChange(e.target.value as CardSort)}
            className={TB_FIELD_SM}
          >
            <option value="manual">{t.sortManual}</option>
            <option value="priority">{t.sortPriority}</option>
            <option value="due">{t.sortDue}</option>
          </select>
        </label>
      </div>

      {/* Hint : le DnD est desactive sous tri automatique. */}
      {!dndEnabled && (
        <p className="mt-2 text-xs text-[var(--warn,#f5a524)]">
          {t.sortAutoHint}
        </p>
      )}

      {/* Puces de filtres actifs */}
      {hasActiveFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--t4,#807984)]">
            {t.filterActiveLabel}
          </span>
          {debouncedSearch.trim() && (
            <button
              type="button"
              onClick={() => onFilterSearchChange('')}
              className={TB_FILTER_CHIP}
            >
              {format(t.filterChipSearch, {
                value: debouncedSearch.trim(),
              })}
              <RemoveMark />
            </button>
          )}
          {filterMine && (
            <button
              type="button"
              onClick={() => onFilterMineChange(false)}
              className={TB_FILTER_CHIP}
            >
              {t.filterMyCards}
              <RemoveMark />
            </button>
          )}
          {!filterMine && filterAssignee && (
            <button
              type="button"
              onClick={() => onFilterAssigneeChange('')}
              className={TB_FILTER_CHIP}
            >
              {format(t.filterChipAssignee, {
                value:
                  filterAssignee === FILTER_UNASSIGNED
                    ? t.unassigned
                    : (staffNameById.get(filterAssignee) ?? filterAssignee),
              })}
              <RemoveMark />
            </button>
          )}
          {filterPriority && (
            <button
              type="button"
              onClick={() => onFilterPriorityChange('')}
              className={TB_FILTER_CHIP}
            >
              {format(t.filterChipPriority, {
                value: priorityLabel(t, filterPriority as Priority),
              })}
              <RemoveMark />
            </button>
          )}
          {filterLabel && (
            <button
              type="button"
              onClick={() => onFilterLabelChange('')}
              className={`${TB_FILTER_CHIP} hover:opacity-90`}
              // Couleur choisie par le staff pour ce label : une DONNEE.
              style={
                labelDef
                  ? {
                      backgroundColor: labelDef.color,
                      color: readableTextColor(labelDef.color),
                      borderColor: 'transparent',
                    }
                  : undefined
              }
            >
              {format(t.filterChipLabel, { value: filterLabel })}
              <RemoveMark />
            </button>
          )}
          <button
            type="button"
            onClick={onClearFilters}
            className="ml-1 inline-flex h-[22px] items-center rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] px-2 text-[11px] text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
          >
            {t.filterClear}
          </button>
        </div>
      )}
    </div>
  );
}
