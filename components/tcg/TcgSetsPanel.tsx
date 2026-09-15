// components/tcg/TcgSetsPanel.tsx
//
// Les SÉRIES de la collection : « où j'en suis » par ensemble à compléter.
//
// SE CHARGE LUI-MÊME (`GET /api/player/tcg/sets`) plutôt que d'alourdir
// `pages/player/tcg.tsx`. La page ne lui passe que deux choses :
//   - `reloadToken`, qui change quand la collection change (ouverture,
//     recyclage) : la progression est alors relue ;
//   - `celebrate`, les séries que la DERNIÈRE ouverture vient de compléter
//     (`setsCompleted` de la réponse d'ouverture) — la récompense a été écrite
//     à ce moment-là, la lecture suivante ne la verrait plus comme « neuve ».
//
// LE SERVEUR REND LE FAIT, LE COMPOSANT LE FORMULE. Aucun libellé de série ne
// vient de l'API : le mode, le tournoi et l'équipe arrivent bruts, et la
// phrase se compose ici dans la langue de la lectrice.
//
// ON NE NOMME PAS LES JOUEUSES MANQUANTES. L'API ne rend qu'un nombre
// (`missingPlayers`) ; ce composant n'a donc rien à cacher — la garantie est
// dans la forme de la réponse, pas dans sa prudence. Cf.
// `utils/tcg/collectionSets.ts`.
//
// ACCESSIBILITÉ. Le texte porte l'information, la barre la redouble (même
// règle que `TcgCollectionProgress`) ; une série complétée est ANNONCÉE par une
// région `aria-live` montée vide en permanence ; la barre ne s'anime pas sous
// `prefers-reduced-motion`.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { Skeleton } from '@/components/ui/Skeleton';
import { useT, format } from '@/lib/i18n/useT';
import nsTcgSets from '@/lib/i18n/locales/fr/tcgSets';

/** Séries montrées avant « Voir toutes » : un écran, pas un inventaire. */
const INITIAL_VISIBLE = 6;

type SetKind = 'map_mode' | 'tournament_teams' | 'team_roster';

/** Ce que l'API rend pour une série. Cf. `utils/tcg/grantCollectionSets.ts`. */
export type TcgSetProgress = {
  key: string;
  kind: SetKind;
  mode: string | null;
  tournamentName: string | null;
  teamName: string | null;
  total: number;
  owned: number;
  complete: boolean;
  missingNamed: Array<{
    kind: 'team' | 'map';
    id: string;
    name: string | null;
  }>;
  missingPlayers: number;
  rewarded: boolean | null;
  justRewarded: boolean;
};

/** Une série tout juste complétée, telle que la rend l'ouverture de paquet. */
export type TcgSetCompletedNotice = {
  key: string;
  kind: SetKind;
  mode: string | null;
  tournamentName: string | null;
  teamName: string | null;
  coins: number;
};

type SetsResponse = {
  sets?: TcgSetProgress[];
  rewardCoins?: number;
  newlyRewarded?: TcgSetCompletedNotice[];
};

type Dict = typeof nsTcgSets.fr;

function modeLabel(mode: string | null, t: Dict): string {
  switch (mode) {
    case 'control':
      return t.modeControl;
    case 'escort':
      return t.modeEscort;
    case 'hybrid':
      return t.modeHybrid;
    case 'push':
      return t.modePush;
    case 'flashpoint':
      return t.modeFlashpoint;
    default:
      // Un mode ajouté au registre sans traduction : son identifiant plutôt
      // qu'un libellé vide.
      return mode ?? '';
  }
}

/** Le nom d'une série, dans la langue de la lectrice. */
export function setLabel(
  set: Pick<TcgSetProgress, 'kind' | 'mode' | 'tournamentName' | 'teamName'>,
  t: Dict
): string {
  const tournament = set.tournamentName?.trim() || t.unknownTournament;
  if (set.kind === 'map_mode') {
    return format(t.labelMapMode, { mode: modeLabel(set.mode, t) });
  }
  if (set.kind === 'tournament_teams') {
    return format(t.labelTournamentTeams, { tournament });
  }
  return format(t.labelTeamRoster, {
    team: set.teamName?.trim() || t.unknownTeam,
    tournament,
  });
}

/**
 * L'ordre d'affichage : les séries en cours les plus avancées d'abord — c'est
 * là qu'un paquet de plus change quelque chose —, les complètes ensuite.
 */
export function sortSets(sets: readonly TcgSetProgress[]): TcgSetProgress[] {
  const ratio = (s: TcgSetProgress) => (s.total > 0 ? s.owned / s.total : 0);
  return [...sets].sort((a, b) => {
    if (a.complete !== b.complete) return a.complete ? 1 : -1;
    const diff = ratio(b) - ratio(a);
    if (diff !== 0) return diff;
    return a.key.localeCompare(b.key);
  });
}

