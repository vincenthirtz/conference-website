// components/admin/tournament/MvpPublicLaunch.tsx
// « Lancer un vote du public » — la section de StatsMvpPanel (vote du public)
// qui ouvre le vote d'un match à la main.
//
// LES MATCHS DU JOUR D'ABORD. L'API rend tout le tournoi — en cours, puis
// terminés du plus récent au plus ancien, puis à venir : le soir des finales
// (2026-10-23), les deux affiches du jour arrivaient sous toute la saison
// jouée. La liste montre donc le jour même (heure de Paris), dans l'ordre du
// programme ; « Tous les matchs du tournoi » rend le reste. Un jour sans match,
// tout le tournoi d'emblée.

import { useMemo, useState } from 'react';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { getWallClockParts, SITE_TIMEZONE } from '@/utils/timezone';
import nsAdminTournamentMvpVotes from '@/lib/i18n/locales/admin-fr/adminTournamentMvpVotes';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanFaint,
  rubanFormInput,
  rubanMuted,
  rubanStrong,
} from '@/features/admin/_shared/ui/ruban';

/** Match sans vote du public : on peut le lancer à la main. */
export type OpenableMatch = {
  id: string;
  /** pending · ongoing · finished (le vote du public s'ouvre sur les trois). */
  status?: string | null;
  roundName: string | null;
  scheduledAt: string | null;
  team1Name: string | null;
  team2Name: string | null;
};

/**
 * Les matchs DU JOUR (heure de Paris), dans l'ordre du programme. Un match
 * encore en cours reste, même commencé la veille. PURE.
 */
export function openableOfDay<
  T extends { status?: string | null; scheduledAt: string | null },
>(list: T[], now: Date): T[] {
  const today = getWallClockParts(now, SITE_TIMEZONE).date;
  const at = (m: T) => Date.parse(m.scheduledAt ?? '');
  return list
    .filter((m) => {
      if (m.status === 'ongoing') return true;
      const ms = at(m);
      return (
        Number.isFinite(ms) &&
        getWallClockParts(new Date(ms), SITE_TIMEZONE).date === today
      );
    })
    .sort((a, b) => (at(a) || 0) - (at(b) || 0));
}

export default function MvpPublicLaunch({
  openable,
  busy,
  fmtDate,
  onOpen,
}: {
  openable: OpenableMatch[];
  busy: boolean;
  fmtDate: (iso: string) => string;
  /** Ouvre le vote ; `true` si c'est fait (le choix se vide alors). */
  onOpen: (matchId: string) => Promise<boolean>;
}) {
  const t = useAdminT(nsAdminTournamentMvpVotes);
  // Un seul état pour le formulaire : le match choisi, et la liste complète.
  const [form, setForm] = useState({ matchId: '', showAll: false });

  const today = useMemo(() => openableOfDay(openable, new Date()), [openable]);
  const shown = form.showAll || today.length === 0 ? openable : today;
  // Le match choisi doit être DANS la liste affichée : revenir au jour même
  // ne doit pas laisser lancer un match devenu invisible.
  const selected = shown.some((m) => m.id === form.matchId) ? form.matchId : '';

  return (
    <section className={rubanCardPadded}>
      <h3 className={rubanStrong}>{t.openTitle}</h3>
      <p className={`mt-1 text-xs ${rubanMuted}`}>{t.openHelp}</p>
      {openable.length === 0 ? (
        <p className={`mt-3 text-sm ${rubanFaint}`}>{t.openNone}</p>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-3">
          {today.length === 0 && (
            <p className={`w-full text-xs ${rubanFaint}`}>{t.openNoneToday}</p>
          )}
          <label className={`text-xs ${rubanMuted}`}>
            {t.openMatchLabel}
            <select
              className={`mt-1 block !w-auto ${rubanFormInput}`}
              value={selected}
              onChange={(e) => setForm({ ...form, matchId: e.target.value })}
            >
              <option value="">—</option>
              {shown.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.status === 'ongoing'
                    ? `${t.openStateOngoing} · `
                    : m.status === 'pending'
                      ? `${t.openStateUpcoming} · `
                      : ''}
                  {m.team1Name ?? t.tbd} {t.vs} {m.team2Name ?? t.tbd}
                  {m.roundName ? ` · ${m.roundName}` : ''}
                  {m.scheduledAt ? ` · ${fmtDate(m.scheduledAt)}` : ''}
                </option>
              ))}
            </select>
          </label>
          <AdminButton
            variant="primary"
            size="sm"
            disabled={busy || !selected}
            onClick={async () => {
              if (await onOpen(selected)) setForm({ ...form, matchId: '' });
            }}
          >
            {t.openCta}
          </AdminButton>
          {today.length > 0 && today.length < openable.length && (
            <label
              className={`flex items-center gap-2 self-center text-xs ${rubanMuted}`}
            >
              <input
                type="checkbox"
                checked={form.showAll}
                onChange={(e) =>
                  setForm({ ...form, showAll: e.target.checked })
                }
              />
              {format(t.openShowAll, { count: openable.length })}
            </label>
          )}
        </div>
      )}
    </section>
  );
}
