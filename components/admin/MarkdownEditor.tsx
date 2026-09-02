// components/admin/MarkdownEditor.tsx
//
// Zone de saisie Markdown : barre d'outils, raccourcis clavier, aperçu.
//
// POURQUOI PAS UN VRAI WYSIWYG. Un éditeur WYSIWYG produit du HTML, et aucune
// des destinations du composeur n'en veut : une légende Instagram est du texte
// brut, Discord a son propre Markdown, et la page d'actualité rend du Markdown
// sans HTML brut (volontairement — ces actualités peuvent arriver par le salon
// Discord, donc de n'importe qui). Un éditeur qui produirait des `<strong>`
// afficherait ses balises sur les trois surfaces.
//
// POURQUOI PAS UNE BIBLIOTHÈQUE. Le besoin tient en six boutons et un aperçu,
// et le rendu Markdown est déjà dans le projet pour la page publique. Une
// dépendance d'éditeur apporterait son propre moteur, sa feuille de style et
// ses conventions de thème — pour un panneau admin où l'on écrit trois
// paragraphes.
//
// L'aperçu est celui du SITE. Les autres destinations n'affichent pas la même
// chose (cf. `utils/social/markdown.ts`) : c'est l'aperçu par cible du
// composeur, en dessous, qui montre ce qui part vraiment ailleurs.

import { useCallback, useId, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Props = {
  value: string;
  onChange: (next: string) => void;
  rows?: number;
  placeholder?: string;
  ariaLabel?: string;
  /** Libellés — le composant ne connaît pas le namespace i18n de l'appelant. */
  labels: {
    bold: string;
    italic: string;
    heading: string;
    list: string;
    quote: string;
    link: string;
    preview: string;
    write: string;
    previewEmpty: string;
  };
};

/** Une action de barre d'outils : ce qu'on pose autour (ou devant) la sélection. */
type Wrap = { before: string; after?: string; block?: boolean; sample: string };

export default function MarkdownEditor({
  value,
  onChange,
  rows = 6,
  placeholder,
  ariaLabel,
  labels,
}: Props) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const id = useId();

  /**
   * Applique une action à la sélection courante.
   *
   * Deux détails qui font la différence entre « ça marche » et « c'est
   * pénible » : on rend le focus au champ, et on repositionne le curseur —
   * autour du texte inséré quand il n'y avait pas de sélection, après le texte
   * enveloppé sinon. Sans ça, chaque clic de barre d'outils oblige à retrouver
   * sa place à la souris.
   */
  const apply = useCallback(
    (wrap: Wrap) => {
      const el = ref.current;
      if (!el) return;

      const start = el.selectionStart;
      const end = el.selectionEnd;
      const selected = value.slice(start, end);
      const body = selected || wrap.sample;

      let insertStart = start;
      let inserted: string;

      if (wrap.block) {
        // Une action de bloc (titre, liste, citation) s'applique en tête de
        // ligne, pas au milieu d'un mot.
        const lineStart = value.lastIndexOf('\n', start - 1) + 1;
        insertStart = lineStart;
        const lineEnd = end;
        const lines = (value.slice(lineStart, lineEnd) || wrap.sample).split('\n');
        inserted = lines.map((l) => `${wrap.before}${l}`).join('\n');
        const next =
          value.slice(0, lineStart) + inserted + value.slice(lineEnd);
        onChange(next);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(
            lineStart + inserted.length,
            lineStart + inserted.length
          );
        });
        return;
      }

      inserted = `${wrap.before}${body}${wrap.after ?? wrap.before}`;
      const next = value.slice(0, start) + inserted + value.slice(end);
      onChange(next);

      requestAnimationFrame(() => {
        el.focus();
        if (selected) {
          const caret = insertStart + inserted.length;
          el.setSelectionRange(caret, caret);
        } else {
          // Rien n'était sélectionné : on sélectionne l'exemple inséré pour
          // qu'il suffise de taper par-dessus.
          const from = insertStart + wrap.before.length;
          el.setSelectionRange(from, from + body.length);
        }
      });
    },
    [onChange, value]
  );

  const actions: Array<{ key: string; label: string; wrap: Wrap; hint: string }> =
    [
      {
        key: 'bold',
        label: 'B',
        hint: `${labels.bold} (⌘B)`,
        wrap: { before: '**', sample: labels.bold },
      },
      {
        key: 'italic',
        label: 'I',
        hint: `${labels.italic} (⌘I)`,
        wrap: { before: '*', sample: labels.italic },
      },
      {
        key: 'heading',
        label: 'H',
        hint: labels.heading,
        wrap: { before: '## ', block: true, sample: labels.heading },
      },
      {
        key: 'list',
        label: '•',
        hint: labels.list,
        wrap: { before: '- ', block: true, sample: labels.list },
      },
      {
        key: 'quote',
        label: '❞',
        hint: labels.quote,
        wrap: { before: '> ', block: true, sample: labels.quote },
      },
      {
        key: 'link',
        label: '🔗',
        hint: `${labels.link} (⌘K)`,
        wrap: { before: '[', after: '](https://)', sample: labels.link },
      },
    ];

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!e.metaKey && !e.ctrlKey) return;
      const key = e.key.toLowerCase();
      const found = actions.find(
        (a) =>
          (key === 'b' && a.key === 'bold') ||
          (key === 'i' && a.key === 'italic') ||
          (key === 'k' && a.key === 'link')
      );
      if (!found) return;
      e.preventDefault();
      apply(found.wrap);
    },
    [actions, apply]
  );

  return (
    <div className="rounded-lg border border-neutral-700 bg-neutral-950 focus-within:border-purple-500">
      <div className="flex flex-wrap items-center gap-1 border-b border-neutral-800 px-2 py-1.5">
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => apply(a.wrap)}
            title={a.hint}
            aria-label={a.hint}
            disabled={showPreview}
            className="h-7 min-w-7 rounded px-2 text-sm font-semibold text-neutral-300 hover:bg-neutral-800 hover:text-white disabled:opacity-40"
          >
            {a.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowPreview((p) => !p)}
          aria-pressed={showPreview}
          className="ml-auto rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-white"
        >
          {showPreview ? labels.write : labels.preview}
        </button>
      </div>

      {showPreview ? (
        <div
          id={`${id}-preview`}
          className="min-h-32 space-y-3 px-3 py-2 text-sm text-neutral-200 [&_a]:text-purple-300 [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-600 [&_blockquote]:pl-3 [&_blockquote]:italic [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-bold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-bold [&_ul]:list-disc [&_ul]:pl-5"
        >
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <p className="text-neutral-600">{labels.previewEmpty}</p>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={rows}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="w-full resize-y bg-transparent px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:outline-none"
        />
      )}
    </div>
  );
}
