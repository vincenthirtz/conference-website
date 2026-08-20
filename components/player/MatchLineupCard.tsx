// components/player/MatchLineupCard.tsx
//
// Feuille de match — l'écran où une équipe déclare QUI joue.
//
// Ce que ça répare : jusqu'ici, `match_participants` était rempli après coup
// par `snapshotMatchParticipants`, qui fige le roster COURANT au moment de la
// saisie du score. Une remplaçante restée sur le banc recevait donc le même
// ajustement de rating qu'une titulaire, et une joueuse arrivée APRÈS le match
// se voyait attribuer un match qu'elle n'a pas joué. Personne n'avait jamais
// déclaré la composition — et une composition déclarée après coup ne prouve
// rien.
//
// Trois choix portés ici :
//
//   1. La carte se TAIT si elle n'a rien à dire. Pas de match, pas de
//      permission (403), feuille close pour ce match : elle ne rend rien
//      plutôt qu'un bloc « indisponible » qu'on apprend à ignorer.
//   2. Le CHECK-IN est la porte, et on le dit — « la feuille s'ouvre une fois
//      le check-in fait » est actionnable, « indisponible » ne l'est pas.
//   3. Une feuille validée devient une LECTURE, pas un formulaire grisé : le
//      geste est fait, l'écran doit le refléter et non proposer de le refaire.

import { useCallback, useEffect, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import { logger } from '../../utils/logger';
import nsMatchLineup from '@/lib/i18n/locales/fr/matchLineup';

type EligibleMember = {
  userId: string;
  displayName: string | null;
  battleTag: string | null;
  role: string | null;
  isSubstitute: boolean;
};

type LineupPayload = {
  open: boolean;
  closedReason: string | null;
  closedMessage: string | null;
  status: 'draft' | 'validated';
  validatedAt: string | null;
  validatedByKind: 'team' | 'admin' | null;
  editable: boolean;
  starters: string[];
  eligible: EligibleMember[];
};

export default function MatchLineupCard({ matchId }: { matchId: string }) {
  const t = useT(nsMatchLineup);
  const locale = useLocale();
  const { withSubject, readOnly } = usePlayerArea();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [data, setData] = useState<LineupPayload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // `hidden` couvre le 403 : sans permission `validate_lineup`, la carte
  // n'existe pas pour cette personne. On ne la distingue pas d'une erreur
  // réseau côté rendu — dans les deux cas, ne rien afficher vaut mieux qu'un
  // bloc vide.
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<LineupPayload>(
        withSubject(`/api/teams/matches/${matchId}/lineup`),
        { skipAuthRedirect: true }
      );
      setData(payload);
      setSelected(new Set(payload.starters));
    } catch (err) {
      logger.error('[MatchLineupCard] load', err);
      setHidden(true);
    }
  }, [adminFetchJson, matchId, withSubject]);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden || !data) return null;
  // Feuille close ET rien de déclaré : hors du check-in, la carte n'a rien à
  // apporter. On la garde quand une composition existe déjà, pour que le match
  // reste consultable après coup.
  if (!data.open && data.starters.length === 0) {
    // Exception : « en attente du check-in » EST actionnable — on le dit.
    if (data.closedReason !== 'awaiting_checkin') return null;
  }

  const toggle = (userId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  async function submit(validate: boolean) {
    setBusy(true);
    setError(null);
    try {
      const payload = await adminFetchJson<Partial<LineupPayload>>(
        withSubject(`/api/teams/matches/${matchId}/lineup`),
        {
          method: validate ? 'POST' : 'PUT',
          body: JSON.stringify({ starters: [...selected] }),
        }
      );
      setData((prev) => (prev ? { ...prev, ...payload } : prev));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const validated = data.status === 'validated';
  const canAct = data.open && data.editable && !readOnly;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="text-base font-semibold text-white">{t.title}</h3>
        {validated && (
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-300">
            {data.validatedByKind === 'admin' ? t.badgeAdmin : t.badgeTeam}
          </span>
        )}
      </div>

      {!data.open ? (
        <p className="text-sm text-gray-300">{data.closedMessage}</p>
      ) : (
        <p className="text-sm text-gray-400">
          {validated ? t.introValidated : t.intro}
        </p>
      )}

      {validated && data.validatedAt && (
        <p className="mt-1 text-xs text-gray-500">
          {format(t.validatedAt, {
            date: new Date(data.validatedAt).toLocaleString(locale),
          })}
        </p>
      )}

      {data.eligible.length > 0 && (
        <ul className="mt-4 space-y-2">
          {data.eligible.map((m) => {
            const picked = selected.has(m.userId);
            // Feuille validée : on ne montre QUE les alignées. Lister les
            // non-retenues avec une case décochée donnerait l'illusion qu'on
            // peut encore changer d'avis.
            if (validated && !picked) return null;
            return (
              <li key={m.userId}>
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition ${
                    picked
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                      : 'border-white/10 bg-white/5 text-gray-300 hover:bg-white/10'
                  } ${canAct ? '' : 'cursor-default'}`}
                >
                  {!validated && (
                    <input
                      type="checkbox"
                      checked={picked}
                      disabled={!canAct || busy}
                      onChange={() => toggle(m.userId)}
                      className="h-4 w-4 accent-emerald-500"
                    />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {m.displayName || m.battleTag || t.unknownMember}
                  </span>
                  {m.isSubstitute && (
                    <span className="shrink-0 rounded-full border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-gray-400">
                      {t.substituteBadge}
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100"
        >
          {error}
        </p>
      )}

      {canAct && !validated && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => submit(false)}
            disabled={busy}
            className="rounded-lg border border-white/20 px-3 py-1.5 text-sm text-gray-200 transition hover:bg-white/10 disabled:opacity-50"
          >
            {t.save}
          </button>
          <button
            type="button"
            onClick={() => submit(true)}
            disabled={busy || selected.size === 0}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
          >
            {t.validate}
          </button>
          {/* Dire ce que « valider » engage AVANT de cliquer : la feuille se
              fige, et seul le staff du tournoi peut la rouvrir. */}
          <span className="text-xs text-gray-500">{t.validateHint}</span>
        </div>
      )}
    </div>
  );
}
