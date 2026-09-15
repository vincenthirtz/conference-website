// components/organisateurs/RulebookTemplate.tsx
//
// Le règlement type du guide « tournoi féminin ou mixte », lisible ET copiable.
//
// UNE SEULE SOURCE POUR LES DEUX. Le texte affiché et le texte copié sont
// composés des mêmes clés i18n : copier ne peut pas donner autre chose que ce
// qu'on lit, et la version anglaise se copie en anglais.
//
// La copie passe par `navigator.clipboard` ; sans lui (contexte non sécurisé,
// navigateur ancien), on le dit plutôt que de laisser croire que c'est fait.

import { useCallback, useState } from 'react';
import type { JSX } from 'react';
import { useT } from '@/lib/i18n/useT';
import nsOrganiserFemininPage from '@/lib/i18n/locales/fr/organiserFemininPage';

type Dict = typeof nsOrganiserFemininPage.fr;

export function rulebookClauses(t: Dict): Array<[string, string]> {
  return [
    [t.clause1Title, t.clause1Body],
    [t.clause2Title, t.clause2Body],
    [t.clause3Title, t.clause3Body],
    [t.clause4Title, t.clause4Body],
    [t.clause5Title, t.clause5Body],
    [t.clause6Title, t.clause6Body],
    [t.clause7Title, t.clause7Body],
    [t.clause8Title, t.clause8Body],
    [t.clause9Title, t.clause9Body],
    [t.clause10Title, t.clause10Body],
  ];
}

/** Le règlement en texte brut, tel qu'il part dans le presse-papiers. */
export function rulebookPlainText(t: Dict): string {
  return [
    t.templateHeading,
    ...rulebookClauses(t).map(([title, body]) => `${title}\n${body}`),
  ].join('\n\n');
}

export default function RulebookTemplate({
  className,
}: {
  className?: string;
}): JSX.Element {
  const t = useT(nsOrganiserFemininPage);
  const [status, setStatus] = useState<'idle' | 'copied' | 'error'>('idle');

  const copy = useCallback(async () => {
    try {
      if (!navigator.clipboard) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(rulebookPlainText(t));
      setStatus('copied');
    } catch {
      setStatus('error');
    }
  }, [t]);

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6 ${className ?? ''}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-white">{t.templateHeading}</p>
        <button
          type="button"
          onClick={() => void copy()}
          className="min-h-11 rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
        >
          {t.templateCopy}
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className="mt-2 text-xs text-gray-400"
      >
        {status === 'copied'
          ? t.templateCopied
          : status === 'error'
            ? t.templateCopyError
            : ''}
      </p>
      <ol className="mt-4 grid gap-4 md:grid-cols-2">
        {rulebookClauses(t).map(([title, body]) => (
          <li key={title}>
            <h3 className="text-sm font-semibold text-white">{title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-300">{body}</p>
          </li>
        ))}
      </ol>
    </div>
  );
}