export default function TcgSetsPanel({
  reloadToken,
  celebrate,
  className,
}: {
  reloadToken: number;
  celebrate?: TcgSetCompletedNotice[] | null;
  className?: string;
}): JSX.Element | null {
  const t = useT(nsTcgSets);
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sets, setSets] = useState<TcgSetProgress[]>([]);
  const [rewardCoins, setRewardCoins] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const loadedOnce = useRef(false);

  const announce = useCallback(
    (notices: readonly TcgSetCompletedNotice[]) => {
      if (notices.length === 0) return;
      const text = notices
        .map((n) =>
          format(t.justCompleted, { label: setLabel(n, t), coins: n.coins })
        )
        .join(' ');
      // Vider d'abord : deux annonces identiques ne seraient pas relues.
      setAnnouncement('');
      requestAnimationFrame(() => setAnnouncement(text));
      for (const n of notices) {
        addToast(
          format(t.justCompleted, { label: setLabel(n, t), coins: n.coins }),
          'success'
        );
      }
    },
    [addToast, t]
  );

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<SetsResponse>('/api/player/tcg/sets');
      setSets(Array.isArray(data.sets) ? data.sets : []);
      setRewardCoins(
        typeof data.rewardCoins === 'number' && data.rewardCoins > 0
          ? data.rewardCoins
          : null
      );
      // La lecture paresseuse peut, elle aussi, venir d'écrire une récompense
      // (série déjà complète avant la fonctionnalité) : on le dit de même.
      if (Array.isArray(data.newlyRewarded)) announce(data.newlyRewarded);
      loadedOnce.current = true;
      setState('ready');
    } catch {
      // Déjà affichées : on garde l'écran. Jamais affichées : l'erreur, pas un
      // « aucune série » qui ferait croire à un état réel.
      if (!loadedOnce.current) setState('error');
    }
  }, [adminFetchJson, announce]);

  // `reloadToken` est une dépendance VOULUE : il n'est pas lu dans l'effet, il
  // le relance quand la collection change.
  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  // Une ouverture = une annonce. La référence du tableau sert de marqueur : un
  // changement de langue recrée `announce`, et ne doit pas rejouer le toast.
  const celebratedRef = useRef<TcgSetCompletedNotice[] | null>(null);
  useEffect(() => {
    if (!celebrate || celebrate.length === 0) return;
    if (celebratedRef.current === celebrate) return;
    celebratedRef.current = celebrate;
    announce(celebrate);
  }, [celebrate, announce]);

  const retry = useCallback(() => {
    setState('loading');
    void load();
  }, [load]);

  const ordered = sortSets(sets);
  const visible = expanded ? ordered : ordered.slice(0, INITIAL_VISIBLE);

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 ${className ?? ''}`}
      aria-labelledby="tcg-sets-title"
    >
      <h2 id="tcg-sets-title" className="text-lg font-semibold">
        {t.title}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-gray-400">
        {rewardCoins !== null
          ? format(t.intro, { coins: rewardCoins })
          : t.introNoReward}
      </p>
      <p className="mt-1 max-w-prose text-xs text-gray-500">{t.privacyNote}</p>

      {/* Région d'annonce, montée VIDE en permanence. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      {state === 'loading' && (
        <ul aria-hidden className="mt-4 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }, (_, i) => (
            <li key={i}>
              <Skeleton className="h-20 w-full" rounded="rounded-xl" />
            </li>
          ))}
        </ul>
      )}
      {state === 'loading' && <p className="sr-only">{t.loading}</p>}

      {state === 'error' && (
        <div role="alert" className="mt-4 text-sm text-gray-300">
          <p>{t.error}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 min-h-11 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
          >
            {t.retry}
          </button>
        </div>
      )}

      {state === 'ready' && ordered.length === 0 && (
        <p className="mt-4 text-sm text-gray-400">{t.empty}</p>
      )}

      {state === 'ready' && ordered.length > 0 && (
        <>
          <ul id="tcg-sets-list" className="mt-4 grid gap-3 sm:grid-cols-2">
            {visible.map((set) => (
              <SetItem key={set.key} set={set} t={t} />
            ))}
          </ul>
          {ordered.length > INITIAL_VISIBLE && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              aria-controls="tcg-sets-list"
              className="mt-3 min-h-11 rounded-full px-4 py-2 text-sm font-medium text-purple-300 underline-offset-4 transition hover:text-purple-200 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-yellow)]"
            >
              {expanded
                ? t.showLess
                : format(t.showAll, { count: ordered.length })}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function SetItem({ set, t }: { set: TcgSetProgress; t: Dict }): JSX.Element {
  const label = setLabel(set, t);
  const percent = set.total > 0 ? Math.round((set.owned / set.total) * 100) : 0;
  const names = set.missingNamed
    .map((m) => m.name)
    .filter((n): n is string => Boolean(n));

  return (
    <li
      className={`rounded-xl border p-3 ${
        set.complete
          ? 'border-[var(--color-green)]/40 bg-[var(--color-green)]/[0.06]'
          : 'border-white/10 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="min-w-0 break-words text-sm font-semibold text-white">
          {label}
        </p>
        <p className="shrink-0 text-xs tabular-nums text-gray-300">
          {format(t.progress, { owned: set.owned, total: set.total })}
        </p>
      </div>

      <div
        role="progressbar"
        aria-label={format(t.progressAria, { label })}
        aria-valuemin={0}
        aria-valuemax={set.total}
        aria-valuenow={set.owned}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none ${
            set.complete
              ? 'bg-[var(--color-green)]'
              : 'bg-[var(--color-violet)]'
          }`}
          style={{ width: `${percent}%` }}
        />
      </div>

      {set.complete && (
        <p className="mt-2 text-xs font-semibold text-[var(--color-green)]">
          {t.complete}
          {set.rewarded === true ? ` · ${t.rewarded}` : ''}
        </p>
      )}
      {!set.complete && set.rewarded === true && (
        <p className="mt-2 text-xs text-gray-400">{t.rewardedIncomplete}</p>
      )}

      {!set.complete && names.length > 0 && (
        <p className="mt-2 break-words text-xs text-gray-400">
          {format(t.missingNamed, { names: names.join(', ') })}
        </p>
      )}
      {!set.complete && set.missingPlayers > 0 && (
        <p className="mt-1 text-xs text-gray-400">
          {set.missingPlayers === 1
            ? t.missingPlayers_one
            : format(t.missingPlayers_other, { count: set.missingPlayers })}
        </p>
      )}
    </li>
  );
}
