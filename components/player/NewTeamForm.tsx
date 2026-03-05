type TeamMember = {
  email: string;
  battleTag: string;
  displayName: string;
};

type Props = {
  teamName: string;
  onTeamNameChange: (value: string) => void;
  members: TeamMember[];
  onAddMember: () => void;
  onUpdateMember: (index: number, field: keyof TeamMember, value: string) => void;
  onRemoveMember: (index: number) => void;
};

export default function NewTeamForm({
  teamName,
  onTeamNameChange,
  members,
  onAddMember,
  onUpdateMember,
  onRemoveMember,
}: Props) {
  return (
    <>
      <div>
        <label
          htmlFor="teamName"
          className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2"
        >
          Nom de l&apos;equipe *
        </label>
        <input
          id="teamName"
          type="text"
          value={teamName}
          onChange={(e) => onTeamNameChange(e.target.value)}
          className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 transition"
          placeholder="Ex: Les Licornes de l'Espace"
          maxLength={100}
        />
      </div>

      {/* Membres */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium tracking-[0.12em] uppercase text-gray-300">
            Joueuses (optionnel)
          </label>
          <span className="text-xs text-gray-500">{members.length}/5</span>
        </div>

        <p className="text-xs text-gray-500 mb-3">
          Ajoute les joueuses de ton equipe. Elles recevront une invitation.
        </p>

        <div className="space-y-3">
          {members.map((member, index) => (
            <div
              key={index}
              className="rounded-xl border border-white/10 bg-black/40 p-3"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">
                  Joueuse {index + 1}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveMember(index)}
                  className="text-xs text-red-400 hover:text-red-300"
                >
                  Retirer
                </button>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <input
                  type="email"
                  placeholder="Email *"
                  value={member.email}
                  onChange={(e) =>
                    onUpdateMember(index, 'email', e.target.value)
                  }
                  className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-400/60"
                />
                <input
                  type="text"
                  placeholder="BattleTag"
                  value={member.battleTag}
                  onChange={(e) =>
                    onUpdateMember(index, 'battleTag', e.target.value)
                  }
                  className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-400/60"
                />
                <input
                  type="text"
                  placeholder="Pseudo"
                  value={member.displayName}
                  onChange={(e) =>
                    onUpdateMember(index, 'displayName', e.target.value)
                  }
                  className="rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-1 focus:ring-purple-400/60"
                />
              </div>
            </div>
          ))}

          {members.length < 5 && (
            <button
              type="button"
              onClick={onAddMember}
              className="w-full px-4 py-3 rounded-xl border border-dashed border-white/20 text-sm text-gray-400 hover:border-purple-400/50 hover:text-purple-300 transition"
            >
              + Ajouter une joueuse
            </button>
          )}
        </div>
      </div>
    </>
  );
}
