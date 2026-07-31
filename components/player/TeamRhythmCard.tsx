// components/player/TeamRhythmCard.tsx
//
// « Rythme d'équipe » (N1) — la grille de disponibilité RÉCURRENTE du roster.
//
// Deux raisons d'être, dans cet ordre :
//
//   1. C'est le premier objet auquel un membre NON capitaine peut contribuer.
//      Roster, scrims, demandes, inscriptions : tout est réservé à la gestion
//      (à raison). Une équipe se résumait donc à une personne qui vient et
//      quatre qui ne viennent jamais. Ici, chacune peint ses créneaux.
//
//   2. Ça vaut à une équipe SEULE. Sans aucune autre équipe sur la plateforme,
//      une équipe apprend déjà « on est au complet le mardi 21 h, pas le
//      jeudi » — un fait qu'elle n'a nulle part ailleurs.
//
// La grille est peinte au pointeur (clic ou glisser), la couleur dit COMBIEN de
// coéquipières sont libres, et le noyau (effectif requis atteint) se transforme
// en annonce de scrim en un clic — les créneaux annoncés sont alors des
// instants réels, projetés depuis l'habitude.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import {
  RHYTHM_WEEKDAYS,
  rhythmMinutesOfDay,
  rhythmSlotKey,
} from '../../utils/teams/teamRhythm';
import type { TeamRhythmResponse } from '../../pages/api/player/team-rhythm';
import { logger } from '../../utils/logger';

/** Lundi 1er janvier 2024 — base neutre pour dériver les noms de jours. */
const REFERENCE_MONDAY = Date.UTC(2024, 0, 1);

/** Clé locale du créneau de suggestion refermé (N6). */
const SUGGESTION_KEY = 'team-rhythm-suggestion-dismissed';

function fmtMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, '0')}`;
}

/** Fuseau du navigateur — c'est celui dans lequel la personne raisonne. */
function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Paris';
  } catch {
    return 'Europe/Paris';
  }
}

/** Intensité de la case selon le nombre de coéquipières libres. */
function cellTone(count: number, threshold: number, mine: boolean): string {
  const base = mine ? 'ring-1 ring-inset ring-white/70 ' : '';
  if (count >= threshold) return `${base}bg-emerald-500/70`;
  if (count >= 3) return `${base}bg-emerald-500/40`;
  if (count === 2) return `${base}bg-sky-500/35`;
  if (count === 1) return `${base}bg-sky-500/20`;
  return `${base}bg-white/5`;
}

export default function TeamRhythmCard() {
  const t = useT('teamRhythm');
  const locale = useLocale();
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();

  const [data, setData] = useState<TeamRhythmResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [announcing, setAnnouncing] = useState(false);
  /**
   * Suggestion refermée (N6). On mémorise LE CRÉNEAU, pas un booléen : refermer
   * « mercredi 21 h » ne doit pas masquer la suggestion suivante quand le
   * rythme de l'équipe change.
   */
  const [dismissedSlot, setDismissedSlot] = useState<string | null>(null);

  // Mode de peinture en cours : on décide à l'appui (ajout ou retrait) et on
  // garde le même mode pendant tout le glisser — sinon un aller-retour du
  // pointeur ferait clignoter les cases.
  const paintMode = useRef<'add' | 'remove' | null>(null);

  const load = useCallback(async () => {
    try {
      const payload = await adminFetchJson<TeamRhythmResponse>(
        `/api/player/team-rhythm?tz=${encodeURIComponent(detectTimezone())}`,
        { skipAuthRedirect: true }
      );
      setData(payload);
      setSelected(new Set(payload.mySlots));
      setDirty(false);
    } catch (err) {
      logger.error('[TeamRhythmCard] load error', err);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    try {
      setDismissedSlot(window.localStorage.getItem(SUGGESTION_KEY));
    } catch {
      setDismissedSlot(null);
    }
  }, []);

  useEffect(() => {
    const stop = () => {
      paintMode.current = null;
    };
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, []);

  const minutes = useMemo(() => rhythmMinutesOfDay(), []);

  const dayLabels = useMemo(
    () =>
      RHYTHM_WEEKDAYS.map((weekday) =>
        new Date(REFERENCE_MONDAY + (weekday - 1) * 86_400_000).toLocaleString(
          locale,
          { weekday: 'short', timeZone: 'UTC' }
        )
      ),
    [locale]
  );

  const applyPaint = (key: string, mode: 'add' | 'remove') => {
    setSelected((prev) => {
      const has = prev.has(key);
      if (mode === 'add' && has) return prev;
      if (mode === 'remove' && !has) return prev;
      const next = new Set(prev);
      if (mode === 'add') next.add(key);
      else next.delete(key);
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await adminFetchJson('/api/player/team-rhythm', {
        method: 'PUT',
        body: JSON.stringify({
          slots: Array.from(selected),
          timezone: detectTimezone(),
        }),
      });
      addToast(t.saved, 'success');
      await load();
    } catch (err) {
      logger.error('[TeamRhythmCard] save error', err);
      addToast(t.saveError, 'error');
    } finally {
      setSaving(false);
    }
  };

  const announce = async (slots: string[]) => {
    if (slots.length === 0) return;
    setAnnouncing(true);
    try {
      await adminFetchJson('/api/teams/scrim-searches', {
        method: 'POST',
        body: JSON.stringify({ slots }),
      });
      addToast(t.announced, 'success');
      await load();
    } catch (err) {
      logger.error('[TeamRhythmCard] announce error', err);
      addToast(t.announceError, 'error');
    } finally {
      setAnnouncing(false);
    }
  };

  const dismissSuggestion = () => {
    if (!data?.suggestion) return;
    setDismissedSlot(data.suggestion.slot);
    try {
      window.localStorage.setItem(SUGGESTION_KEY, data.suggestion.slot);
    } catch {
      // Pas de localStorage (navigation privée) : la suggestion réapparaîtra.
    }
  };

  // Sans équipe, il n'y a pas de rythme à déclarer : la carte disparaît plutôt
  // que d'afficher une grille inerte.
  if (!data || !data.teamId) return null;

  const heatmap = data.heatmap;

  const slotLabel = (key: string) => {
    const [weekday, min] = key.split('-').map(Number);
    return `${dayLabels[weekday - 1]} ${fmtMinutes(min)}`;
  };

  // Une seule suggestion, et seulement si elle n'a pas été refermée. Refermer
  // mémorise LE CRÉNEAU : la suivante réapparaîtra d'elle-même.
  const suggestion =
    data.suggestion && data.suggestion.slot !== dismissedSlot
      ? data.suggestion
      : null;

  return (
    <section
      aria-labelledby="team-rhythm-heading"
      className="rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            id="team-rhythm-heading"
            className="text-lg font-semibold text-white"
          >
            {t.title}
          </h2>
          <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>
        </div>
        <p className="text-xs text-gray-500">
          {format(t.declaredCount, {
            declared: data.declaredCount,
            total: data.memberCount,
          })}
        </p>
      </div>

      {/* Suggestion d'entraînement (N6) — la seule information du rythme qui
          fasse AGIR : « vous êtes au complet » constate, « et vous n'y jouez
          jamais » propose. Une seule à la fois, refermable. */}
      {suggestion && (
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-100">
              {format(
                suggestion.playedCount === 0
                  ? t.suggestionNeverPlayed
                  : t.suggestionRarelyPlayed,
                {
                  slot: slotLabel(suggestion.slot),
                  count: suggestion.availableCount,
                  played: suggestion.playedCount,
                }
              )}
            </p>
            <p className="mt-0.5 text-xs text-amber-200/80">
              {t.suggestionWhy}
            </p>
            {data.canAnnounce && data.suggestionSlots.length > 0 && (
              <button
                type="button"
                onClick={() => void announce(data.suggestionSlots)}
                disabled={announcing}
                className="mt-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-amber-400 disabled:opacity-40"
              >
                {t.suggestionAnnounceCta}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={dismissSuggestion}
            aria-label={t.suggestionDismiss}
            title={t.suggestionDismiss}
            className="flex-shrink-0 rounded-full p-1.5 text-amber-200/70 transition hover:bg-white/10 hover:text-white"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[420px] border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="w-12" />
              {dayLabels.map((label, i) => (
                <th
                  key={RHYTHM_WEEKDAYS[i]}
                  scope="col"
                  className="pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {minutes.map((min) => (
              <tr key={min}>
                <th
                  scope="row"
                  className="pr-2 text-right align-middle text-[11px] font-normal text-gray-500"
                >
                  {fmtMinutes(min)}
                </th>
                {RHYTHM_WEEKDAYS.map((weekday, i) => {
                  const key = rhythmSlotKey(weekday, min);
                  const cell = heatmap[key];
                  const count = cell?.count ?? 0;
                  const mine = selected.has(key);
                  const names = (cell?.userIds ?? [])
                    .map((id) => data.memberNames[id])
                    .filter(Boolean)
                    .join(', ');
                  return (
                    <td key={weekday} className="p-0">
                      <button
                        type="button"
                        aria-pressed={mine}
                        aria-label={`${dayLabels[i]} ${fmtMinutes(min)} — ${format(
                          t.cellAvailable,
                          { count }
                        )}`}
                        title={names || undefined}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          paintMode.current = mine ? 'remove' : 'add';
                          applyPaint(key, paintMode.current);
                        }}
                        onPointerEnter={() => {
                          if (paintMode.current) {
                            applyPaint(key, paintMode.current);
                          }
                        }}
                        className={`h-6 w-full rounded transition ${cellTone(
                          count,
                          data.threshold,
                          mine
                        )} hover:brightness-125`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold transition hover:bg-blue-500 disabled:opacity-40"
        >
          {saving ? t.saving : t.saveCta}
        </button>
        <span className="text-xs text-gray-500">{data.referenceTimezone}</span>
      </div>

      {/* Le noyau : la seule information que l'équipe ne pouvait avoir nulle
          part ailleurs. Masqué tant qu'il n'y a rien à dire. */}
      <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
          {format(t.coreTitle, { threshold: data.threshold })}
        </p>
        {data.coreSlots.length === 0 ? (
          <p className="mt-1 text-sm text-gray-500">{t.coreEmpty}</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-emerald-200">
              {data.coreSlots.map(slotLabel).join(' · ')}
            </p>
            {data.canAnnounce && data.suggestedSlots.length > 0 && (
              <button
                type="button"
                onClick={() => void announce(data.suggestedSlots)}
                disabled={announcing}
                className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold transition hover:bg-emerald-500 disabled:opacity-40"
              >
                {format(t.announceCta, {
                  count: data.suggestedSlots.length,
                })}
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}
