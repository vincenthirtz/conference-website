// components/player/ActiveTeamSwitcher.tsx
//
// Sélecteur d'équipe des écrans de gestion.
//
// Ne s'affiche QUE lorsqu'il y a un choix à faire (≥ 2 équipes gérées) : dans
// le cas courant — une seule équipe — l'écran reste exactement celui d'avant,
// sans contrôle en plus. C'est la contrepartie du repli serveur « sans
// `?teamId=`, la première équipe gérée » (utils/teams/teamScope.ts).
//
// Un `<select>` natif plutôt qu'un menu maison : il est labellisé, navigable au
// clavier et lisible par les lecteurs d'écran sans code à maintenir, et la
// liste tient en quelques entrées.

import { useId } from 'react';
import { useActiveTeam } from '@/components/player/ActiveTeamContext';
import { useT } from '@/lib/i18n/useT';
import nsActiveTeamSwitcher from '@/lib/i18n/locales/fr/activeTeamSwitcher';

export default function ActiveTeamSwitcher({
  className = '',
}: {
  className?: string;
}) {
  const t = useT(nsActiveTeamSwitcher);
  const { managedTeams, activeTeamId, hasMultipleTeams, setActiveTeamId } =
    useActiveTeam();
  const selectId = useId();
  const hintId = `${selectId}-hint`;

  if (!hasMultipleTeams) return null;

  // `activeTeamId` est nul tant que rien n'a été choisi : le serveur a alors
  // renvoyé sa première équipe gérée, qui est aussi la première de la liste.
  const value = activeTeamId ?? managedTeams[0]?.id ?? '';

  return (
    <div
      className={`rounded-xl border border-white/10 bg-white/[0.03] p-3 ${className}`}
    >
      <label
        htmlFor={selectId}
        className="block text-xs font-medium uppercase tracking-[0.12em] text-gray-300"
      >
        {t.label}
      </label>
      <select
        id={selectId}
        value={value}
        aria-describedby={hintId}
        onChange={(e) => setActiveTeamId(e.target.value || null)}
        className="mt-2 w-full rounded-lg border border-white/15 bg-black/60 px-3 py-2 text-sm text-white focus:border-purple-400/80 focus:outline-none focus:ring-2 focus:ring-purple-400/80"
      >
        {managedTeams.map((team) => (
          <option key={team.id} value={team.id}>
            {team.name}
            {team.isCaptain
              ? ` — ${t.captainBadge}`
              : team.isManager
                ? ` — ${t.managerBadge}`
                : ''}
          </option>
        ))}
      </select>
      <p id={hintId} className="mt-1.5 text-[11px] text-gray-400">
        {t.hint}
      </p>
    </div>
  );
}
