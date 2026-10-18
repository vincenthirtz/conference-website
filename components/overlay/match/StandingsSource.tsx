// components/overlay/match/StandingsSource.tsx
//
// La source « classement » : le classement EN COURS d'un tournoi, tel qu'il
// s'affiche dans OBS (plein cadre 1920×1080). Mêmes lignes que la page
// publique « Classement » — l'API ne recompte rien.
//
// MÊMES PARTIS PRIS que « matchs du jour » : ni panneau, ni titre (la scène de
// la régie porte l'habillage), fond transparent et ombre portée sur le texte,
// largeur qui suit la source, et des NOMS JAMAIS TRONQUÉS — un nom coupé ne se
// devine pas à l'antenne, il passe à la ligne.
//
// Deux marques seulement, parce qu'elles disent quelque chose : la zone
// qualificative (rang en couleur d'accent, trait sous la dernière place
// qualifiée) et les équipes disqualifiées (en retrait, puce « DNF »).

import { useT } from '@/lib/i18n/useT';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';
import {
  pickStandingsTable,
  type OverlayStandingsResponse,
  type OverlayStandingsRowView,
} from '@/utils/overlay/standingsOverlay';
import { TeamLogo } from '@/components/overlay/match/MatchSources';

type Dict = typeof nsOverlay.fr;

/** Accent de la zone qualificative quand l'espace n'en déclare pas. */
const DEFAULT_ACCENT = '#facc15';

const FORM_TONE: Record<string, string> = {
  W: 'bg-emerald-500/90',
  L: 'bg-red-500/90',
  D: 'bg-white/30',
};

/** `+11`, `0`, `−8` (vrai signe moins : il a la largeur du plus). */
export function formatMapDiff(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '0';
}

export function FormChips({ form, t }: { form: string[]; t: Dict }) {
  const letter = (r: string) =>
    r === 'W'
      ? t.standingsFormW
      : r === 'L'
        ? t.standingsFormL
        : t.standingsFormD;
  return (
    <div className="flex justify-center gap-1.5">
      {form.map((r, i) => (
        <span
          // La position EST l'identité : du plus ancien au plus récent.
          key={i}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-md text-lg font-black text-white ${
            FORM_TONE[r] ?? FORM_TONE.D
          }`}
        >
          {letter(r)}
        </span>
      ))}
    </div>
  );
}

function StandingLine({
  row,
  qualified,
  cutBelow,
  accent,
  showDraws,
  t,
}: {
  row: OverlayStandingsRowView;
  qualified: boolean;
  cutBelow: boolean;
  accent: string;
  showDraws: boolean;
  t: Dict;
}) {
  const cell = `py-2 ${cutBelow ? 'border-b-2 border-white/50' : ''}`;
  const num = `${cell} px-3 text-center text-3xl font-bold tabular-nums`;
  return (
    <tr
      className={row.disqualified ? 'opacity-50' : undefined}
      data-testid="standings-row"
    >
      <td
        className={`${cell} pr-4 text-right text-4xl font-black tabular-nums`}
        style={qualified ? { color: accent } : undefined}
      >
        {row.rank}
      </td>
      <td className={`${cell} pr-4`}>
        <div className="flex items-center gap-4">
          <TeamLogo
            team={{
              name: row.team.name,
              shortName: row.team.shortName,
              logoUrl: row.team.logoUrl,
              score: 0,
              isWinner: false,
            }}
            size="sm"
            fallback={row.team.name}
          />
          <span className="min-w-0 break-words text-3xl font-bold leading-tight">
            {row.team.name}
          </span>
          {row.disqualified && (
            <span className="shrink-0 rounded-md bg-red-600 px-2 py-0.5 text-base font-black uppercase tracking-wider text-white">
              {t.standingsDisqualified}
            </span>
          )}
        </div>
      </td>
      <td className={num}>{row.played}</td>
      <td className={num}>{row.wins}</td>
      <td className={num}>{row.losses}</td>
      {showDraws && <td className={num}>{row.draws}</td>}
      <td className={`${num} font-black`}>{row.points}</td>
      <td className={num}>{formatMapDiff(row.mapDiff)}</td>
      <td className={`${cell} px-3`}>
        <FormChips form={row.form} t={t} />
      </td>
    </tr>
  );
}

export function StandingsSource({
  payload,
  scale,
  limit,
  stageKey,
  qualify,
}: {
  payload: OverlayStandingsResponse | null;
  scale: number;
  /** Lignes affichées ; `null` = toutes. */
  limit: number | null;
  /** `?stage=` : la table voulue ; absent = la phase en cours. */
  stageKey: string | null;
  /** `?qualify=` : zone forcée (0 la masque) ; `null` = règle du serveur. */
  qualify: number | null;
}) {
  const t = useT(nsOverlay);
  if (!payload) return null;

  const table = pickStandingsTable(payload.tables, stageKey);
  if (!table || table.rows.length === 0) return null;

  const rows = limit ? table.rows.slice(0, limit) : table.rows;
  const zone = qualify ?? payload.qualifiers;
  const accent = payload.branding?.accent || DEFAULT_ACCENT;
  const showDraws = table.rows.some((r) => r.draws > 0);
  const head =
    'px-3 pb-2 text-center text-lg font-bold uppercase tracking-wider text-white/60';

  return (
    <div className="flex h-full w-full items-center justify-center px-8">
      <div
        className="w-full max-w-[1500px] origin-center text-white [text-shadow:0_2px_8px_rgba(0,0,0,0.9)]"
        style={{ transform: scale !== 1 ? `scale(${scale})` : undefined }}
      >
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={`${head} pr-4 text-right`}>
                {t.standingsColRank}
              </th>
              <th scope="col" className={`${head} w-full text-left`}>
                {t.standingsColTeam}
              </th>
              <th scope="col" className={head}>
                {t.standingsColPlayed}
              </th>
              <th scope="col" className={head}>
                {t.standingsColWins}
              </th>
              <th scope="col" className={head}>
                {t.standingsColLosses}
              </th>
              {showDraws && (
                <th scope="col" className={head}>
                  {t.standingsColDraws}
                </th>
              )}
              <th scope="col" className={head}>
                {t.standingsColPoints}
              </th>
              <th scope="col" className={head}>
                {t.standingsColMaps}
              </th>
              <th scope="col" className={head}>
                {t.standingsColForm}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const qualified = !row.disqualified && row.rank <= zone;
              // Le trait tombe sous la DERNIÈRE place qualifiée, et seulement
              // s'il reste des lignes en dessous.
              const cutBelow =
                zone > 0 && row.rank === zone && i < rows.length - 1;
              return (
                <StandingLine
                  key={row.team.id}
                  row={row}
                  qualified={qualified}
                  cutBelow={cutBelow}
                  accent={accent}
                  showDraws={showDraws}
                  t={t}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
