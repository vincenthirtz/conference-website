import { useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminResource } from '@/hooks/useAdminResource';
import AdminListShell from '@/components/admin/AdminListShell';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminEmailLogs'>>;

type BrevoEvent = {
  email: string;
  date: string;
  messageId: string;
  event: string;
  subject: string;
  tag: string;
  from: string;
  templateId: number | null;
};

const EVENT_TYPES = [
  'delivered',
  'opened',
  'clicks',
  'softBounces',
  'hardBounces',
  'requests',
  'spam',
  'blocked',
  'invalid',
  'deferred',
] as const;

const PAGE_LIMIT = 50;

const getEventLabels = (
  t: Dict
): Record<string, { label: string; color: string }> => ({
  requests: {
    label: t.eventRequests,
    color: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
  },
  delivered: {
    label: t.eventDelivered,
    color: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
  },
  opened: {
    label: t.eventOpened,
    color: 'bg-violet-600/20 text-violet-300 border-violet-500/30',
  },
  clicks: {
    label: t.eventClicks,
    color: 'bg-cyan-600/20 text-cyan-300 border-cyan-500/30',
  },
  softBounces: {
    label: t.eventSoftBounces,
    color: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
  },
  hardBounces: {
    label: t.eventHardBounces,
    color: 'bg-red-600/20 text-red-300 border-red-500/30',
  },
  spam: {
    label: t.eventSpam,
    color: 'bg-red-600/20 text-red-300 border-red-500/30',
  },
  blocked: {
    label: t.eventBlocked,
    color: 'bg-red-600/20 text-red-300 border-red-500/30',
  },
  invalid: {
    label: t.eventInvalid,
    color: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
  },
  deferred: {
    label: t.eventDeferred,
    color: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
  },
});

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('fr-FR', {
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

type EmailLogsResponse = { events?: BrevoEvent[] };
type TestEmailResponse = { success?: boolean; id?: string; error?: string };

// Un EMAIL distinct (messageId) agrégeant ses événements Brevo. La vue
// « Messages » affiche une ligne par email (envoi réel) plutôt qu'une ligne
// par événement (une même lettre ouverte 6× = 6 événements mais 1 email).
type EmailMessage = {
  messageId: string;
  email: string;
  subject: string;
  from: string;
  tag: string;
  date: string; // date d'envoi (plus ancien événement du message)
  statuses: Record<string, number>; // type d'événement → nombre
};

// Ordre d'affichage des badges de statut dans la vue « Messages ».
const STATUS_ORDER = [
  'requests',
  'delivered',
  'opened',
  'clicks',
  'softBounces',
  'hardBounces',
  'deferred',
  'spam',
  'blocked',
  'invalid',
];

function groupByMessage(events: BrevoEvent[]): EmailMessage[] {
  const byId = new Map<string, EmailMessage>();
  for (const ev of events) {
    let m = byId.get(ev.messageId);
    if (!m) {
      m = {
        messageId: ev.messageId,
        email: ev.email,
        subject: ev.subject,
        from: ev.from,
        tag: ev.tag,
        date: ev.date,
        statuses: {},
      };
      byId.set(ev.messageId, m);
    }
    m.statuses[ev.event] = (m.statuses[ev.event] || 0) + 1;
    if (!m.subject && ev.subject) m.subject = ev.subject;
    // La date d'envoi = le plus ancien événement (typiquement `requests`).
    if (new Date(ev.date).getTime() < new Date(m.date).getTime()) {
      m.date = ev.date;
    }
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
}

/**
 * "Emails" tab of the merged /admin/logs page: Brevo transactional email
 * delivery events. Admin-only — rendered only when the current staff role is
 * admin or above (see the tabbed page).
 */
export default function EmailLogsPanel() {
  const { adminFetch } = useAdminFetch();
  const t = useAdminT('adminEmailLogs');
  const eventLabels = getEventLabels(t);

  // Vue : « Messages » (1 ligne par email distinct) ou « Événements » (détail
  // Brevo brut, 1 ligne par événement). Par défaut on montre les messages —
  // plus lisible (un email ouvert plusieurs fois ne gonfle pas la liste).
  const [view, setView] = useState<'messages' | 'events'>('messages');

  // Filters
  const [emailFilter, setEmailFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Test email
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  // Événements Brevo : source paginée sans total (l'API ne renvoie pas de
  // count) → `includeTotal: false` ; le bouton « suivant » se désactive quand
  // la page est incomplète (`events.length < PAGE_LIMIT`). Les filtres sont des
  // params serveur réactifs (refetch immédiat à chaque changement, comme avant).
  const {
    data: events,
    loading,
    error: errorMsg,
    refresh: fetchEvents,
    offset,
    resetOffset,
    nextPage,
    prevPage,
  } = useAdminResource<BrevoEvent, EmailLogsResponse>('/api/admin/email-logs', {
    limit: PAGE_LIMIT,
    includeTotal: false,
    params: {
      email: emailFilter.trim(),
      event: eventFilter,
      startDate,
      endDate,
    },
    select: (res) => res.events || [],
  });

  // Vue « Messages » : regroupe les événements de la page courante par email
  // distinct (messageId). Le regroupement porte sur la page chargée ; un même
  // email dont les événements s'étalent sur plusieurs pages peut apparaître sur
  // deux pages — acceptable au vu des volumes filtrés.
  const messages = view === 'messages' ? groupByMessage(events) : [];

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    resetOffset();
    fetchEvents();
  }

  async function sendTestEmail() {
    if (!testTo.trim()) return;
    setTestSending(true);
    setTestResult(null);

    try {
      const res = await adminFetch('/api/admin/test-email', {
        method: 'POST',
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const json: TestEmailResponse = await res.json();
      if (json.success) {
        setTestResult({
          ok: true,
          msg: format(t.toastTestSent, { id: json.id || 'ok' }),
        });
        setTimeout(() => fetchEvents(), 3000);
      } else {
        setTestResult({ ok: false, msg: json.error || t.testFailed });
      }
    } catch {
      setTestResult({ ok: false, msg: t.errorNetwork });
    } finally {
      setTestSending(false);
    }
  }

  return (
    <>
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              {t.heading}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">{t.subtitle}</p>
          </div>
          <div className="text-xs text-neutral-500 bg-neutral-800/50 px-3 py-2 rounded-xl border border-neutral-700/50">
            {t.quota}
          </div>
        </div>
      </div>

      {/* Error */}
      {errorMsg && (
        <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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
          <span className="flex-1">{errorMsg}</span>
          <button
            type="button"
            onClick={() => fetchEvents()}
            className="flex-shrink-0 px-3 py-1 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-medium transition-colors"
          >
            {t.retry}
          </button>
        </div>
      )}

      {/* Test email */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
        <h2 className="text-sm font-semibold text-neutral-300 mb-3 flex items-center gap-2">
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
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
          {t.testHeading}
        </h2>
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[200px]">
            <input
              type="email"
              placeholder={t.testPlaceholder}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendTestEmail()}
            />
          </div>
          <button
            type="button"
            onClick={sendTestEmail}
            disabled={testSending || !testTo.trim()}
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {testSending ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            )}
            {t.testSend}
          </button>
          {testResult && (
            <span
              className={`text-sm px-3 py-2 rounded-xl border ${
                testResult.ok
                  ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-300'
                  : 'bg-red-900/40 border-red-500/50 text-red-300'
              }`}
            >
              {testResult.msg}
            </span>
          )}
        </div>
      </section>

      {/* Filters */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
        <form
          onSubmit={handleFilterSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end"
        >
          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelEmail}
            </label>
            <input
              type="text"
              placeholder={t.placeholderEmail}
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={emailFilter}
              onChange={(e) => setEmailFilter(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelStatus}
            </label>
            <select
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            >
              <option value="">{t.statusAll}</option>
              {EVENT_TYPES.map((ev) => (
                <option key={ev} value={ev}>
                  {eventLabels[ev]?.label || ev}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelFrom}
            </label>
            <input
              type="date"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-400 mb-1">
              {t.labelTo}
            </label>
            <input
              type="date"
              className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition-colors flex items-center justify-center gap-2"
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
          </button>
        </form>
      </section>

      {/* Sélecteur de vue : Messages (1 ligne / email) vs Événements (détail) */}
      <div
        className="mb-4 inline-flex rounded-xl border border-neutral-700/50 bg-neutral-800/50 p-1"
        role="tablist"
        aria-label={t.viewToggleAria}
      >
        <button
          type="button"
          role="tab"
          aria-selected={view === 'messages'}
          onClick={() => setView('messages')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'messages'
              ? 'bg-blue-600 text-white'
              : 'text-neutral-300 hover:text-white'
          }`}
        >
          {t.viewMessages}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === 'events'}
          onClick={() => setView('events')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === 'events'
              ? 'bg-blue-600 text-white'
              : 'text-neutral-300 hover:text-white'
          }`}
        >
          {t.viewEvents}
        </button>
      </div>

      {/* Liste */}
      <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
        <AdminListShell
          loading={loading}
          error={null}
          isEmpty={events.length === 0}
          loadingClassName="py-20"
          emptyTitle={t.empty}
          emptyIcon={
            <svg
              className="w-12 h-12"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          }
        >
          {view === 'messages' && (
            <div className="divide-y divide-neutral-700/50">
              {messages.map((m) => (
                <div
                  key={m.messageId}
                  className="p-4 hover:bg-neutral-700/30 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <span className="text-xs font-mono text-neutral-500 bg-neutral-900/50 px-2 py-1 rounded-lg">
                      {formatDateTime(m.date)}
                    </span>
                    <span
                      className="text-sm font-medium text-white truncate max-w-[240px]"
                      title={m.email}
                    >
                      {m.email}
                    </span>
                  </div>

                  {m.subject && (
                    <p
                      className="text-sm text-neutral-200 mb-2 truncate"
                      title={m.subject}
                    >
                      {m.subject}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-1.5">
                    {STATUS_ORDER.filter((s) => m.statuses[s]).map((s) => {
                      const style = eventLabels[s] || {
                        label: s,
                        color:
                          'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
                      };
                      const count = m.statuses[s];
                      return (
                        <span
                          key={s}
                          className={`px-2 py-0.5 rounded-lg text-xs font-semibold border ${style.color}`}
                        >
                          {style.label}
                          {count > 1 ? ` ×${count}` : ''}
                        </span>
                      );
                    })}
                    {m.tag && (
                      <span className="px-2 py-0.5 rounded-lg bg-neutral-700/50 border border-neutral-600/50 text-xs text-neutral-400">
                        {m.tag}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {view === 'events' && (
          <div className="divide-y divide-neutral-700/50">
            {events.map((ev, i) => {
              const style = eventLabels[ev.event] || {
                label: ev.event,
                color:
                  'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
              };
              return (
                <div
                  key={`${ev.messageId}-${i}`}
                  className="p-4 hover:bg-neutral-700/30 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-neutral-500 bg-neutral-900/50 px-2 py-1 rounded-lg">
                        {formatDateTime(ev.date)}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border ${style.color}`}
                      >
                        {style.label}
                      </span>
                    </div>
                    <span
                      className="text-sm font-medium text-white truncate max-w-[240px]"
                      title={ev.email}
                    >
                      {ev.email}
                    </span>
                  </div>

                  {ev.subject && (
                    <p
                      className="text-sm text-neutral-200 mb-1 truncate"
                      title={ev.subject}
                    >
                      {ev.subject}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                    {ev.from && (
                      <span>{format(t.from, { from: ev.from })}</span>
                    )}
                    {ev.messageId && (
                      <span
                        className="font-mono truncate max-w-[200px]"
                        title={ev.messageId}
                      >
                        {format(t.idLabel, {
                          id: ev.messageId.slice(1, 20),
                        })}
                      </span>
                    )}
                    {ev.tag && (
                      <span className="px-2 py-0.5 rounded-lg bg-neutral-700/50 border border-neutral-600/50">
                        {ev.tag}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </AdminListShell>
      </section>

      {/* Pagination */}
      {events.length > 0 && (
        <div className="flex justify-between items-center mt-6">
          <button
            type="button"
            disabled={offset === 0}
            onClick={prevPage}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          </button>

          <span className="text-neutral-400 text-sm">
            {view === 'messages'
              ? format(t.messagesCount, { count: messages.length })
              : `${offset + 1} – ${offset + events.length}`}
          </span>

          <button
            type="button"
            disabled={events.length < PAGE_LIMIT}
            onClick={nextPage}
            className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          </button>
        </div>
      )}
    </>
  );
}
