type Team = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type Props = {
  teams: Team[];
  teamsLoading: boolean;
  selectedTeamId: string;
  teamSearch: string;
  onTeamSearchChange: (value: string) => void;
  onSelectTeam: (id: string) => void;
};

export default function ExistingTeamSelector({
  teams,
  teamsLoading,
  selectedTeamId,
  teamSearch,
  onTeamSearchChange,
  onSelectTeam,
}: Props) {
  return (
    <div>
      <label className="block text-xs font-medium tracking-[0.12em] uppercase text-gray-300 mb-2">
        Rechercher une equipe
      </label>
      <input
        type="text"
        value={teamSearch}
        onChange={(e) => onTeamSearchChange(e.target.value)}
        className="w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-sm text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-purple-400/80 mb-3"
        placeholder="Rechercher par nom..."
      />

      <div className="max-h-60 overflow-y-auto space-y-2 rounded-xl border border-white/10 bg-black/40 p-2">
        {teamsLoading && (
          <div className="text-sm text-gray-500 text-center py-4">
            Chargement...
          </div>
        )}

        {!teamsLoading && teams.length === 0 && (
          <div className="text-sm text-gray-500 text-center py-4">
            Aucune equipe trouvee
          </div>
        )}

        {!teamsLoading &&
          teams.map((team) => (
            <button
              key={team.id}
              type="button"
              onClick={() => onSelectTeam(team.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition ${
                selectedTeamId === team.id
                  ? 'bg-purple-600/30 border border-purple-400/50'
                  : 'bg-white/5 border border-transparent hover:bg-white/10'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-black/60 border border-white/10 flex items-center justify-center overflow-hidden flex-shrink-0">
                {team.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={team.logo_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-gray-500">
                    {(team.short_name || team.name).slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white truncate">
                  {team.name}
                </div>
                {team.short_name && (
                  <div className="text-xs text-gray-400">{team.short_name}</div>
                )}
              </div>
              {selectedTeamId === team.id && (
                <svg
                  className="w-5 h-5 text-purple-400 flex-shrink-0"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
