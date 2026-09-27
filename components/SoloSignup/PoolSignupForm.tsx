// components/SoloSignup/PoolSignupForm.tsx
//
// Inscription INDIVIDUELLE à un tournoi regroupé en équipes de 5
// (`tournaments.pooled_teams`) — cf. utils/tournaments/pool.ts.
//
// CONNEXION REQUISE, et c'est ce qui rend le parcours court : le compte dit à
// quelles équipes la joueuse appartient, son profil pré-remplit pseudo et
// BattleTag. Scanné depuis le QR code sur un téléphone déjà connecté, il ne
// reste qu'à choisir son équipe et valider.
//
// Après inscription, l'écran dit OÙ elle en est — c'est la moitié de la valeur :
// « 3 / 5 de ton équipe inscrites » est ce qui la fait relancer ses
// coéquipières, et « liste d'attente » dit qu'il n'y a rien d'autre à faire.

import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useId, useState } from 'react';
import { useT, format as fmt } from '@/lib/i18n/useT';
import nsSoloSignup from '@/lib/i18n/locales/fr/soloSignup';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { BATTLE_TAG_REGEX } from '@/utils/teams/roleKind';
import type { PoolStatusView } from '@/utils/tournaments/pool';

const inputCls =
  'w-full rounded-xl border border-white/15 bg-black/40 px-3 py-2.5 text-sm text-white placeholder:text-gray-600 focus:border-[var(--color-green)] focus:outline-none';
const labelCls = 'mb-1 block text-sm font-medium text-gray-200';
const cardCls =
  'space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6';
const btnPrimary =
  'inline-flex min-h-11 items-center justify-center rounded-xl bg-[var(--color-green)] px-5 py-2.5 text-sm font-semibold text-black disabled:opacity-50';
const btnGhost =
  'inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm text-gray-200 disabled:opacity-50';

/** Sentinelle du <select> pour « sans équipe ». */
const NO_TEAM = '';

