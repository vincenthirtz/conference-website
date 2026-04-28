// pages/admin/support/index.tsx
// Admin: list + manage support tickets (litiges, comportement, technique, autre).

import { useEffect, useState, useCallback } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import type { StaffProps } from '@/types/admin';
import { useUrlFilters } from '@/utils/useUrlFilters';

type Severity = 'low' | 'medium' | 'high';
type Category = 'dispute' | 'behavior' | 'technical' | 'other';
type Status = 'open' | 'in_progress' | 'resolved' | 'closed';

type Ticket = {
  id: string;
  tournament_id: string | null;
  reporter_name: string | null;
  reporter_email: string | null;
  is_anonymous: boolean;
  category: Category;
  severity: Severity;
  subject: string | null;
  message: string;
  status: Status;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
  updated_at: string;
};

const FILTER_KEYS = ['status', 'severity', 'category'] as const;

const CATEGORY_LABEL: Record<Category, string> = {
  dispute: '⚖️ Litige',
  behavior: '🚨 Safety',
  technical: '🛠️ Technique',
  other: '📬 Autre',
};

const STATUS_LABEL: Record<Status, string> = {
  open: 'Ouvert',
  in_progress: 'En cours',
  resolved: 'Résolu',
  closed: 'Fermé',
};

function formatDateFr(value: string): string {
  try {
    return new Date(value).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Paris',
    });
  } catch {
    return value;
  }
}

function severityBadge(severity: Severity): string {
  switch (severity) {
    case 'high':
      return 'bg-red-700/30 text-red-200 border-red-500/40';
    case 'medium':
      return 'bg-amber-700/30 text-amber-200 border-amber-500/40';
    default:
      return 'bg-blue-700/30 text-blue-200 border-blue-500/40';
  }
}

function statusBadge(status: Status): string {
  switch (status) {
    case 'open':
      return 'bg-red-600/20 text-red-200 border-red-500/40';
    case 'in_progress':
      return 'bg-amber-600/20 text-amber-200 border-amber-500/40';
    case 'resolved':
      return 'bg-emerald-600/20 text-emerald-200 border-emerald-500/40';
    case 'closed':
      return 'bg-neutral-600/20 text-neutral-300 border-neutral-500/40';
  }
}

export const getServerSideProps = withStaffPage('manager');

