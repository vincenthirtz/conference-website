import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import {
  PLAYER_ACTION_OPTIONS,
  BOT_EVENT_OPTIONS,
  OUTBOX_STATUSES,
  type DiscordLogRow,
  type DiscordLogSource,
  type OutboxStatus,
} from '@/utils/discordLogs';

import { logger } from '../../../utils/logger';
import nsAdminDiscordLogs from '@/lib/i18n/locales/admin-fr/adminDiscordLogs';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminDiscordLogs.fr;

type DiscordLogsApiResponse = {
  logs: DiscordLogRow[];
  total: number | null;
};

const DATE_LOCALE: Record<'fr' | 'en', string> = {
  fr: 'fr-FR',
  en: 'en-GB',
};

function formatDateTime(iso: string, locale: string) {
  try {
    return new Date(iso).toLocaleString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// Deep-links depuis entity_type + entity_id (source 'player' uniquement :
// l'outbox n'a pas d'entité, elle porte son event_id).
const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  match: (id) => `/admin/matches/${id}`,
  team: (id) => `/admin/teams/${id}`,
  tournament: (id) => `/admin/tournament/${id}/dashboard`,
};

function shortId(id: string | null | undefined) {
  if (!id) return '';
  if (id.length <= 10) return id;
  return id.slice(0, 4) + '…' + id.slice(-4);
}

const STATUS_TONE: Record<OutboxStatus, ChipTone> = {
  pending: 'warn',
  delivered: 'ok',
  failed: 'err',
};

function statusLabel(status: OutboxStatus, t: Dict): string {
  if (status === 'delivered') return t.statusDelivered;
  if (status === 'failed') return t.statusFailed;
  return t.statusPending;
}

const INPUT_CLASS =
  'w-full px-3 py-2.5 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] focus:border-[var(--or,#b467d1)] focus:outline-none text-sm';

/**
 * "Discord" tab of the merged /admin/logs page.
 *
 * Two directions of the same bot ↔ site flow, switchable via a segmented
 * control and served by GET /api/admin/discord-logs :
 *   - `player` : what players did FROM Discord (`bot_player_actions`)
 *   - `event`  : what the site asked the bot to do IN Discord, with delivery
 *     status (`bot_event_outbox`) — a failed row is an announcement that never
 *     reached the server.
 */
export default function DiscordLogsPanel() {
  const { adminFetch } = useAdminFetch();
  const t = useAdminT(nsAdminDiscordLogs);
  const { lang } = useLang();
  const dateLocale = DATE_LOCALE[lang];

  const [source, setSource] = useState<DiscordLogSource>('player');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Filtres réactifs (refetch immédiat), alignés sur StaffLogsPanel.
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [entityType, setEntityType] = useState('');
  const [actorDiscordUserId, setActorDiscordUserId] = useState('');
  const [targetDiscordUserId, setTargetDiscordUserId] = useState('');

  // Filtres appliqués au submit (recherche + plage de dates).
  const [search, setSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [appliedFrom, setAppliedFrom] = useState('');
  const [appliedTo, setAppliedTo] = useState('');

  // Les filtres propres à une source ne sont PAS envoyés sur l'autre : ils
  // sont remis à zéro au changement de source (cf. handleSourceChange), et le
  // param est omis ici pour rester lisible côté réseau.
  const currentFilters = useMemo<Record<string, string>>(
    () => ({
      source,
      action: action.trim(),
      ...(source === 'event'
        ? { status }
        : {
            entityType: entityType.trim(),
            actorDiscordUserId: actorDiscordUserId.trim(),
            targetDiscordUserId: targetDiscordUserId.trim(),
          }),
      search: appliedSearch.trim(),
      from: appliedFrom,
      to: appliedTo,
    }),
    [
      source,
      action,
      status,
      entityType,
      actorDiscordUserId,
      targetDiscordUserId,
      appliedSearch,
      appliedFrom,
      appliedTo,
    ]
  );

  const {
    data: logs,
    total,
    loading,
    error: errorMsg,
    offset,
    limit,
    setOffset,
    resetOffset,
  } = useAdminResource<DiscordLogRow, DiscordLogsApiResponse>(
    '/api/admin/discord-logs',
    {
      limit: 100,
      params: currentFilters,
      select: (res) => res.logs || [],
    }
  );

  function handleSourceChange(next: DiscordLogSource) {
    if (next === source) return;
    setSource(next);
    // `action` liste des valeurs différentes selon la source (slug d'action vs
    // nom d'event) : le garder produirait une liste vide et incompréhensible.
    setAction('');
    setStatus('');
    setEntityType('');
    setActorDiscordUserId('');
    setTargetDiscordUserId('');
    resetOffset();
  }

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(search);
    setAppliedFrom(fromDate);
    setAppliedTo(toDate);
    resetOffset();
  }

  // Export CSV : passe par adminFetch (Bearer) — un window.open() perdrait
  // l'en-tête d'auth et prendrait un 401. fetch → blob → ancre.
  async function handleExportCsv() {
    if (exporting) return;
    setExportError(null);
    setExporting(true);

    const params = new URLSearchParams();
    params.set('format', 'csv');
    for (const [key, value] of Object.entries(currentFilters)) {
      if (value) params.set(key, value);
    }

    try {
      const res = await adminFetch(
        `/api/admin/discord-logs?${params.toString()}`
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = `discord-logs-${source}-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (e) {
      logger.error('Discord logs CSV export failed', e);
      setExportError(t.exportError);
    } finally {
      setExporting(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[family-name:var(--fd)] text-3xl md:text-4xl font-extrabold tracking-tight [font-stretch:75%]">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {source === 'event' ? t.subtitleEvent : t.subtitlePlayer}
              {' · '}
              {total !== null
                ? format(
                    total > 1 ? t.countActions_other : t.countActions_one,
                    { count: total }
                  )
                : t.loading}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              role="group"
              aria-label={t.sourceAriaLabel}
              className="inline-flex rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-1"
            >
              {(
                [
                  ['player', t.sourcePlayer],
                  ['event', t.sourceEvent],
                ] as [DiscordLogSource, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={source === value}
                  onClick={() => handleSourceChange(value)}
                  className={`px-4 py-2 rounded-[3px] text-sm font-medium transition-colors ${
                    source === value
                      ? 'bg-[rgba(180,103,209,.18)] text-[var(--or-200,#eec4ff)]'
                      : 'text-neutral-300 hover:bg-neutral-700/50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <AdminButton
              variant="secondary"
              size="sm"
              onClick={handleExportCsv}
              disabled={exporting}
            >
              {exporting ? (
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
              )}
              {exporting ? t.exporting : t.exportCsv}
            </AdminButton>

            <div className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-3 py-2 text-xs text-neutral-500">
              {t.sortedByDate}
            </div>
          </div>
        </div>
      </div>

      {(errorMsg || exportError) && (
        <div className="mb-6 rounded-[var(--r-card,14px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] text-[#ffc2c2] px-4 py-3 text-sm flex items-center gap-2">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          {errorMsg || exportError}
        </div>
      )}

      {/* Filters */}
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6 mb-6">
        <form
          onSubmit={handleFilterSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4 items-end"
        >
          <div>
            <label
              className="block text-sm text-neutral-400 mb-1"
              htmlFor="discord-logs-action"
            >
              {source === 'event' ? t.labelEvent : t.labelAction}
            </label>
            <select
              id="discord-logs-action"
              className={INPUT_CLASS}
              value={action}
              onChange={(e) => setAction(e.target.value)}
            >
              <option value="">
                {source === 'event' ? t.allEvents : t.allActions}
              </option>
              {(source === 'event'
                ? BOT_EVENT_OPTIONS
                : PLAYER_ACTION_OPTIONS
              ).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {source === 'event' ? (
            <div>
              <label
                className="block text-sm text-neutral-400 mb-1"
                htmlFor="discord-logs-status"
              >
                {t.labelStatus}
              </label>
              <select
                id="discord-logs-status"
                className={INPUT_CLASS}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">{t.allStatuses}</option>
                {OUTBOX_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s, t)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <>
              <div>
                <label
                  className="block text-sm text-neutral-400 mb-1"
                  htmlFor="discord-logs-entity-type"
                >
                  {t.labelEntityType}
                </label>
                <input
                  id="discord-logs-entity-type"
                  type="text"
                  placeholder={t.placeholderEntityType}
                  className={INPUT_CLASS}
                  value={entityType}
                  onChange={(e) => setEntityType(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="block text-sm text-neutral-400 mb-1"
                  htmlFor="discord-logs-actor"
                >
                  {t.labelActor}
                </label>
                <input
                  id="discord-logs-actor"
                  type="text"
                  inputMode="numeric"
                  placeholder={t.placeholderDiscordId}
                  className={`${INPUT_CLASS} font-mono`}
                  value={actorDiscordUserId}
                  onChange={(e) => setActorDiscordUserId(e.target.value)}
                />
              </div>

              <div>
                <label
                  className="block text-sm text-neutral-400 mb-1"
                  htmlFor="discord-logs-target"
                >
                  {t.labelTarget}
                </label>
                <input
                  id="discord-logs-target"
                  type="text"
                  inputMode="numeric"
                  placeholder={t.placeholderDiscordId}
                  className={`${INPUT_CLASS} font-mono`}
                  value={targetDiscordUserId}
                  onChange={(e) => setTargetDiscordUserId(e.target.value)}
                />
              </div>
            </>
          )}

          <div>
            <label
              className="block text-sm text-neutral-400 mb-1"
              htmlFor="discord-logs-search"
            >
              {t.labelSearch}
            </label>
            <input
              id="discord-logs-search"
              type="text"
              placeholder={t.placeholderSearch}
              className={INPUT_CLASS}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-sm text-neutral-400 mb-1"
              htmlFor="discord-logs-from"
            >
              {t.labelFrom}
            </label>
            <input
              id="discord-logs-from"
              type="date"
              className={INPUT_CLASS}
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>

          <div>
            <label
              className="block text-sm text-neutral-400 mb-1"
              htmlFor="discord-logs-to"
            >
              {t.labelTo}
            </label>
            <input
              id="discord-logs-to"
              type="date"
              className={INPUT_CLASS}
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>

          <div className="flex gap-2">
            <AdminButton
              variant="primary"
              size="sm"
              type="submit"
              className="flex-1 justify-center"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
              {t.filter}
            </AdminButton>
          </div>
        </form>
      </section>

      {/* Liste */}
      <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--or,#b467d1)] rounded-full animate-spin" />
          </div>
        ) : logs.length === 0 ? (
          <div className="text-center py-20 text-neutral-400">
            <svg
              className="w-12 h-12 mx-auto mb-4 text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {t.empty}
          </div>
        ) : (
          <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
            {logs.map((log) => (
              <div
                key={log.id}
                className="p-4 hover:bg-neutral-700/30 transition-colors"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-mono text-neutral-500 rounded-[3px] bg-[var(--s2,#1d1520)] px-2 py-1">
                      {formatDateTime(log.created_at, dateLocale)}
                    </span>
                    <Chip tone="brand" title={log.action}>
                      {log.action_label}
                    </Chip>
                    {/* Slug brut conservé, discret, pour le debug / le grep. */}
                    {log.action_label !== log.action && (
                      <span className="text-[10px] font-mono text-neutral-600">
                        {log.action}
                      </span>
                    )}
                    {log.entity_type && (
                      <span className="rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] px-2 py-0.5 font-mono text-xs text-neutral-300">
                        {log.entity_type}
                        {log.entity_id ? ` #${shortId(log.entity_id)}` : ''}
                      </span>
                    )}
                    {log.status && (
                      <Chip tone={STATUS_TONE[log.status]}>
                        {statusLabel(log.status, t)}
                      </Chip>
                    )}
                    {log.status === 'failed' && log.push_attempts ? (
                      <span className="text-[10px] text-neutral-500">
                        {format(t.attempts, { count: log.push_attempts })}
                      </span>
                    ) : null}
                  </div>

                  {log.actor && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-neutral-500">{t.by}</span>
                      <span className="font-medium text-neutral-200">
                        {log.actor.discordUsername ||
                          log.actor.discordUserId ||
                          shortId(log.actor.authUserId)}
                      </span>
                      {log.target && (
                        <>
                          <span className="text-neutral-500">
                            → {t.targetPrefix}
                          </span>
                          <span className="font-medium text-neutral-200">
                            {log.target.discordUsername ||
                              log.target.discordUserId ||
                              shortId(log.target.authUserId)}
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {log.last_push_error && (
                  <p className="mb-2 text-xs text-red-300 font-mono break-words">
                    {log.last_push_error}
                  </p>
                )}

                {log.delivered_at && (
                  <p className="mb-2 text-[10px] text-neutral-500">
                    {format(t.deliveredAt, {
                      date: formatDateTime(log.delivered_at, dateLocale),
                    })}
                  </p>
                )}

                <div className="flex flex-wrap items-start justify-between gap-3">
                  {log.payload != null &&
                  !(
                    typeof log.payload === 'object' &&
                    Object.keys(log.payload as object).length === 0
                  ) ? (
                    <details className="text-xs text-neutral-400 min-w-0 flex-1">
                      <summary className="cursor-pointer select-none hover:text-neutral-200 transition-colors">
                        {t.detailsPayload}
                      </summary>
                      <pre className="mt-2 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] p-3 text-[11px] leading-relaxed overflow-auto max-h-64 whitespace-pre-wrap break-words">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    <span />
                  )}

                  {log.entity_type &&
                    log.entity_id &&
                    ENTITY_ROUTES[log.entity_type] && (
                      <Link
                        href={ENTITY_ROUTES[log.entity_type](log.entity_id)}
                        className="text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1 text-xs shrink-0"
                      >
                        <svg
                          className="w-3 h-3"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                          />
                        </svg>
                        {log.entity_type}
                      </Link>
                    )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Pagination */}
      {logs.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <AdminButton
            variant="ghost"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            {t.previous}
          </AdminButton>

          <span className="text-neutral-400 text-sm">
            {offset + 1} – {offset + logs.length}
            {total ? format(t.paginationTotal, { total }) : ''}
          </span>

          <AdminButton
            variant="ghost"
            size="sm"
            disabled={total !== null && offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
          >
            {t.next}
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </AdminButton>
        </div>
      )}
    </>
  );
}
