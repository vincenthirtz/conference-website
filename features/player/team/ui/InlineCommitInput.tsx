// features/player/team/ui/InlineCommitInput.tsx — champ de ligne enregistré
// au blur ou à Entrée (BattleTag, SR, identité de l'équipe).
//
// NON contrôlé : la saisie vit dans le DOM, pas dans un `useState` de champ.
// `serverValue` est la valeur retenue par le serveur ; quand elle change
// (rechargement après enregistrement), le champ repart d'elle. `onCommit`
// répond `reset` (rien de neuf, ou enregistré : afficher la valeur serveur)
// ou `kept` (refusé : la saisie reste pour être corrigée).

import type { InputHTMLAttributes } from 'react';
import type { CommitResult } from '../hooks/useManageTeamScreen';

type Props = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onBlur' | 'onKeyDown' | 'onChange'
> & {
  serverValue: string;
  onCommit: (raw: string) => Promise<CommitResult>;
};

export default function InlineCommitInput({
  serverValue,
  onCommit,
  ...rest
}: Props) {
  return (
    <input
      // Remonté quand la valeur serveur change : la saisie retombe dessus.
      key={serverValue}
      defaultValue={serverValue}
      {...rest}
      onBlur={async (e) => {
        const input = e.currentTarget;
        const result = await onCommit(input.value);
        if (result === 'reset') input.value = serverValue;
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
