// components/admin/tournament/mapPool/usePoolScope.ts
//
// Pool édité par l'écran du pool de cartes : pool par défaut, pool d'une
// JOURNÉE (`?round=N`) ou pool d'une DATE (`?date=YYYY-MM-DD`).
//
// La portée vit dans l'URL, pas dans un état local : un rafraîchissement ou un
// lien partagé rouvre le même pool, et le retour arrière du navigateur fait ce
// qu'on attend de lui. Extrait de la page, gelée en taille par
// tests/unit/adminFileSizeGuard.test.ts.

import { useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import {
  formatPlayDateShort,
  isValidPlayDate,
  type PoolScope,
} from '@/utils/maps/poolScope';
import { format } from '@/lib/i18n/useAdminT';
import type nsAdminTournamentMaps from '@/lib/i18n/locales/admin-fr/adminTournamentMaps';
import type { RoundOption } from './types';

type Dict = typeof nsAdminTournamentMaps.fr;

/** Paramètre de requête de l'API pour une portée. Vide pour le pool par défaut. */
export function scopeQuery(scope: PoolScope): string {
  if (scope.kind === 'round') return `round=${scope.round}`;
  if (scope.kind === 'date') return `date=${scope.date}`;
  return '';
}

/** Ajoute la portée à une URL d'API. PURE. */
export function withScope(url: string, scope: PoolScope): string {
  const q = scopeQuery(scope);
  if (!q) return url;
  return url.includes('?') ? `${url}&${q}` : `${url}?${q}`;
}

/** Deux portées désignent-elles le même pool ? PURE. */
export function sameScope(a: PoolScope, b: PoolScope): boolean {
  if (a.kind === 'round' && b.kind === 'round') return a.round === b.round;
  if (a.kind === 'date' && b.kind === 'date') return a.date === b.date;
  return a.kind === b.kind;
}

/**
 * Lit la portée dans la query. Une date valide l'emporte : l'API refuse les
 * deux paramètres ensemble, l'écran n'en émet jamais qu'un. PURE.
 */
export function scopeFromQuery(query: {
  round?: string | string[];
  date?: string | string[];
}): PoolScope {
  const first = (v: string | string[] | undefined) =>
    Array.isArray(v) ? v[0] : v;
  const date = first(query.date);
  if (date && isValidPlayDate(date)) return { kind: 'date', date };
  const round = first(query.round);
  if (round && /^\d+$/.test(round)) {
    const parsed = Number(round);
    if (Number.isSafeInteger(parsed) && parsed >= 1) {
      return { kind: 'round', round: parsed };
    }
  }
  return { kind: 'default' };
}

export function getTypeLabels(t: Dict): Record<string, string> {
  return {
    // Overwatch
    control: t.typeControl,
    hybrid: t.typeHybrid,
    escort: t.typeEscort,
    push: t.typePush,
    flashpoint: t.typeFlashpoint,
    clash: t.typeClash,
    // Valorant
    standard: t.typeStandard,
    // CS2
    'active-duty': t.typeActiveDuty,
  };
}

/**
 * Textes qui NOMMENT le pool visé : confirmation de suppression, bandeau,
 * état vide, remplissage. Le nom compte — « supprimer toutes les maps » a
 * longtemps détruit d'autres pools sans le dire. PURE.
 */
export function scopeTexts(
  t: Dict,
  scope: PoolScope,
  rounds: RoundOption[]
): {
  poolName: string;
  notice: string | null;
  empty: string;
  confirmFill: string | null;
} {
  if (scope.kind === 'date') {
    const date = formatPlayDateShort(scope.date);
    return {
      poolName: format(t.datePoolName, { date }),
      notice: format(t.dateScopeNotice, { date }),
      empty: format(t.emptyDatePool, { date }),
      confirmFill: format(t.confirmFillDate, { date }),
    };
  }
  if (scope.kind === 'round') {
    const round =
      rounds.find((r) => r.round === scope.round)?.label ?? `J${scope.round}`;
    return {
      poolName: round,
      notice: format(t.roundScopeNotice, { round }),
      empty: format(t.emptyRoundPool, { round }),
      confirmFill: format(t.confirmFillRound, { round }),
    };
  }
  return {
    poolName: t.roundDefaultPool,
    notice: null,
    empty: t.emptyMaps,
    confirmFill: null,
  };
}

export function usePoolScope() {
  const router = useRouter();
  const { round, date } = router.query;

  const scope = useMemo(() => scopeFromQuery({ round, date }), [round, date]);

  const setScope = useCallback(
    (next: PoolScope) => {
      const query = { ...router.query };
      delete query.round;
      delete query.date;
      if (next.kind === 'round') query.round = String(next.round);
      if (next.kind === 'date') query.date = next.date;
      // `shallow` : seul le paramètre change, pas la session staff rechargée
      // par getServerSideProps.
      router.replace({ pathname: router.pathname, query }, undefined, {
        shallow: true,
      });
    },
    [router]
  );

  return { scope, setScope };
}
