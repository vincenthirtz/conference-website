// components/admin/director/MatchPicker.tsx
// Feature: Run-of-show — Lot 3 polish.
//
// Combobox d'autocompletion pour selectionner un match a rattacher a un
// segment de type=match. Remplace l'ancien champ UUID texte du
// AddSegmentModal. S'appuie sur /api/admin/matches/search (scoped tenant,
// manager+).
//
// Contrat :
//   - value: UUID du match selectionne (ou null)
//   - onChange(matchId, matchSummary?) : appele a chaque selection / clear.
//     matchSummary est fourni uniquement quand l'utilisateur clique un
//     resultat — pas au mount avec value pre-set (pas d'endpoint single get
//     pour ne pas multiplier les routes admin/matches).
//
// UX :
//   - Debounce 200ms (useDebounce existant) sur la frappe -> fetch search.
//   - Liste flottante max 240px scrollable, role=listbox.
//   - Keyboard: Esc ferme, Enter selectionne le premier resultat.
//   - Clear (×) reset value et input.
//   - Loading state pendant fetch, "Aucun match" si search retourne [].

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { useDebounce } from '@/hooks/useDebounce';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { logger } from '../../../utils/logger';
import nsAdminDirectorMatchPicker from '@/lib/i18n/locales/admin-fr/adminDirectorMatchPicker';

type Dict = typeof nsAdminDirectorMatchPicker.fr;

export type MatchPickerSummary = {
  kickoffAt: string | null;
  tournamentName: string | null;
  teamAName: string | null;
  teamBName: string | null;
};

type MatchSearchResult = MatchPickerSummary & {
  id: string;
  status: string | null;
};

type Props = {
  value: string | null;
  onChange: (matchId: string | null, summary?: MatchPickerSummary) => void;
  disabled?: boolean;
  placeholder?: string;
  /**
   * Resume pre-charge a afficher quand `value` est deja set (par exemple en
   * edition). Sinon, fallback "Match #<short_id>".
   */
  initialSummary?: MatchPickerSummary | null;
  /** Data-testid passe sur le wrapper pour les tests e2e. */
  testId?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatKickoff(iso: string | null, tx: Dict): string {
  if (!iso) return tx.notPlanned;
  try {
    const d = new Date(iso);
    const date = d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
    });
    const time = d.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    });
    return `${date} ${time}`;
  } catch {
    return tx.notPlanned;
  }
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function formatSelected(
  id: string,
  summary: MatchPickerSummary | null | undefined,
  tx: Dict
): string {
  if (!summary) return `Match #${shortId(id)}`;
  const teamA = summary.teamAName ?? '?';
  const teamB = summary.teamBName ?? '?';
  const tour = summary.tournamentName ? ` — ${summary.tournamentName}` : '';
  return `${teamA} vs ${teamB}${tour} — ${formatKickoff(summary.kickoffAt, tx)}`;
}

