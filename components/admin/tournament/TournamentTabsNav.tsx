import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentNav from '@/lib/i18n/locales/admin-fr/adminTournamentNav';

/**
 * Les GROUPES de l'espace tournoi.
 *
 * Avant : quatorze onglets de premier niveau, dont huit cachés derrière un menu
 * « Plus ». Un menu déroulant est un aveu — il dit qu'on n'a pas su décider ce
 * qui compte, et il coûte un clic ET une mémoire à chaque fois qu'on cherche un
 * écran qui s'y trouve.
 *
 * Après : huit groupes, tous visibles, et une seconde ligne qui montre les
 * écrans du groupe actif. Rien n'est caché, rien n'est perdu — les URL des
 * écrans ne bougent pas, seule leur place dans l'arborescence change.
 *
 * Le regroupement suit ce qu'on FAIT, pas ce que le code contient :
 *   · Matchs   — la liste, le planning et les opérations en masse sont trois
 *                vues du même objet ; on passe de l'une à l'autre en corrigeant
 *                un calendrier, et les séparer imposait un aller-retour par le
 *                menu à chaque fois.
 *   · Réglages — ce qui se configure une fois et ne se touche plus un soir de
 *                match : identité du tournoi, pool de maps, Discord, cagnotte.
 *   · Outils   — les gestes ponctuels et le journal, qu'on ouvre pour
 *                comprendre ou pour réparer, jamais dans le flux.
 */
export type TournamentTabId =
  | 'dashboard'
  | 'checkin'
  | 'matches'
  | 'bracket'
  | 'stages'
  | 'results'
  | 'settings'
  | 'tools';

/** Un écran du groupe. `route` = dernier segment sous `/admin/tournament/[id]/`. */
type GroupMember = { route: string; labelKey: string };

export type TabGroup = {
  id: TournamentTabId;
  labelKey: string;
  members: GroupMember[];
};

/**
 * Le premier membre d'un groupe est sa destination par défaut : cliquer le
 * groupe y mène.
 *
 * Les groupes à UN SEUL membre sont ceux dont la page porte déjà ses propres
 * sous-onglets (`?tab=`, via le composant `Tabs`). Ils n'affichent pas de
 * seconde ligne : la page en rend une, juste en dessous, et en ajouter une
 * deuxième au même endroit ferait deux barres pour une seule décision.
 */
export const TOURNAMENT_TAB_GROUPS: TabGroup[] = [
  {
    id: 'dashboard',
    labelKey: 'tabDashboard',
    members: [{ route: 'dashboard', labelKey: 'tabDashboard' }],
  },
  {
    id: 'checkin',
    labelKey: 'tabCheckin',
    members: [{ route: 'checkin', labelKey: 'tabCheckin' }],
  },
  {
    id: 'matches',
    labelKey: 'tabMatches',
    members: [
      { route: 'matches', labelKey: 'subMatchesList' },
      { route: 'schedule', labelKey: 'subMatchesSchedule' },
      { route: 'bulk-ops', labelKey: 'subMatchesBulk' },
    ],
  },
  {
    id: 'bracket',
    labelKey: 'tabBracket',
    members: [{ route: 'bracket', labelKey: 'tabBracket' }],
  },
  {
    id: 'stages',
    labelKey: 'tabStages',
    members: [{ route: 'stages', labelKey: 'tabStages' }],
  },
  {
    id: 'results',
    labelKey: 'tabResults',
    members: [{ route: 'stats', labelKey: 'tabResults' }],
  },
  {
    id: 'settings',
    labelKey: 'tabSettings',
    members: [
      { route: 'edit', labelKey: 'subSettingsGeneral' },
      { route: 'maps', labelKey: 'subSettingsMaps' },
      { route: 'discord', labelKey: 'subSettingsDiscord' },
      { route: 'prize-pool', labelKey: 'subSettingsPrizePool' },
    ],
  },
  {
    id: 'tools',
    labelKey: 'tabTools',
    members: [
      { route: 'tools', labelKey: 'subToolsActions' },
      { route: 'history', labelKey: 'subToolsHistory' },
    ],
  },
];

