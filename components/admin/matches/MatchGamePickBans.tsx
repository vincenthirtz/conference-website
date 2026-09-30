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
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

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
  'rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-2 py-1.5 text-sm text-[var(--t1,#f4edf7)] focus:border-[var(--or,#b467d1)] focus:outline-none';

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
    <div className="col-span-full grid gap-3 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3 md:grid-cols-[12rem_1fr]">
      <div>
        <label className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
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
        <p className="mb-1 block text-xs text-[var(--t3,#a39ba6)]">
          {t.heroBansLabel}
        </p>
        <div className="space-y-2">
          {bans.map((ban, i) => {
            const takenElsewhere = new Set(
              bans.filter((_, j) => j !== i).map((b) => b.hero)
            );
            return (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="w-5 font-mono text-xs text-[var(--t4,#807984)]">
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
                  className="rounded-[var(--r-ctrl,4px)] px-2 py-1 text-sm text-[var(--t4,#807984)] hover:bg-[rgba(255,107,107,.08)] hover:text-[var(--err,#ff6b6b)]"
                >
                  ×
                </button>
              </div>
            );
          })}
          <AdminButton
            size="xs"
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
          >
            {t.addBan}
          </AdminButton>
          <p className="text-[11px] text-[var(--t4,#807984)]">
            {t.heroBansHint}
          </p>
        </div>
      </div>
    </div>
  );
}
