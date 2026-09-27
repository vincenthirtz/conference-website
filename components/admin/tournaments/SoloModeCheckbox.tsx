// components/admin/tournaments/SoloModeCheckbox.tsx
//
// La case « inscription individuelle » d'un tournoi (`tournaments.solo_mode`).
//
// UNE CASE, DEUX CONSÉQUENCES, dont aucune ne se devine depuis le libellé :
// elle aiguille le parcours public vers le formulaire solo, et elle fait taire
// le provisionnement Discord (sinon un rôle et deux salons par inscrite). D'où
// l'aide, obligatoire et non optionnelle : une case cochée sans savoir ce
// qu'elle déclenche ne se répare qu'après coup, sur le serveur Discord.
//
// Le libellé et l'aide arrivent en props : l'écran de création et celui
// d'édition ont chacun leur namespace de traduction, et faire choisir le
// composant entre les deux le rendrait dépendant de qui l'appelle.

import type { JSX } from 'react';

type Props = {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  help: string;
  /** Classes du conteneur, pour s'insérer dans la grille de l'écran hôte. */
  className?: string;
};

export default function SoloModeCheckbox({
  checked,
  onChange,
  label,
  help,
  className = 'mt-1',
}: Props): JSX.Element {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border border-neutral-700/60 bg-neutral-900/40 p-3 text-sm cursor-pointer ${className}`}
    >
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-neutral-600 bg-neutral-900"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="font-medium">{label}</span>
        <span className="mt-1 block text-xs text-neutral-400">{help}</span>
      </span>
    </label>
  );
}
