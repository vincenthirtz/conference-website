// components/admin/communications/TeamMessagesPanel.tsx
//
// Onglet « Équipes » du hub /admin/communications : contacter les équipes
// inscrites au tournoi en cours DANS LEUR SALON TEXTUEL Discord (provisionné
// par le bot sur `team.created`).
//
// Flux en trois temps, volontairement non « one-click » :
//   1. le tableau montre l'état roster réel de chaque équipe (titulaires,
//      comptes jamais connectés, BattleTags manquants, salon provisionné ou non) ;
//   2. « Aperçu » rend le message final PAR ÉQUIPE (dry-run serveur) ;
//   3. « Envoyer » n'est déverrouillé qu'après un aperçu — on ne poste pas dans
//      des salons Discord sans avoir relu ce qui part.
//
// Deux modes : le rappel roster automatique (message personnalisé selon l'état
// de chaque équipe) ou un gabarit libre à variables ({equipe}, {titulaires}…).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import AlertBanner from '@/components/admin/AlertBanner';
import { logger } from '@/utils/logger';
import nsAdminTeamMessages from '@/lib/i18n/locales/admin-fr/adminTeamMessages';

type RosterKind = 'incomplete' | 'complete_with_warnings' | 'complete';

type TeamRow = {
  teamId: string;
  teamName: string;
  discordChannelId: string | null;
  discordRoleId: string | null;
  starters: number;
  substitutes: number;
  missingStarters: number;
  missingBattleTags: number;
  neverLoggedIn: number;
  kind: RosterKind;
};

type TournamentInfo = {
  id: string;
  name: string;
  minPlayers: number;
  startDate: string | null;
  deadline: string | null;
};

type StateResponse = {
  tournament: TournamentInfo | null;
  teams: TeamRow[];
  variables: string[];
  maxLength: number;
};

type PreviewMessage = {
  teamId: string;
  teamName: string;
  kind: RosterKind | 'custom';
  deliverable: boolean;
  content: string;
};

type PostResponse = {
  dryRun: boolean;
  messages: PreviewMessage[];
  sent?: number;
  skipped?: number;
  teams?: Array<{ teamId: string; teamName: string; status: string }>;
};

type Dict = typeof nsAdminTeamMessages.fr;

const ENDPOINT = '/api/admin/team-messages';

function kindBadge(
  kind: RosterKind | 'custom',
  t: Dict
): { label: string; className: string } {
  switch (kind) {
    case 'incomplete':
      return {
        label: t.kindIncomplete,
        className: 'bg-red-600/20 text-red-300 border-red-500/30',
      };
    case 'complete_with_warnings':
      return {
        label: t.kindWarnings,
        className: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
      };
    case 'complete':
      return {
        label: t.kindComplete,
        className: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
      };
    default:
      return {
        label: t.kindCustom,
        className: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
      };
  }
}

