// components/admin/tcg/TcgPlayerPicker.tsx
//
// Choisir le compte d'une joueuse, pour la carte « Ajuster un solde ».
//
// POURQUOI UN NOUVEAU SÉLECTEUR. Le dépôt n'en a pas de réutilisable : la seule
// recherche de comptes (`pages/admin/teams/[teamId]/edit.tsx`) est câblée dans
// la page, avec l'état du formulaire d'équipe. `MatchPicker` et `TeamPicker`
// cherchent d'autres entités. Ce composant reprend la route existante
// (`GET /api/admin/users/search`) et le motif ARIA de `MatchPicker`, sans rien
// y ajouter côté serveur.
//
// L'IDENTIFIANT COLLÉ EST UNE VOIE À PART ENTIÈRE, PAS UN BRICOLAGE. La
// recherche est gardée par `manage_staff` au niveau plateforme : un staff qui
// peut corriger un solde ne peut pas forcément chercher un compte. Plutôt que
// de lui présenter un champ mort, on lui dit pourquoi et on accepte l'uuid —
// celui qu'on lit dans l'adresse de la fiche joueuse. L'endpoint d'ajustement
// reste juge : un compte hors de l'espace revient en `USER_NOT_FOUND`.
//
// UNE RÉPONSE PÉRIMÉE NE DOIT PAS ÉCRASER LA DERNIÈRE. Chaque frappe annule la
// requête précédente : sans cela, « ma » puis « marie » peut afficher les
// résultats de « ma » s'ils arrivent en second — et faire corriger le solde de
// la mauvaise personne.

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useDebounce } from '@/hooks/useDebounce';
import { format } from '@/lib/i18n/useAdminT';
import type nsAdminTcgGrant from '@/lib/i18n/locales/admin-fr/adminTcgGrant';
import { adminUserLabel, isUuid, shortUserId } from './tcgGrantForm';

type Labels = typeof nsAdminTcgGrant.fr;

export type PickedUser = {
  id: string;
  displayName: string | null;
  battleTag: string | null;
  email: string | null;
  teamName: string | null;
};

/** Forme rendue par `/api/admin/users/search` (snake_case côté route). */
type SearchRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  battle_tag: string | null;
  team_name: string | null;
};

type SearchStatus = 'idle' | 'loading' | 'done' | 'error' | 'forbidden';

const MIN_CHARS = 2;

function toPicked(row: SearchRow): PickedUser {
  return {
    id: row.id,
    displayName: row.display_name ?? null,
    battleTag: row.battle_tag ?? null,
    email: row.email ?? null,
    teamName: row.team_name ?? null,
  };
}

type Props = {
  labels: Labels;
  value: PickedUser | null;
  onChange: (user: PickedUser | null) => void;
  /** Id posé sur le champ, pour que la carte y ramène le focus en erreur. */
  inputId: string;
  /** Id du message d'erreur de la carte, relié par `aria-describedby`. */
  errorId?: string;
  invalid?: boolean;
};