export default function PoolSignupForm({
  tournamentId,
}: {
  tournamentId: string;
}) {
  const t = useT(nsSoloSignup);
  const router = useRouter();
  const { user, token, loading } = usePlayerSession({ redirect: false });

  const [view, setView] = useState<PoolStatusView | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pseudo, setPseudo] = useState('');
  const [battleTag, setBattleTag] = useState('');
  const [teamId, setTeamId] = useState(NO_TEAM);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [justRegisteredTeam, setJustRegisteredTeam] = useState(false);

  const pseudoId = useId();
  const tagId = useId();
  const teamSelectId = useId();

  const endpoint = `/api/tournament/${tournamentId}/pool`;

  const call = useCallback(
    async (method: 'GET' | 'POST' | 'DELETE', body?: unknown) => {
      const res = await fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      return { ok: res.ok, json };
    },
    [endpoint, token]
  );

  // Premier chargement : l'état de l'inscription, puis le pré-remplissage du
  // formulaire (inscription existante d'abord, profil ensuite).
  useEffect(() => {
    if (!user || !token) return;
    let alive = true;
    void call('GET')
      .then(({ ok, json }) => {
        if (!alive) return;
        if (!ok) {
          setLoadError(true);
          return;
        }
        const v = json as PoolStatusView;
        setView(v);
        const meta = user.user_metadata ?? {};
        setPseudo(
          v.entry?.displayName ||
            (typeof meta.display_name === 'string' ? meta.display_name : '')
        );
        const tag =
          v.entry?.battleTag ||
          (typeof meta.battle_tag === 'string' ? meta.battle_tag : '');
        setBattleTag(BATTLE_TAG_REGEX.test(tag.trim()) ? tag.trim() : '');
        // Une seule équipe : c'est forcément elle. Plusieurs : à elle de dire.
        setTeamId(
          v.entry?.originTeam?.id ??
            (v.teams.length === 1 ? v.teams[0].id : NO_TEAM)
        );
      })
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [user, token, call]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (pseudo.trim().length < 2) return setErrorMsg(t.validationPseudo);
    if (!BATTLE_TAG_REGEX.test(battleTag.trim()))
      return setErrorMsg(t.validationBattleTag);
    setBusy(true);
    try {
      const { ok, json } = await call('POST', {
        displayName: pseudo.trim(),
        battleTag: battleTag.trim(),
        originTeamId: teamId || null,
      });
      if (!ok) {
        setErrorMsg(
          json.code === 'BATTLETAG_INVALID'
            ? t.validationBattleTag
            : json.code === 'REGISTRATION_CLOSED'
              ? t.closedBody
              : json.code === 'NOT_TEAM_MEMBER'
                ? t.poolErrNotMember
                : t.errGeneric
        );
        return;
      }
      setView(json as PoolStatusView);
      setJustRegisteredTeam(json.teamRegistered === true);
      setEditing(false);
    } catch {
      setErrorMsg(t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    setBusy(true);
    setErrorMsg(null);
    try {
      const { ok, json } = await call('DELETE');
      if (ok) setView(json as PoolStatusView);
      else setErrorMsg(t.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  if (loading || (user && !view && !loadError)) {
    return (
      <div className={cardCls}>
        <p className="text-sm text-gray-400">{t.poolLoading}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className={`${cardCls} text-center`}>
        <h2 className="text-lg font-semibold text-white">{t.poolLoginTitle}</h2>
        <p className="text-sm text-gray-300">{t.poolLoginBody}</p>
        <Link
          href={`/login?next=${encodeURIComponent(router.asPath)}`}
          className={btnPrimary}
        >
          {t.poolLoginCta}
        </Link>
      </div>
    );
  }

  if (loadError || !view) {
    return (
      <div className={cardCls} role="alert">
        <p className="text-sm text-red-300">{t.errGeneric}</p>
      </div>
    );
  }

  const entry = view.entry;

  if (entry && !editing) {
    const progress = view.teamProgress;
    return (
      <div className={cardCls} data-testid="pool-status" aria-live="polite">
        {entry.status === 'placed' ? (
          <>
            <h2 className="text-lg font-semibold text-[var(--color-green)]">
              {justRegisteredTeam
                ? t.poolTeamJustRegistered
                : t.poolPlacedTitle}
            </h2>
            <p className="text-sm text-gray-200">
              {fmt(t.poolPlacedBody, { team: entry.placedTeam?.name ?? '' })}
            </p>
          </>
        ) : progress ? (
          <>
            <h2 className="text-lg font-semibold text-white">
              {t.poolWaitTeamTitle}
            </h2>
            <p className="text-sm text-gray-200">
              {fmt(t.poolWaitTeamBody, {
                team: progress.team.name,
                count: String(Math.min(progress.signedUp, progress.needed)),
                needed: String(progress.needed),
              })}
            </p>
            <div
              className="h-2 overflow-hidden rounded-full bg-white/10"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.needed}
              aria-valuenow={Math.min(progress.signedUp, progress.needed)}
            >
              <div
                className="h-full bg-[var(--color-green)]"
                style={{
                  width: `${(Math.min(progress.signedUp, progress.needed) / progress.needed) * 100}%`,
                }}
              />
            </div>
            {progress.teamRegistered && (
              <p className="text-sm text-gray-400">{t.poolWaitTeamFull}</p>
            )}
          </>
        ) : (
          <>
            <h2 className="text-lg font-semibold text-white">
              {t.poolWaitSoloTitle}
            </h2>
            <p className="text-sm text-gray-200">{t.poolWaitSoloBody}</p>
          </>
        )}

        <p className="text-xs text-gray-500">
          {fmt(t.poolRecap, {
            pseudo: entry.displayName,
            tag: entry.battleTag,
          })}
        </p>

        {errorMsg && (
          <p className="text-sm text-red-300" role="alert">
            {errorMsg}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={btnGhost}
            onClick={() => setEditing(true)}
            disabled={busy}
          >
            {t.poolEdit}
          </button>
          {entry.status === 'waitlist' && (
            <button
              type="button"
              className={btnGhost}
              onClick={() => void withdraw()}
              disabled={busy}
            >
              {t.poolWithdraw}
            </button>
          )}
        </div>
      </div>
    );
  }

  const placed = entry?.status === 'placed';

  return (
    <form onSubmit={submit} className={cardCls} noValidate>
      <div>
        <h2 className="text-lg font-semibold text-white">{t.poolFormTitle}</h2>
        <p className="mt-1 text-sm text-gray-400">
          {fmt(t.poolFormHint, { needed: '5' })}
        </p>
      </div>

      <div>
        <label htmlFor={pseudoId} className={labelCls}>
          {t.pseudoLabel}
        </label>
        <input
          id={pseudoId}
          className={inputCls}
          value={pseudo}
          maxLength={40}
          autoComplete="nickname"
          onChange={(e) => setPseudo(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={tagId} className={labelCls}>
          {t.battleTagLabel}
        </label>
        <input
          id={tagId}
          className={inputCls}
          value={battleTag}
          placeholder="Pseudo#1234"
          onChange={(e) => setBattleTag(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor={teamSelectId} className={labelCls}>
          {t.poolTeamLabel}
        </label>
        <select
          id={teamSelectId}
          className={inputCls}
          value={teamId}
          disabled={placed}
          onChange={(e) => setTeamId(e.target.value)}
        >
          {view.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
          <option value={NO_TEAM}>{t.poolNoTeam}</option>
        </select>
        <p className="mt-1 text-[11px] text-gray-500">
          {placed ? t.poolTeamLockedHelp : t.poolTeamHelp}
        </p>
      </div>

      {errorMsg && (
        <p className="text-sm text-red-300" role="alert">
          {errorMsg}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={btnPrimary} disabled={busy}>
          {busy ? t.submitting : entry ? t.poolSave : t.poolSubmit}
        </button>
        {entry && (
          <button
            type="button"
            className={btnGhost}
            onClick={() => setEditing(false)}
            disabled={busy}
          >
            {t.poolCancel}
          </button>
        )}
      </div>
    </form>
  );
}
