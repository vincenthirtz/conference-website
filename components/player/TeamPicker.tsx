// components/player/TeamPicker.tsx
// Sélecteur d'équipe réutilisable (recherche + liste sélectionnable), factorisé
// depuis les listes d'équipes dupliquées de requests.tsx et messages.tsx.
//
// A11y : le champ recherche est labellisé (htmlFor/id), la liste est un
// `role="listbox"` avec des options `role="option"` + `aria-selected`. Un
// select pays optionnel (countryFilter) filtre la liste côté client.
//
// Le composant est présentationnel/contrôlé : l'appelant possède l'état
// `value` (id sélectionné) et, optionnellement, la recherche (`search` +
// `onSearchChange`) qui pilote généralement un fetch debouncé côté parent.

import { useId, useMemo, useState } from 'react';
import { useT, format } from '@/lib/i18n/useT';

export type TeamPickerTeam = {
  id: string;
  name: string;
  short_name?: string | null;
  logo_url?: string | null;
  country?: string | null;
  member_count?: number;
  /**
   * L'équipe se déclare disponible pour un scrim. Affiché en badge (R3) : sans
   * ce signal, choisir un adversaire revient à tirer au sort dans une liste
   * alphabétique.
   */
  open_for_scrim?: boolean;
};

type AccentColor = 'emerald' | 'purple' | 'blue';

const ACCENTS: Record<
  AccentColor,
  { selectedBg: string; selectedBorder: string; check: string; ring: string }
> = {
  emerald: {
    selectedBg: 'bg-emerald-600/30',
    selectedBorder: 'border-emerald-400/50',
    check: 'text-emerald-400',
    ring: 'focus:ring-emerald-400/80',
  },
  purple: {
    selectedBg: 'bg-purple-600/30',
    selectedBorder: 'border-purple-400/50',
    check: 'text-purple-400',
    ring: 'focus:ring-purple-400/80',
  },
  blue: {
    selectedBg: 'bg-blue-600/30',
    selectedBorder: 'border-blue-400/50',
    check: 'text-blue-400',
    ring: 'focus:ring-blue-400/80',
  },
};

type Props = {
  teams: TeamPickerTeam[];
  /** Id de l'équipe sélectionnée (chaîne vide = aucune). */
  value: string;
  onChange: (id: string) => void;
  loading?: boolean;
  error?: string | null;
  accentColor?: AccentColor;
  /** Affiche un select pays labellisé filtrant la liste côté client. */
  countryFilter?: boolean;
  /** Libellé du champ recherche (visible). */
  label: string;
  /** Message affiché quand la liste (filtrée) est vide. */
  emptyLabel: string;
  /** Recherche contrôlée. Omettre pour masquer le champ recherche. */
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
};

export default function TeamPicker({
  teams,
  value,
  onChange,
  loading = false,
  error = null,
  accentColor = 'emerald',
  countryFilter = false,
  label,
  emptyLabel,
  search,
  onSearchChange,
  searchPlaceholder,
}: Props) {
  const t = useT('teamPicker');
  const uid = useId();
  const searchId = `teampicker-search-${uid}`;
  const countryId = `teampicker-country-${uid}`;
  const listId = `teampicker-list-${uid}`;
  const accent = ACCENTS[accentColor];

  const [country, setCountry] = useState('');

  const countries = useMemo(() => {
    if (!countryFilter) return [];
    const set = new Set<string>();
    for (const team of teams) {
      if (team.country) set.add(team.country);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [countryFilter, teams]);

  const visibleTeams = useMemo(
    () =>
      countryFilter && country
        ? teams.filter((team) => team.country === country)
        : teams,
    [countryFilter, country, teams]
  );

  return (
    <div className="space-y-3">
      {onSearchChange && (
        <div>
          <label
            htmlFor={searchId}
            className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
          >
            {label}
          </label>
          <input
            id={searchId}
            type="search"
            value={search ?? ''}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder ?? t.searchPlaceholder}
            className={`w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 ${accent.ring}`}
          />
        </div>
      )}

      {countryFilter && countries.length > 0 && (
        <div>
          <label
            htmlFor={countryId}
            className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
          >
            {t.countryLabel}
          </label>
          <select
            id={countryId}
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className={`w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 ${accent.ring}`}
          >
            <option value="">{t.countryAll}</option>
            {countries.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      )}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100"
        >
          {error}
        </div>
      ) : (
        <div
          role="listbox"
          id={listId}
          aria-label={label}
          className="max-h-72 overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/40 p-2"
        >
          {loading && (
            <div className="text-sm text-gray-500 text-center py-4">
              {t.loading}
            </div>
          )}
          {!loading && visibleTeams.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-4">
              {emptyLabel}
            </div>
          )}
          {!loading &&
            visibleTeams.map((team) => {
              const selected = value === team.id;
              return (
                <button
                  key={team.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => onChange(team.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition focus:outline-none focus-visible:ring-2 ${accent.ring} ${
                    selected
                      ? `${accent.selectedBg} border ${accent.selectedBorder}`
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {team.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={team.logo_url}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs text-gray-500">
                        {(team.short_name || team.name)
                          .slice(0, 2)
                          .toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-white truncate">
                        {team.name}
                      </span>
                      {team.open_for_scrim && (
                        <span className="flex-shrink-0 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">
                          {t.openForScrimBadge}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      {team.short_name && <span>{team.short_name}</span>}
                      {team.country && (
                        <>
                          {team.short_name && <span>&middot;</span>}
                          <span>{team.country}</span>
                        </>
                      )}
                      {typeof team.member_count === 'number' && (
                        <>
                          {(team.short_name || team.country) && (
                            <span>&middot;</span>
                          )}
                          <span>
                            {format(t.membersCount, {
                              count: team.member_count,
                            })}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  {selected && (
                    <svg
                      className={`w-5 h-5 ${accent.check} flex-shrink-0`}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