/** Destination par défaut d'un groupe. */
export function tournamentTabHref(
  tournamentId: string,
  id: TournamentTabId
): string {
  const group = TOURNAMENT_TAB_GROUPS.find((g) => g.id === id) ?? TOURNAMENT_TAB_GROUPS[0];
  return `/admin/tournament/${tournamentId}/${group.members[0].route}`;
}

type Props = {
  tournamentId: string;
  active: TournamentTabId;
  className?: string;
};

/** Style partagé des onglets de premier niveau. */
function tabClassName(selected: boolean) {
  return `-mb-px rounded-t-lg px-4 py-2.5 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
    selected
      ? 'border-b-2 border-purple-500 text-white'
      : 'border-b-2 border-transparent text-neutral-400 hover:text-neutral-200'
  }`;
}

/**
 * Barre de navigation contextuelle en tête de chaque écran
 * `/admin/tournament/[id]/*`.
 *
 * Ce n'est PAS le composant `Tabs` : ici il s'agit de navigation entre PAGES,
 * donc chaque entrée est un vrai `<Link>` et l'active porte `aria-current`.
 *
 * Les écrans qui partagent un groupe passent l'id du GROUPE en `active` ; le
 * membre actif, lui, se déduit de l'URL — une page n'a pas à se déclarer deux
 * fois, et l'oubli du second appel resterait invisible jusqu'à ce que quelqu'un
 * remarque un sous-onglet éteint.
 */
export default function TournamentTabsNav({
  tournamentId,
  active,
  className = '',
}: Props) {
  const t = useAdminT(nsAdminTournamentNav);
  const tx = t as Record<string, string>;
  const router = useRouter();

  const group = TOURNAMENT_TAB_GROUPS.find((g) => g.id === active) ?? TOURNAMENT_TAB_GROUPS[0];

  // `router.pathname` rend le chemin AVEC le `[id]` non substitué
  // (`/admin/tournament/[id]/maps`) : son dernier segment est le slug de route,
  // sans risque de le confondre avec un identifiant de tournoi.
  const currentRoute = router.pathname.split('/').pop() ?? '';
  const showSubBar = group.members.length > 1;

  return (
    <nav
      aria-label={t.ariaLabel}
      className={`mb-6 flex flex-col gap-3 ${className}`}
    >
      {/* Remonter d'un cran : depuis le tableau de bord (racine du tournoi)
          vers la liste des tournois ; depuis tout autre écran, vers le tableau
          de bord. */}
      <Link
        href={
          active === 'dashboard'
            ? '/admin/tournaments'
            : `/admin/tournament/${tournamentId}/dashboard`
        }
        className="inline-flex w-fit items-center gap-2 text-sm text-neutral-400 hover:text-white"
      >
        {active === 'dashboard' ? tx.backToList : t.back}
      </Link>

      <div className="flex flex-wrap items-end gap-1 border-b border-neutral-700/60">
        {TOURNAMENT_TAB_GROUPS.map((g) => {
          const selected = g.id === active;
          return (
            <Link
              key={g.id}
              href={tournamentTabHref(tournamentId, g.id)}
              aria-current={selected ? 'page' : undefined}
              className={tabClassName(selected)}
            >
              {tx[g.labelKey]}
            </Link>
          );
        })}
      </div>

      {showSubBar && (
        <div className="flex flex-wrap gap-1">
          {group.members.map((m) => {
            const selected = m.route === currentRoute;
            return (
              <Link
                key={m.route}
                href={`/admin/tournament/${tournamentId}/${m.route}`}
                aria-current={selected ? 'page' : undefined}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/30 ${
                  selected
                    ? 'bg-neutral-800 font-medium text-white'
                    : 'text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                }`}
              >
                {tx[m.labelKey]}
              </Link>
            );
          })}
        </div>
      )}
    </nav>
  );
}