export default function TeamMessagesPanel() {
  const t = useAdminT(nsAdminTeamMessages);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson, regenerate } = useIdempotentMutation();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [state, setState] = useState<StateResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [preset, setPreset] = useState<'roster-reminder' | 'custom'>(
    'roster-reminder'
  );
  const [template, setTemplate] = useState('');
  const [mention, setMention] = useState(true);
  const [only, setOnly] = useState<'all' | 'incomplete' | 'needs_attention'>(
    'all'
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [preview, setPreview] = useState<PreviewMessage[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetchJson<StateResponse>(ENDPOINT);
      setState(data);
      setSelected(new Set(data.teams.map((team) => team.teamId)));
    } catch (err) {
      logger.error('[admin/team-messages] load error', err);
      setError(t.loadError);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  // Toute modification du ciblage ou du contenu périme l'aperçu : le bouton
  // d'envoi se re-verrouille tant qu'on n'a pas relu le nouveau rendu.
  const invalidatePreview = useCallback(() => setPreview(null), []);

  const targetIds = useMemo(() => Array.from(selected), [selected]);

  const buildBody = useCallback(
    (dryRun: boolean) =>
      JSON.stringify({
        preset,
        template: preset === 'custom' ? template : undefined,
        teamIds: targetIds,
        mention,
        only,
        dryRun,
      }),
    [preset, template, targetIds, mention, only]
  );

  const runPreview = useCallback(async () => {
    if (preset === 'custom' && !template.trim()) {
      addToast(t.templateRequired, 'error');
      return;
    }
    if (targetIds.length === 0) {
      addToast(t.noTeamSelected, 'error');
      return;
    }
    setBusy(true);
    try {
      const data = await adminFetchJson<PostResponse>(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildBody(true),
      });
      setPreview(data.messages);
      if (data.messages.length === 0) addToast(t.previewEmpty, 'info');
    } catch (err) {
      logger.error('[admin/team-messages] preview error', err);
      addToast(t.previewError, 'error');
    } finally {
      setBusy(false);
    }
  }, [
    adminFetchJson,
    addToast,
    buildBody,
    preset,
    t.noTeamSelected,
    t.previewEmpty,
    t.previewError,
    t.templateRequired,
    targetIds.length,
    template,
  ]);

  const send = useCallback(async () => {
    if (!preview || preview.length === 0) return;
    const deliverable = preview.filter((m) => m.deliverable).length;
    if (deliverable === 0) {
      addToast(t.nothingDeliverable, 'error');
      return;
    }
    const ok = await confirm({
      title: format(t.confirmSend, { count: String(deliverable) }),
      subtitle: t.confirmSendSubtitle,
      variant: 'warning',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const data = await mutateJson<PostResponse>(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: buildBody(false),
      });
      addToast(
        format(t.sendSuccess, {
          sent: String(data.sent ?? 0),
          skipped: String(data.skipped ?? 0),
        }),
        'success'
      );
      setPreview(null);
      regenerate();
    } catch (err) {
      logger.error('[admin/team-messages] send error', err);
      addToast(t.sendError, 'error');
    } finally {
      setBusy(false);
    }
  }, [
    addToast,
    buildBody,
    confirm,
    mutateJson,
    preview,
    regenerate,
    t.confirmSend,
    t.confirmSendSubtitle,
    t.nothingDeliverable,
    t.sendError,
    t.sendSuccess,
  ]);

  const toggleTeam = (teamId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
    invalidatePreview();
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <AlertBanner message={error} variant="error" />;
  if (!state?.tournament) {
    return <AlertBanner message={t.noTournament} variant="info" />;
  }

  const teams = state.teams;
  const unprovisioned = teams.filter((team) => !team.discordChannelId).length;

  return (
    <div className="space-y-6">
      {confirmDialog}
      <header className="space-y-1">
        <h2 className="text-lg font-semibold text-white">{t.heading}</h2>
        <p className="text-sm text-neutral-400">
          {format(t.subtitle, { tournament: state.tournament.name })}
        </p>
      </header>

      {unprovisioned > 0 && (
        <AlertBanner
          message={format(t.unprovisionedWarning, {
            count: String(unprovisioned),
          })}
          variant="warning"
        />
      )}

      {/* --- 1. Ciblage ------------------------------------------------- */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          {t.sectionTargets}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-left text-neutral-400">
                <th className="w-8 py-2" scope="col">
                  <span className="sr-only">{t.colSelect}</span>
                </th>
                <th className="py-2" scope="col">
                  {t.colTeam}
                </th>
                <th className="py-2" scope="col">
                  {t.colRoster}
                </th>
                <th className="py-2" scope="col">
                  {t.colIssues}
                </th>
                <th className="py-2" scope="col">
                  {t.colChannel}
                </th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => {
                const badge = kindBadge(team.kind, t);
                return (
                  <tr
                    key={team.teamId}
                    className="border-t border-neutral-800/70"
                  >
                    <td className="py-2">
                      <input
                        type="checkbox"
                        checked={selected.has(team.teamId)}
                        onChange={() => toggleTeam(team.teamId)}
                        aria-label={format(t.selectTeamAria, {
                          team: team.teamName,
                        })}
                      />
                    </td>
                    <td className="py-2 font-medium text-white">
                      {team.teamName}
                      <span
                        className={`ml-2 rounded border px-1.5 py-0.5 text-xs ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2 text-neutral-300">
                      {team.starters}/{state.tournament?.minPlayers ?? '—'}
                      {team.substitutes > 0 && ` (+${team.substitutes})`}
                    </td>
                    <td className="py-2 text-neutral-400">
                      {team.neverLoggedIn > 0 &&
                        format(t.issueDormant, {
                          count: String(team.neverLoggedIn),
                        })}
                      {team.neverLoggedIn > 0 &&
                        team.missingBattleTags > 0 &&
                        ' · '}
                      {team.missingBattleTags > 0 &&
                        format(t.issueBattleTag, {
                          count: String(team.missingBattleTags),
                        })}
                      {team.neverLoggedIn === 0 &&
                        team.missingBattleTags === 0 &&
                        '—'}
                    </td>
                    <td className="py-2">
                      {team.discordChannelId ? (
                        <span className="text-emerald-400">{t.channelOk}</span>
                      ) : (
                        <span className="text-red-400">{t.channelMissing}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* --- 2. Composition ---------------------------------------------- */}
      <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
          {t.sectionCompose}
        </h3>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="radio"
              name="preset"
              checked={preset === 'roster-reminder'}
              onChange={() => {
                setPreset('roster-reminder');
                invalidatePreview();
              }}
            />
            {t.presetRoster}
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="radio"
              name="preset"
              checked={preset === 'custom'}
              onChange={() => {
                setPreset('custom');
                invalidatePreview();
              }}
            />
            {t.presetCustom}
          </label>
        </div>

        {preset === 'roster-reminder' ? (
          <p className="text-sm text-neutral-400">{t.presetRosterHint}</p>
        ) : (
          <div className="space-y-2">
            <label
              htmlFor="team-message-template"
              className="block text-sm text-neutral-300"
            >
              {t.templateLabel}
            </label>
            <textarea
              id="team-message-template"
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                invalidatePreview();
              }}
              rows={8}
              maxLength={4000}
              className="w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-sm text-neutral-100"
              placeholder={t.templatePlaceholder}
            />
            <p className="text-xs text-neutral-500">
              {t.variablesHint}{' '}
              {state.variables.map((v) => `{${v}}`).join(' · ')}
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={mention}
              onChange={(e) => {
                setMention(e.target.checked);
                invalidatePreview();
              }}
            />
            {t.mentionLabel}
          </label>

          <label className="flex items-center gap-2 text-sm text-neutral-300">
            {t.onlyLabel}
            <select
              value={only}
              onChange={(e) => {
                setOnly(e.target.value as typeof only);
                invalidatePreview();
              }}
              className="rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm"
            >
              <option value="all">{t.onlyAll}</option>
              <option value="needs_attention">{t.onlyNeedsAttention}</option>
              <option value="incomplete">{t.onlyIncomplete}</option>
            </select>
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void runPreview()}
            disabled={busy}
            className="rounded bg-neutral-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? t.working : t.previewButton}
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={busy || !preview || preview.length === 0}
            className="rounded bg-purple-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            title={!preview ? t.sendDisabledHint : undefined}
          >
            {t.sendButton}
          </button>
        </div>
      </section>

      {/* --- 3. Aperçu ---------------------------------------------------- */}
      {preview && (
        <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/50 p-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-400">
            {format(t.sectionPreview, { count: String(preview.length) })}
          </h3>
          {preview.map((msg) => {
            const badge = kindBadge(msg.kind, t);
            return (
              <article
                key={msg.teamId}
                className="rounded border border-neutral-800 bg-neutral-950 p-3"
              >
                <header className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="font-medium text-white">{msg.teamName}</span>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-xs ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {!msg.deliverable && (
                    <span className="text-xs text-red-400">
                      {t.previewNotDeliverable}
                    </span>
                  )}
                </header>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm text-neutral-200">
                  {msg.content}
                </pre>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