export default function MatchPicker({
  value,
  onChange,
  disabled,
  placeholder,
  initialSummary,
  testId,
}: Props) {
  const t = useAdminT(nsAdminDirectorMatchPicker);
  const { adminFetchJson } = useAdminFetch();

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<MatchSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Resume du match selectionne (pour affichage). Mis a jour quand l'user
  // clique un resultat ou collle un UUID valide. Reste null au mount si
  // value est set sans initialSummary -> fallback "Match #<id>".
  const [selectedSummary, setSelectedSummary] =
    useState<MatchPickerSummary | null>(initialSummary ?? null);

  const debouncedQuery = useDebounce(query, 200);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Si value devient null externe, on reset le resume aussi.
  useEffect(() => {
    if (!value) {
      setSelectedSummary(null);
    } else if (initialSummary) {
      setSelectedSummary(initialSummary);
    }
  }, [value, initialSummary]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (containerRef.current && !containerRef.current.contains(t)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Search effect — fire on every debounced query change while focused/open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function run() {
      setLoading(true);
      setFetchError(null);
      try {
        const params = new URLSearchParams();
        if (debouncedQuery.trim().length > 0) {
          params.set('q', debouncedQuery.trim());
        }
        params.set('upcoming', 'true');
        params.set('limit', '20');
        const json = await adminFetchJson<{ matches: MatchSearchResult[] }>(
          `/api/admin/matches/search?${params.toString()}`
        );
        if (cancelled) return;
        setResults(json.matches ?? []);
      } catch (err) {
        if (cancelled) return;
        logger.error('MatchPicker search error', err);
        setFetchError((err as Error)?.message || t.searchError);
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, open, adminFetchJson, t]);

  const handleSelect = useCallback(
    (m: MatchSearchResult) => {
      const summary: MatchPickerSummary = {
        kickoffAt: m.kickoffAt,
        tournamentName: m.tournamentName,
        teamAName: m.teamAName,
        teamBName: m.teamBName,
      };
      setSelectedSummary(summary);
      setQuery('');
      setOpen(false);
      onChange(m.id, summary);
      // Defocus to avoid keeping cursor on a hidden input.
      inputRef.current?.blur();
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    setSelectedSummary(null);
    setQuery('');
    setResults([]);
    setOpen(false);
    onChange(null);
  }, [onChange]);

  const handleKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        inputRef.current?.blur();
        return;
      }
      if (e.key === 'Enter') {
        // Si on a un UUID valide tape directement, on l'accepte comme
        // fallback (utile pour les power-users / e2e qui pasteraient un
        // UUID dans le champ). On ne peut pas resoudre le summary, donc
        // on garde le fallback "Match #<short_id>".
        const trimmed = query.trim();
        if (results.length > 0) {
          e.preventDefault();
          handleSelect(results[0]);
          return;
        }
        if (UUID_RE.test(trimmed)) {
          e.preventDefault();
          setSelectedSummary(null);
          setQuery('');
          setOpen(false);
          onChange(trimmed);
          inputRef.current?.blur();
        }
      }
    },
    [query, results, handleSelect, onChange]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setQuery(next);
      setOpen(true);
      // Auto-resolve si l'user colle un UUID valide.
      const trimmed = next.trim();
      if (UUID_RE.test(trimmed) && trimmed !== value) {
        // On set la value sans summary (pas de fetch dedie). Le summary
        // restera null -> fallback "Match #<short_id>".
        setSelectedSummary(null);
        onChange(trimmed);
      }
    },
    [onChange, value]
  );

  const displayValue = useMemo(() => {
    if (open) return query;
    if (value) return formatSelected(value, selectedSummary, t);
    return '';
  }, [open, query, value, selectedSummary, t]);

  return (
    <div
      ref={containerRef}
      className="relative"
      data-testid={testId ?? 'match-picker'}
    >
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => {
            // Quand on (re)focus, on bascule en mode "edit" : on vide le
            // displayValue (qui re-render via `open=true`) pour que la
            // recherche reparte from scratch. La selection est conservee
            // tant qu'on ne valide pas autre chose.
            setQuery('');
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={
            placeholder ?? (value ? t.selectedChange : t.searchPlaceholder)
          }
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls="match-picker-listbox"
          role="combobox"
          data-testid="match-picker-input"
          className="w-full px-3 py-2.5 pr-9 rounded-lg bg-neutral-900/80 border border-neutral-700 text-white placeholder:text-neutral-500 text-sm focus:outline-none focus:border-purple-500 disabled:opacity-50"
        />
        {value && !disabled && (
          <button
            type="button"
            onClick={handleClear}
            aria-label={t.clearAria}
            data-testid="match-picker-clear"
            className="absolute right-2 top-1/2 -translate-y-1/2 px-1.5 py-0.5 text-neutral-400 hover:text-red-300 text-base leading-none"
          >
            ×
          </button>
        )}
      </div>

      {open && (
        <div
          id="match-picker-listbox"
          role="listbox"
          data-testid="match-picker-listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-60 overflow-y-auto rounded-lg bg-neutral-900 border border-neutral-700 shadow-xl"
        >
          {loading && (
            <div className="px-3 py-2 text-xs text-neutral-400">
              {t.searching}
            </div>
          )}
          {!loading && fetchError && (
            <div className="px-3 py-2 text-xs text-red-300">{fetchError}</div>
          )}
          {!loading && !fetchError && results.length === 0 && (
            <div
              className="px-3 py-2 text-xs text-neutral-500"
              data-testid="match-picker-empty"
            >
              {t.noMatch}
            </div>
          )}
          {!loading &&
            !fetchError &&
            results.map((m) => (
              <button
                key={m.id}
                type="button"
                role="option"
                aria-selected={value === m.id}
                onClick={() => handleSelect(m)}
                data-testid={`match-picker-option-${m.id}`}
                className="block w-full text-left px-3 py-2 text-xs text-neutral-200 hover:bg-neutral-800 border-b border-neutral-800 last:border-b-0"
              >
                <div className="font-medium">
                  {m.teamAName ?? '?'} vs {m.teamBName ?? '?'}
                </div>
                <div className="text-neutral-400 text-[11px]">
                  {m.tournamentName ?? t.noTournament} ·{' '}
                  {formatKickoff(m.kickoffAt, t)}
                  {m.status ? ` · ${m.status}` : ''}
                </div>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