function AdminSupportPage(_: StaffProps) {
  const { addToast } = useToast();
  const { filters, setFilters } = useUrlFilters(FILTER_KEYS);

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [updating, setUpdating] = useState(false);

  const status = filters.status ?? '';
  const severity = filters.severity ?? '';
  const category = filters.category ?? '';

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (severity) params.set('severity', severity);
    if (category) params.set('category', category);
    try {
      const res = await fetch(`/api/admin/support/tickets?${params.toString()}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      setTickets(json.tickets || []);
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [status, severity, category]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  function openDetail(t: Ticket) {
    setSelected(t);
    setResolutionNote(t.resolution_note || '');
  }

  async function updateStatus(newStatus: Status, note?: string) {
    if (!selected) return;
    setUpdating(true);
    try {
      const body: Record<string, unknown> = { status: newStatus };
      if (note !== undefined) body.resolution_note = note;
      const res = await fetch(`/api/admin/support/tickets/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      addToast('Ticket mis à jour', 'success');
      setSelected(json.ticket);
      await fetchTickets();
    } catch (err) {
      addToast((err as Error).message, 'error');
    } finally {
      setUpdating(false);
    }
  }

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'open').length,
    high: tickets.filter((t) => t.severity === 'high' && t.status !== 'resolved' && t.status !== 'closed').length,
    resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed').length,
  };

  return (
    <>
      <Head>
        <title>Admin – Support</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <div className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">Tickets de support</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Litiges, safety, technique. Les sévérités HAUTES déclenchent un ping immédiat de la modération sur Discord.
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <Stat label="Tickets" value={stats.total} />
            <Stat label="Ouverts" value={stats.open} accent="red" />
            <Stat label="Haute sévérité (actifs)" value={stats.high} accent="amber" />
            <Stat label="Résolus / fermés" value={stats.resolved} accent="emerald" />
          </div>

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-4 mb-4 flex flex-wrap gap-3">
            <select
              className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
              value={status}
              onChange={(e) => setFilters({ status: e.target.value || null })}
            >
              <option value="">Tous statuts</option>
              <option value="open">Ouvert</option>
              <option value="in_progress">En cours</option>
              <option value="resolved">Résolu</option>
              <option value="closed">Fermé</option>
            </select>

            <select
              className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
              value={severity}
              onChange={(e) => setFilters({ severity: e.target.value || null })}
            >
              <option value="">Toutes sévérités</option>
              <option value="high">Haute</option>
              <option value="medium">Moyenne</option>
              <option value="low">Basse</option>
            </select>

            <select
              className="px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
              value={category}
              onChange={(e) => setFilters({ category: e.target.value || null })}
            >
              <option value="">Toutes catégories</option>
              <option value="dispute">Litige</option>
              <option value="behavior">Safety</option>
              <option value="technical">Technique</option>
              <option value="other">Autre</option>
            </select>

            <button
              type="button"
              onClick={fetchTickets}
              className="ml-auto px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm transition-colors"
            >
              Rafraîchir
            </button>
          </section>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-20 text-neutral-500 text-sm">
              Aucun ticket à afficher.
            </div>
          ) : (
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
              <div className="divide-y divide-neutral-700/50">
                {tickets.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openDetail(t)}
                    className="w-full text-left px-4 py-3 hover:bg-neutral-700/30 transition-colors flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${severityBadge(t.severity)}`}
                      >
                        {t.severity.toUpperCase()}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(t.status)}`}
                      >
                        {STATUS_LABEL[t.status]}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-neutral-400">
                          {CATEGORY_LABEL[t.category]}
                        </span>
                        <span className="text-xs text-neutral-600">·</span>
                        <span className="text-xs text-neutral-500">
                          {formatDateFr(t.created_at)}
                        </span>
                        {t.is_anonymous && (
                          <span className="text-xs text-purple-300">_anonyme_</span>
                        )}
                      </div>
                      <div className="text-sm text-white mt-1 truncate">
                        {t.subject || t.message.slice(0, 100)}
                      </div>
                      {!t.is_anonymous && (t.reporter_name || t.reporter_email) && (
                        <div className="text-xs text-neutral-500 mt-0.5 truncate">
                          {t.reporter_name || ''}{' '}
                          {t.reporter_email && (
                            <span className="font-mono">({t.reporter_email})</span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="text-xs text-neutral-500 font-mono flex-shrink-0">
                      {t.id.slice(0, 8)}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-neutral-800 border border-neutral-700 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${severityBadge(selected.severity)}`}
                  >
                    {selected.severity.toUpperCase()}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium border ${statusBadge(selected.status)}`}
                  >
                    {STATUS_LABEL[selected.status]}
                  </span>
                  <span className="text-xs text-neutral-400">
                    {CATEGORY_LABEL[selected.category]}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-white">
                  {selected.subject || 'Signalement sans sujet'}
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5 font-mono">
                  {selected.id}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1 rounded-lg hover:bg-neutral-700 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 mb-5">
              <Field label="Auteur">
                {selected.is_anonymous ? (
                  <span className="text-purple-300 italic">Anonyme</span>
                ) : (
                  <>
                    {selected.reporter_name || '_(pas de nom)_'}
                    {selected.reporter_email && (
                      <span className="block text-xs text-neutral-400 font-mono mt-0.5">
                        {selected.reporter_email}
                      </span>
                    )}
                  </>
                )}
              </Field>
              <Field label="Créé le">{formatDateFr(selected.created_at)}</Field>
              <Field label="Message">
                <div className="bg-neutral-900/50 border border-neutral-700 rounded-xl p-3 text-sm whitespace-pre-wrap leading-relaxed">
                  {selected.message}
                </div>
              </Field>
              {selected.resolved_at && (
                <Field label="Résolu le">{formatDateFr(selected.resolved_at)}</Field>
              )}
            </div>

            <div className="space-y-3 border-t border-neutral-700 pt-4">
              <label className="block text-sm font-medium text-neutral-200">
                Note de résolution (visible uniquement par le staff)
              </label>
              <textarea
                value={resolutionNote}
                onChange={(e) => setResolutionNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder="Action prise, contexte..."
              />
              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => updateStatus('in_progress', resolutionNote)}
                  disabled={updating || selected.status === 'in_progress'}
                  className="px-3 py-2 rounded-xl bg-amber-700 hover:bg-amber-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Marquer &laquo;&nbsp;en cours&nbsp;&raquo;
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('resolved', resolutionNote)}
                  disabled={updating || selected.status === 'resolved'}
                  className="px-3 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Marquer résolu
                </button>
                <button
                  type="button"
                  onClick={() => updateStatus('closed', resolutionNote)}
                  disabled={updating || selected.status === 'closed'}
                  className="px-3 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: 'red' | 'amber' | 'emerald';
}) {
  const colors: Record<string, string> = {
    red: 'text-red-300',
    amber: 'text-amber-300',
    emerald: 'text-emerald-300',
  };
  return (
    <div className="bg-neutral-800/50 border border-neutral-700/50 rounded-xl px-4 py-3">
      <p className="text-xs text-neutral-400 uppercase tracking-wide">{label}</p>
      <p
        className={`text-2xl font-bold mt-1 ${accent ? colors[accent] : 'text-white'}`}
      >
        {value}
      </p>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block text-xs text-neutral-500 uppercase tracking-wide mb-1">
        {label}
      </span>
      <div className="text-sm text-neutral-200">{children}</div>
    </div>
  );
}

export default AdminSupportPage;
