import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type Props = {
  staff: StaffShape;
};

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

export const getServerSideProps = withStaffPage('admin');

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

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  requests: {
    label: 'Envoyé',
    color: 'bg-blue-600/20 text-blue-300 border-blue-500/30',
  },
  delivered: {
    label: 'Délivré',
    color: 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30',
  },
  opened: {
    label: 'Ouvert',
    color: 'bg-violet-600/20 text-violet-300 border-violet-500/30',
  },
  clicks: {
    label: 'Cliqué',
    color: 'bg-cyan-600/20 text-cyan-300 border-cyan-500/30',
  },
  softBounces: {
    label: 'Soft bounce',
    color: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
  },
  hardBounces: {
    label: 'Hard bounce',
    color: 'bg-red-600/20 text-red-300 border-red-500/30',
  },
  spam: {
    label: 'Spam',
    color: 'bg-red-600/20 text-red-300 border-red-500/30',
  },
  blocked: {
    label: 'Bloqué',
    color: 'bg-red-600/20 text-red-300 border-red-500/30',
  },
  invalid: {
    label: 'Invalide',
    color: 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30',
  },
  deferred: {
    label: 'Différé',
    color: 'bg-amber-600/20 text-amber-300 border-amber-500/30',
  },
};

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

function AdminEmailLogsPage({ staff }: Props) {
  const router = useRouter();
  const { adminFetch, adminFetchJson } = useAdminFetch();

  const [events, setEvents] = useState<BrevoEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [emailFilter, setEmailFilter] = useState('');
  const [eventFilter, setEventFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Pagination
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Test email
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    msg: string;
  } | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (emailFilter.trim()) params.set('email', emailFilter.trim());
      if (eventFilter) params.set('event', eventFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const json = await adminFetchJson<EmailLogsResponse>(
        '/api/admin/email-logs?' + params.toString()
      );
      setEvents(json.events || []);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [
    limit,
    offset,
    emailFilter,
    eventFilter,
    startDate,
    endDate,
    adminFetchJson,
  ]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  function handleFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
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
        setTestResult({ ok: true, msg: `Email envoyé (${json.id || 'ok'})` });
        setTimeout(() => fetchEvents(), 3000);
      } else {
        setTestResult({ ok: false, msg: json.error || 'Échec' });
      }
    } catch {
      setTestResult({ ok: false, msg: 'Erreur réseau' });
    } finally {
      setTestSending(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Logs emails (Brevo)</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              Retour au dashboard admin
            </button>

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Logs emails
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  Historique des emails transactionnels via Brevo
                </p>
              </div>
              <div className="text-xs text-neutral-500 bg-neutral-800/50 px-3 py-2 rounded-xl border border-neutral-700/50">
                300 emails/jour (gratuit)
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
                Réessayer
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
              Envoyer un email de test
            </h2>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <input
                  type="email"
                  placeholder="destinataire@example.com"
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
                Envoyer
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
                  Email
                </label>
                <input
                  type="text"
                  placeholder="destinataire@..."
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={emailFilter}
                  onChange={(e) => setEmailFilter(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                >
                  <option value="">Tous</option>
                  {EVENT_TYPES.map((ev) => (
                    <option key={ev} value={ev}>
                      {EVENT_LABELS[ev]?.label || ev}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-neutral-400 mb-1">
                  Du
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
                  Au
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
                Filtrer
              </button>
            </form>
          </section>

          {/* Events list */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : events.length === 0 ? (
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
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Aucun email trouvé pour ces filtres
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {events.map((ev, i) => {
                  const style = EVENT_LABELS[ev.event] || {
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
                        {ev.from && <span>De : {ev.from}</span>}
                        {ev.messageId && (
                          <span
                            className="font-mono truncate max-w-[200px]"
                            title={ev.messageId}
                          >
                            ID : {ev.messageId.slice(1, 20)}…
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
          </section>

          {/* Pagination */}
          {events.length > 0 && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset(Math.max(0, offset - limit))}
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
                Précédent
              </button>

              <span className="text-neutral-400 text-sm">
                {offset + 1} – {offset + events.length}
              </span>

              <button
                type="button"
                disabled={events.length < limit}
                onClick={() => setOffset(offset + limit)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Suivant
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
        </div>
      </div>
    </>
  );
}

export default AdminEmailLogsPage;