export default function TcgPlayerPicker({
  labels,
  value,
  onChange,
  inputId,
  errorId,
  invalid = false,
}: Props) {
  const { adminFetch } = useAdminFetch();
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;
  const hintId = `${baseId}-hint`;
  const statusId = `${baseId}-status`;

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<PickedUser[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [activeIndex, setActiveIndex] = useState(0);

  const debouncedQuery = useDebounce(query.trim(), 250);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeButtonRef = useRef<HTMLButtonElement>(null);
  // Où doit aller le focus au prochain rendu : le champ remplace le bouton
  // « Changer » et inversement, donc l'élément focalisé disparaît à chaque
  // bascule. Sans ce relais, le focus retombe sur `<body>` et le clavier perd
  // sa place dans le formulaire.
  const focusNextRef = useRef<'input' | 'change' | null>(null);
  // Un 403 sur la recherche vaut pour toute la session : on cesse d'interroger
  // la route à chaque frappe. Une ref et non l'état, pour ne pas relancer
  // l'effet de recherche au moment où l'on apprend le refus.
  const forbiddenRef = useRef(false);

  useEffect(() => {
    if (focusNextRef.current === 'input') inputRef.current?.focus();
    if (focusNextRef.current === 'change') changeButtonRef.current?.focus();
    focusNextRef.current = null;
  });

  // Recherche. Un uuid collé ne part pas au serveur : la route cherche par
  // pseudo et email, elle ne trouverait rien, et l'option « utiliser
  // l'identifiant » suffit.
  useEffect(() => {
    if (forbiddenRef.current) return;
    if (debouncedQuery.length < MIN_CHARS || isUuid(debouncedQuery)) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const controller = new AbortController();
    setStatus('loading');
    void (async () => {
      try {
        const res = await adminFetch(
          `/api/admin/users/search?q=${encodeURIComponent(debouncedQuery)}`,
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return;
        if (res.status === 403) {
          forbiddenRef.current = true;
          setResults([]);
          setStatus('forbidden');
          return;
        }
        if (!res.ok) {
          setResults([]);
          setStatus('error');
          return;
        }
        const json = (await res.json()) as { players?: SearchRow[] };
        if (controller.signal.aborted) return;
        setResults((json.players ?? []).map(toPicked));
        setActiveIndex(0);
        setStatus('done');
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setResults([]);
        setStatus('error');
      }
    })();
    return () => controller.abort();
  }, [debouncedQuery, adminFetch]);

  // Fermer au clic extérieur.
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const trimmed = query.trim();
  const typedId = isUuid(trimmed) ? trimmed.toLowerCase() : null;
  // L'option « identifiant collé » passe en tête : c'est ce qu'on vient de
  // coller, donc ce qu'on veut, et Entrée doit la prendre.
  const options: PickedUser[] = [
    ...(typedId && !results.some((r) => r.id === typedId)
      ? [
          {
            id: typedId,
            displayName: null,
            battleTag: null,
            email: null,
            teamName: null,
          },
        ]
      : []),
    ...results,
  ];
  const safeIndex = Math.min(activeIndex, Math.max(options.length - 1, 0));
  const showList = open && options.length > 0;

  const select = useCallback(
    (user: PickedUser) => {
      focusNextRef.current = 'change';
      setQuery('');
      setResults([]);
      setOpen(false);
      onChange(user);
    },
    [onChange]
  );

  const clear = () => {
    focusNextRef.current = 'input';
    onChange(null);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) => (options.length ? (i + 1) % options.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((i) =>
        options.length ? (i - 1 + options.length) % options.length : 0
      );
    } else if (event.key === 'Enter') {
      // Entrée ne soumet JAMAIS le formulaire depuis ce champ : un choix de
      // compte à moitié fait ne doit pas déclencher la validation d'un
      // ajustement de solde.
      event.preventDefault();
      const option = options[safeIndex];
      if (option) select(option);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  // Compte choisi : on montre QUI, avec l'identifiant pour lever l'homonymie.
  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-white">
            {adminUserLabel(value)}
          </p>
          <p className="truncate text-[11px] text-gray-500">
            {format(labels.selectedId, { id: value.id })}
            {value.teamName
              ? ` · ${format(labels.resultTeam, { team: value.teamName })}`
              : ''}
          </p>
        </div>
        <button
          ref={changeButtonRef}
          type="button"
          onClick={clear}
          className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/40 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
        >
          {labels.changePlayer}
        </button>
      </div>
    );
  }

  const statusText =
    status === 'forbidden'
      ? labels.searchForbidden
      : trimmed.length > 0 && trimmed.length < MIN_CHARS
        ? labels.searchMinChars
        : status === 'loading'
          ? labels.searching
          : status === 'error'
            ? labels.searchError
            : status === 'done' && !typedId
              ? results.length === 0
                ? labels.searchNoResult
                : format(labels.resultsCount, { count: results.length })
              : '';

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        autoComplete="off"
        spellCheck={false}
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={
          showList ? `${listboxId}-opt-${safeIndex}` : undefined
        }
        aria-invalid={invalid || undefined}
        aria-describedby={[hintId, statusId, invalid ? errorId : null]
          .filter(Boolean)
          .join(' ')}
        value={query}
        placeholder={labels.searchPlaceholder}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveIndex(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 ${
          invalid ? 'border-red-500/60' : 'border-white/10'
        }`}
      />
      <p id={hintId} className="mt-1 text-[11px] text-gray-500">
        {labels.playerHint}
      </p>
      {/* Toujours présent dans le DOM : une région live créée au moment où
          elle se remplit n'est pas annoncée par tous les lecteurs d'écran. */}
      <p
        id={statusId}
        role="status"
        aria-live="polite"
        className={`mt-1 text-[11px] ${
          status === 'error' || status === 'forbidden'
            ? 'text-amber-300'
            : 'text-gray-400'
        }`}
      >
        {statusText}
      </p>

      {showList && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={labels.resultsLabel}
          className="absolute left-0 right-0 top-11 z-20 max-h-64 overflow-y-auto rounded-lg border border-white/10 bg-neutral-900 py-1 shadow-xl"
        >
          {options.map((option, index) => {
            const isTyped = option.id === typedId && index === 0;
            const active = index === safeIndex;
            return (
              <li
                key={`${isTyped ? 'typed' : 'row'}:${option.id}`}
                id={`${listboxId}-opt-${index}`}
                role="option"
                aria-selected={active}
                // `mousedown` et non `click` : le clic ferait d'abord perdre le
                // focus au champ, et la fermeture au clic extérieur passerait
                // avant la sélection.
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(option);
                }}
                onMouseEnter={() => setActiveIndex(index)}
                className={`cursor-pointer px-3 py-2 text-sm ${
                  active ? 'bg-white/10 text-white' : 'text-gray-300'
                }`}
              >
                {isTyped ? (
                  format(labels.useTypedId, { id: shortUserId(option.id) })
                ) : (
                  <>
                    <span className="block truncate">
                      {adminUserLabel(option)}
                    </span>
                    <span className="block truncate text-[11px] text-gray-500">
                      {[
                        option.email,
                        option.teamName
                          ? format(labels.resultTeam, { team: option.teamName })
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
