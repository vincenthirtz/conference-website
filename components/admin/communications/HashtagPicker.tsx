// components/admin/communications/HashtagPicker.tsx
//
// Choix des hashtags d'une destination : on tape, on cherche, on ajoute.
//
// POURQUOI UN CHAMP DE RECHERCHE plutôt qu'une zone de texte libre. Les tags
// d'une association sont toujours les mêmes une fois trouvés — mais retapés à
// la main ils dérivent (`#OWWomensCup`, `#owwomenscup`, `#OW_WomensCup`), et
// trois orthographes d'un même tag, ce sont trois audiences séparées dont
// aucune n'atteint la bonne taille. Le champ propose donc CE QUI A DÉJÀ SERVI
// (`knownHashtags`, lu depuis l'historique) et normalise ce qui est saisi.
//
// La liste des suggestions n'est jamais figée dans le code : un tag employé une
// fois devient une suggestion pour les suivantes.

import { useMemo, useRef, useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';
import {
  MAX_HASHTAGS,
  normalizeHashtag,
  parseHashtagInput,
} from '@/utils/social/hashtags';

export type HashtagPickerLabels = {
  label: string;
  placeholder: string;
  help: string;
  remove: string;
  add: string;
  noMatch: string;
  full: string;
};

export default function HashtagPicker({
  value,
  suggestions,
  labels,
  onChange,
}: {
  value: string[];
  suggestions: string[];
  labels: HashtagPickerLabels;
  onChange: (next: string[]) => void;
}): JSX.Element {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const full = value.length >= MAX_HASHTAGS;

  const matches = useMemo(() => {
    const needle = normalizeHashtag(query) ?? '';
    const chosen = new Set(value);
    return suggestions
      .filter((tag) => !chosen.has(tag))
      .filter((tag) => (needle ? tag.includes(needle) : true))
      .slice(0, 8);
  }, [query, suggestions, value]);

  // Le tag tapé n'existe pas encore dans l'historique : on propose quand même
  // de l'ajouter, sinon le premier usage d'un tag serait impossible.
  const typed = normalizeHashtag(query);
  const isNew = Boolean(typed && !value.includes(typed) && !matches.includes(typed));

  function add(tags: string[]): void {
    const next = [...value];
    for (const tag of tags) {
      if (next.length >= MAX_HASHTAGS) break;
      if (!next.includes(tag)) next.push(tag);
    }
    onChange(next);
    setQuery('');
    inputRef.current?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    // Entrée et virgule valident : les deux gestes que tout le monde tente sur
    // un champ de tags.
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const parsed = parseHashtagInput(query);
      if (parsed.length > 0) add(parsed);
      return;
    }
    // Retour arrière sur un champ vide retire le dernier tag — sinon il faut
    // viser une croix de 12 pixels pour corriger une faute de frappe.
    if (e.key === 'Backspace' && query === '' && value.length > 0) {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs uppercase tracking-wide text-neutral-400">
        {labels.label}
      </span>

      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li key={tag}>
              <span className="inline-flex items-center gap-1 rounded-full border border-purple-500/40 bg-purple-500/10 py-1 pl-2.5 pr-1 text-xs text-purple-200">
                #{tag}
                <button
                  type="button"
                  onClick={() => onChange(value.filter((x) => x !== tag))}
                  aria-label={`${labels.remove} #${tag}`}
                  className="rounded-full px-1 text-purple-300 hover:bg-purple-500/20 hover:text-white"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="text"
        value={query}
        disabled={full}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={full ? labels.full : labels.placeholder}
        aria-label={labels.label}
        className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 disabled:opacity-50"
      />

      {!full && (query || matches.length > 0) ? (
        <div className="flex flex-wrap gap-1.5">
          {isNew && typed ? (
            <button
              type="button"
              onClick={() => add([typed])}
              className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-200 hover:bg-emerald-500/20"
            >
              {labels.add} #{typed}
            </button>
          ) : null}
          {matches.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => add([tag])}
              className="rounded-full border border-neutral-700 bg-neutral-900 px-2.5 py-1 text-xs text-neutral-300 hover:border-purple-500/50 hover:text-white"
            >
              #{tag}
            </button>
          ))}
          {!isNew && matches.length === 0 ? (
            <span className="text-xs text-neutral-500">{labels.noMatch}</span>
          ) : null}
        </div>
      ) : null}

      <span className="block text-xs text-neutral-500">{labels.help}</span>
    </div>
  );
}
