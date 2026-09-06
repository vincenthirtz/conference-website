// components/admin/matches/MatchGamesPanel.tsx
//
// Panneau « parties (maps) » de l'écran d'arbitrage d'un match.
//
// Extrait de pages/admin/matches/[matchId]/edit.tsx : la règle du lot A7 veut
// que tout lot touchant un god-component en sorte au moins un panneau, et
// c'est ici que vient de se brancher la saisie assistée des cartes.
//
// Le champ carte propose le pool effectif du match (cartes du tournoi, sinon
// pool du tenant, sinon catalogue du jeu) via une liste de suggestions, et non
// un <select> : une partie peut se jouer sur une arène hors pool, la saisie
// doit rester libre. C'est le serveur qui ramène ensuite l'orthographe à celle
// du pool (cf. utils/maps/pool.ts).

import { format } from '@/lib/i18n/useAdminT';

export type MatchGameInput = {
  map_name: string;
  map_order: number;
  team1_score: number;
  team2_score: number;
  is_tiebreaker: boolean;
  went_overtime: boolean;
};

type TeamMini = { name?: string | null; short_name?: string | null } | null;

type Props = {
  games: MatchGameInput[];
  setGames: React.Dispatch<React.SetStateAction<MatchGameInput[]>>;
  /** Noms des cartes proposées en suggestion. Vide = saisie libre seule. */
  mapPool: string[];
  team1: TeamMini;
  team2: TeamMini;
  t: Record<string, string>;
};

export default function MatchGamesPanel({
  games,
  setGames,
  mapPool,
  team1,
  team2,
  t,
}: Props) {
  return (
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">
            {format(t.mapsHeading, { count: games.length })}
          </h2>
          <button
            type="button"
            onClick={() =>
              setGames((prev) => [
                ...prev,
                {
                  map_name: '',
                  map_order: prev.length,
                  team1_score: 0,
                  team2_score: 0,
                  is_tiebreaker: false,
                  went_overtime: false,
                },
              ])
            }
            className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-xs font-medium transition-colors"
          >
            {t.addMap}
          </button>
        </div>

        {mapPool.length > 0 && (
          <datalist id="map-pool-options">
            {mapPool.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        )}

        {games.length === 0 && (
          <p className="text-sm text-neutral-500">{t.mapsEmpty}</p>
        )}

        <div className="space-y-3">
          {games.map((g, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-lg bg-neutral-900/50 border border-neutral-700"
            >
              <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-xs text-neutral-400 mb-1">
                    {t.mapLabel}
                  </label>
                  {/* Liste de suggestions plutôt que <select> : une
                      partie peut se jouer sur une arène hors pool,
                      la saisie doit rester libre. Le serveur ramène
                      ensuite l'orthographe à celle du pool. */}
                  <input
                    type="text"
                    list={mapPool.length > 0 ? 'map-pool-options' : undefined}
                    className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={g.map_name}
                    onChange={(e) => {
                      const updated = [...games];
                      updated[idx] = {
                        ...updated[idx],
                        map_name: e.target.value,
                      };
                      setGames(updated);
                    }}
                    placeholder={
                      mapPool[0]
                        ? format(t.mapNameSuggestPlaceholder, { example: mapPool[0] })
                        : t.mapNamePlaceholder
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {team1?.short_name ||
                      team1?.name ||
                      t.teamShort1Fallback}
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={g.team1_score}
                    onChange={(e) => {
                      const updated = [...games];
                      updated[idx] = {
                        ...updated[idx],
                        team1_score: Number(e.target.value) || 0,
                      };
                      setGames(updated);
                    }}
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-400 mb-1">
                    {team2?.short_name ||
                      team2?.name ||
                      t.teamShort2Fallback}
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={g.team2_score}
                    onChange={(e) => {
                      const updated = [...games];
                      updated[idx] = {
                        ...updated[idx],
                        team2_score: Number(e.target.value) || 0,
                      };
                      setGames(updated);
                    }}
                  />
                </div>
              </div>

              <div className="flex flex-col items-center gap-2 pt-5">
                <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={g.went_overtime}
                    onChange={(e) => {
                      const updated = [...games];
                      updated[idx] = {
                        ...updated[idx],
                        went_overtime: e.target.checked,
                      };
                      setGames(updated);
                    }}
                    className="rounded border-neutral-600 bg-neutral-700"
                  />
                  {t.ot}
                </label>
                <label className="flex items-center gap-1.5 text-xs text-neutral-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={g.is_tiebreaker}
                    onChange={(e) => {
                      const updated = [...games];
                      updated[idx] = {
                        ...updated[idx],
                        is_tiebreaker: e.target.checked,
                      };
                      setGames(updated);
                    }}
                    className="rounded border-neutral-600 bg-neutral-700"
                  />
                  {t.tb}
                </label>
              </div>

              <button
                type="button"
                onClick={() =>
                  setGames((prev) => prev.filter((_, i) => i !== idx))
                }
                className="mt-5 p-1.5 rounded hover:bg-red-900/50 text-neutral-500 hover:text-red-400 transition-colors"
                title={t.deleteMapTitle}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </section>
  );
}
