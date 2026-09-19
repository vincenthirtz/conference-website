// components/admin/matches/MatchGamePickBans.tsx
//
// Sous-ligne d'une partie dans MatchGamesPanel : qui a choisi la map, et les
// bans de héros dans leur ordre. Stockés sur la partie elle-même
// (`games.picked_by_team_id`, `games.hero_bans`) et validés par l'API.
//
// Des <select> et pas de la saisie libre : le staff relevait les bans en
// abrégé (« misuki », « T Posi' ») et les stats publiques ont besoin d'une clé
// stable. Un héros déjà banni sur la map n'est plus proposé — l'API le
// refuserait de toute façon.
//
// Aucune image de héros : le nom suffit (doctrine « le héros est un nom, pas
// une image »).

import { OW_HEROES, type HeroBan } from '@/utils/matches/heroBans';

type Team = {
  id?: string | null;
  name?: string | null;
  short_name?: string | null;
} | null;

type Props = {
  pickedBy: string | null;
  bans: HeroBan[];
  onChange: (next: { pickedBy: string | null; bans: HeroBan[] }) => void;
  team1: Team;
  team2: Team;
  t: Record<string, string>;
};

const HEROES_BY_NAME = OW_HEROES.slice().sort((a, b) =>
  a.name.localeCompare(b.name, 'fr')
);

const selectClass =
  'px-2 py-1.5 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function MatchGamePickBans({
  pickedBy,
  bans,
  onChange,
  team1,
  team2,
  t,
}: Props) {
  const teams = [team1, team2].filter(
    (tm): tm is NonNullable<Team> & { id: string } => !!tm?.id
  );
  const label = (tm: NonNullable<Team>) => tm.short_name || tm.name || '';

  const setBan = (i: number, patch: Partial<HeroBan>) =>
    onChange({
      pickedBy,
      bans: bans.map((b, j) => (j === i ? { ...b, ...patch } : b)),
    });

  return (
    <div className="col-span-full grid gap-3 md:grid-cols-[12rem_1fr] border-t border-neutral-700/60 pt-3">
      <div>
        <label className="block text-xs text-neutral-400 mb-1">
          {t.pickedByLabel}
        </label>
        <select
          className={`w-full ${selectClass}`}
          value={pickedBy ?? ''}
          onChange={(e) => onChange({ pickedBy: e.target.value || null, bans })}
        >
          <option value="">{t.pickedByNone}</option>
          {teams.map((tm) => (
            <option key={tm.id} value={tm.id}>
              {label(tm)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="block text-xs text-neutral-400 mb-1">{t.heroBansLabel}</p>
        <div className="space-y-2">
          {bans.map((ban, i) => {
            const takenElsewhere = new Set(
              bans.filter((_, j) => j !== i).map((b) => b.hero)
            );
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: l'ordre EST l'identité d'un ban
                key={i}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="w-5 text-xs text-neutral-500 tabular-nums">
                  {i + 1}.
                </span>
                <select
                  aria-label={t.banTeamPlaceholder}
                  className={selectClass}
                  value={ban.team_id}
                  onChange={(e) => setBan(i, { team_id: e.target.value })}
                >
                  <option value="">{t.banTeamPlaceholder}</option>
                  {teams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {label(tm)}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={t.banHeroPlaceholder}
                  className={`flex-1 min-w-[10rem] ${selectClass}`}
                  value={ban.hero}
                  onChange={(e) => setBan(i, { hero: e.target.value })}
                >
                  <option value="">{t.banHeroPlaceholder}</option>
                  {HEROES_BY_NAME.filter((h) => !takenElsewhere.has(h.key)).map(
                    (h) => (
                      <option key={h.key} value={h.key}>
                        {h.name}
                      </option>
                    )
                  )}
                </select>
                <button
                  type="button"
                  title={t.removeBanTitle}
                  aria-label={t.removeBanTitle}
                  onClick={() =>
                    onChange({
                      pickedBy,
                      bans: bans.filter((_, j) => j !== i),
                    })
                  }
                  className="px-2 py-1 rounded text-neutral-500 hover:text-red-400 hover:bg-red-900/40 text-sm"
                >
                  ×
                </button>
              </div>
            );
          })}
          <button
            type="button"
            onClick={() => {
              // Alterne l'équipe par défaut : c'est l'ordre usuel des bans.
              const last = bans[bans.length - 1]?.team_id;
              const next =
                teams.find((tm) => tm.id !== last)?.id ?? teams[0]?.id ?? '';
              onChange({
                pickedBy,
                bans: [...bans, { team_id: next, hero: '' }],
              });
            }}
            className="px-2.5 py-1 rounded bg-neutral-700 hover:bg-neutral-600 text-xs"
          >
            {t.addBan}
          </button>
          <p className="text-[11px] text-neutral-500">{t.heroBansHint}</p>
        </div>
      </div>
    </div>
  );
}
