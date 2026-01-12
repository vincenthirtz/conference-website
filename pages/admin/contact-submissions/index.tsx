import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';

type ContactSubmission = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'read' | 'replied' | 'archived' | 'spam';
  admin_notes: string | null;
  created_at: string;
  read_at: string | null;
  replied_at: string | null;
};

type ApiResponse = {
  items: ContactSubmission[];
  total: number;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'new', label: 'Nouveaux' },
  { value: 'read', label: 'Lus' },
  { value: 'replied', label: 'Répondus' },
  { value: 'archived', label: 'Archivés' },
  { value: 'spam', label: 'Spam' },
];

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-600 text-white',
  read: 'bg-neutral-600 text-neutral-100',
  replied: 'bg-emerald-600 text-white',
  archived: 'bg-neutral-700 text-neutral-300',
  spam: 'bg-red-600 text-white',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau',
  read: 'Lu',
  replied: 'Répondu',
  archived: 'Archivé',
  spam: 'Spam',
};

const SUBJECT_LABELS: Record<string, string> = {
  cast: 'Rejoindre le cast',
  tournoi: 'Infos tournoi',
  teams: 'Inscription équipe',
  partenariat: 'Partenariat',
  autre: 'Autre',
};

function AdminContactSubmissionsPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [submissions, setSubmissions] = useState<ContactSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 20;

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
      });
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/contact-submissions?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json: ApiResponse = await res.json();

      setSubmissions(json.items || []);
      setTotal(json.total || 0);
    } catch (err) {
      console.error('Error fetching contact submissions', err);
    } finally {
      setLoading(false);
    }
  }, [offset, statusFilter, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateStatus = async (id: string, newStatus: string) => {
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const res = await fetch(`/api/admin/contact-submissions/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Modification impossible');
      }
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Erreur de modification.');
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer définitivement ce message ?')) return;
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const res = await fetch(`/api/admin/contact-submissions/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Suppression impossible');
      }
      setSelectedId(null);
      fetchData();
    } catch (err: any) {
      alert(err?.message || 'Erreur de suppression.');
    }
  };

  const selectedSubmission = submissions.find((s) => s.id === selectedId);
  const newCount = submissions.filter((s) => s.status === 'new').length;

  return (
    <>
      <Head>
        <title>Admin – Messages de contact</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Messages de contact
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {total} message{total > 1 ? 's' : ''} au total
                  {newCount > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-600 text-white text-xs">
                      {newCount} nouveau{newCount > 1 ? 'x' : ''}
                    </span>
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Recherche
                </label>
                <div className="relative">
                  <svg
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <input
                    type="text"
                    placeholder="Nom ou email..."
                    className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setOffset(0);
                    }}
                  />
                </div>
              </div>

              <div className="min-w-[150px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setOffset(0);
                  }}
                >
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          <div className="grid lg:grid-cols-2 gap-6">
            {/* List */}
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
                </div>
              ) : submissions.length === 0 ? (
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
                  Aucun message trouvé
                </div>
              ) : (
                <div className="divide-y divide-neutral-700/50 max-h-[600px] overflow-y-auto">
                  {submissions.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => {
                        setSelectedId(s.id);
                        if (s.status === 'new') {
                          updateStatus(s.id, 'read');
                        }
                      }}
                      className={`w-full text-left p-4 hover:bg-neutral-700/30 transition-colors ${
                        selectedId === s.id ? 'bg-neutral-700/50' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`font-semibold ${
                                s.status === 'new' ? 'text-white' : 'text-neutral-300'
                              }`}
                            >
                              {s.name}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                STATUS_COLORS[s.status]
                              }`}
                            >
                              {STATUS_LABELS[s.status]}
                            </span>
                          </div>
                          <p className="text-sm text-neutral-400 truncate">
                            {s.email}
                          </p>
                          <p className="text-sm text-neutral-500 mt-1">
                            {SUBJECT_LABELS[s.subject] || s.subject}
                          </p>
                        </div>
                        <div className="text-xs text-neutral-500 whitespace-nowrap">
                          {new Date(s.created_at).toLocaleDateString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                          })}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Pagination */}
              {total > limit && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-700/50">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-3 py-1.5 rounded-lg border border-neutral-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700/50"
                  >
                    Précédent
                  </button>
                  <span className="text-sm text-neutral-400">
                    {offset + 1} - {Math.min(offset + limit, total)} sur {total}
                  </span>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + limit >= total}
                    className="px-3 py-1.5 rounded-lg border border-neutral-600 text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-700/50"
                  >
                    Suivant
                  </button>
                </div>
              )}
            </section>

            {/* Detail Panel */}
            <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
              {selectedSubmission ? (
                <div className="space-y-6">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className="text-xl font-bold">{selectedSubmission.name}</h2>
                      <a
                        href={`mailto:${selectedSubmission.email}`}
                        className="text-purple-400 hover:underline text-sm"
                      >
                        {selectedSubmission.email}
                      </a>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        STATUS_COLORS[selectedSubmission.status]
                      }`}
                    >
                      {STATUS_LABELS[selectedSubmission.status]}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-neutral-500">Sujet</span>
                      <p className="text-white">
                        {SUBJECT_LABELS[selectedSubmission.subject] || selectedSubmission.subject}
                      </p>
                    </div>
                    <div>
                      <span className="text-neutral-500">Date</span>
                      <p className="text-white">
                        {new Date(selectedSubmission.created_at).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  </div>

                  <div>
                    <span className="text-neutral-500 text-sm">Message</span>
                    <div className="mt-2 p-4 rounded-xl bg-neutral-900/50 border border-neutral-700 text-sm whitespace-pre-wrap">
                      {selectedSubmission.message}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2 pt-4 border-t border-neutral-700">
                    <a
                      href={`mailto:${selectedSubmission.email}?subject=Re: ${
                        SUBJECT_LABELS[selectedSubmission.subject] || selectedSubmission.subject
                      }`}
                      onClick={() => updateStatus(selectedSubmission.id, 'replied')}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-sm font-medium transition-colors"
                    >
                      Répondre par email
                    </a>
                    <button
                      onClick={() => updateStatus(selectedSubmission.id, 'archived')}
                      className="px-4 py-2 rounded-lg border border-neutral-600 hover:bg-neutral-700/50 text-sm transition-colors"
                    >
                      Archiver
                    </button>
                    <button
                      onClick={() => updateStatus(selectedSubmission.id, 'spam')}
                      className="px-4 py-2 rounded-lg border border-amber-500/40 text-amber-300 hover:border-amber-400 text-sm transition-colors"
                    >
                      Spam
                    </button>
                    <button
                      onClick={() => onDelete(selectedSubmission.id)}
                      className="px-4 py-2 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-neutral-500 py-20">
                  <svg
                    className="w-16 h-16 mb-4 text-neutral-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                    />
                  </svg>
                  <p>Sélectionne un message pour voir les détails</p>
                </div>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('manager');

export default AdminContactSubmissionsPage;
