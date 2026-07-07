import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Dict = ReturnType<typeof useAdminT<'adminPartnershipRequestDetail'>>;

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

type RequestData = {
  id: string;
  company_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  category: 'super' | 'major' | 'cultural' | 'other';
  message: string;
  budget_range: string | null;
  status: string;
  admin_notes: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  updated_at: string;
  read_at: string | null;
  contacted_at: string | null;
};

function getStatusLabels(t: Dict): Record<string, string> {
  return {
    new: t.statusNew,
    read: t.statusRead,
    contacted: t.statusContacted,
    negotiating: t.statusNegotiating,
    accepted: t.statusAccepted,
    declined: t.statusDeclined,
    archived: t.statusArchived,
  };
}

function getCategoryLabels(t: Dict): Record<string, string> {
  return {
    super: t.categorySuper,
    major: t.categoryMajor,
    cultural: t.categoryCultural,
    other: t.categoryOther,
  };
}

function formatDate(d: string | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return d;
  }
}

function AdminPartnershipRequestDetailPage({ staff }: Props) {
  const t = useAdminT('adminPartnershipRequestDetail');
  const statusLabels = getStatusLabels(t);
  const categoryLabels = getCategoryLabels(t);
  const router = useRouter();
  const { id } = router.query;
  const { addToast } = useToast();
  const { adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [request, setRequest] = useState<RequestData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [status, setStatus] = useState('');
  const [adminNotes, setAdminNotes] = useState('');

  useEffect(() => {
    if (!id || typeof id !== 'string') return;

    async function fetchRequest() {
      setLoading(true);
      try {
        const json = await adminFetchJson<RequestData>(
          `/api/admin/partnership-requests/${id}`
        );
        setRequest(json);
        setStatus(json.status);
        setAdminNotes(json.admin_notes || '');
      } catch (err: unknown) {
        setError((err as Error).message || t.errorLoad);
      } finally {
        setLoading(false);
      }
    }

    fetchRequest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleUpdate = async () => {
    setError(null);
    setSaving(true);

    try {
      const json = await adminFetchJson<RequestData>(
        `/api/admin/partnership-requests/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status, adminNotes }),
        }
      );
      setRequest(json);
      addToast(t.toastUpdated, 'success');
    } catch (err: unknown) {
      setError((err as Error).message || t.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex items-center justify-center">
        <div className="text-center">
          <p className="text-neutral-400 mb-4">{t.notFound}</p>
          <Link
            href="/admin/partnership-requests"
            className="text-blue-400 hover:underline"
          >
            {t.backToRequests}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { company: request.company_name })}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin/partnership-requests"
              className="inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition mb-4"
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
              {t.backToRequests}
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">
              {request.company_name}
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              {format(t.receivedOn, { date: formatDate(request.created_at) })}
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Main Content */}
            <div className="lg:col-span-2 space-y-6">
              {/* Contact Info */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">{t.contactInfo}</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                      {t.contact}
                    </div>
                    <div className="font-medium">{request.contact_name}</div>
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                      {t.email}
                    </div>
                    <a
                      href={`mailto:${request.email}`}
                      className="font-medium text-blue-400 hover:underline"
                    >
                      {request.email}
                    </a>
                  </div>
                  {request.phone && (
                    <div>
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                        {t.phone}
                      </div>
                      <a
                        href={`tel:${request.phone}`}
                        className="font-medium text-blue-400 hover:underline"
                      >
                        {request.phone}
                      </a>
                    </div>
                  )}
                  {request.website && (
                    <div>
                      <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                        {t.website}
                      </div>
                      <a
                        href={request.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-blue-400 hover:underline break-all"
                      >
                        {request.website}
                      </a>
                    </div>
                  )}
                </div>
              </section>

              {/* Request Details */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">
                  {t.requestDetails}
                </h2>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="px-3 py-1.5 rounded-lg bg-neutral-700/50 text-sm">
                      <span className="text-neutral-400">{t.category}</span>{' '}
                      <span className="font-medium">
                        {categoryLabels[request.category]}
                      </span>
                    </div>
                    {request.budget_range && (
                      <div className="px-3 py-1.5 rounded-lg bg-neutral-700/50 text-sm">
                        <span className="text-neutral-400">{t.budget}</span>{' '}
                        <span className="font-medium">
                          {request.budget_range}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider mb-2">
                      {t.message}
                    </div>
                    <div className="bg-neutral-900/50 rounded-xl p-4 text-sm whitespace-pre-wrap">
                      {request.message}
                    </div>
                  </div>
                </div>
              </section>

              {/* Quick Actions */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">{t.quickActions}</h2>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={`mailto:${request.email}?subject=Re: Demande de partenariat - OW Women's Cup`}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-medium transition flex items-center gap-2"
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
                        d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                    {t.sendEmail}
                  </a>
                  {request.phone && (
                    <a
                      href={`tel:${request.phone}`}
                      className="px-4 py-2 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition flex items-center gap-2"
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
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      {t.call}
                    </a>
                  )}
                  <Link
                    href="/admin/partners/new"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition flex items-center gap-2"
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {t.createPartner}
                  </Link>
                </div>
              </section>
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Status Management */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">{t.management}</h2>

                {error && (
                  <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
                    {error}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.statusLabel}
                    </label>
                    <select
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                      }}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.adminNotesLabel}
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => {
                        setAdminNotes(e.target.value);
                      }}
                      rows={4}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white resize-none text-sm"
                      placeholder={t.adminNotesPlaceholder}
                    />
                  </div>

                  <button
                    onClick={handleUpdate}
                    disabled={saving}
                    className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {saving ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        {t.saving}
                      </>
                    ) : (
                      t.save
                    )}
                  </button>
                </div>
              </section>

              {/* Timeline */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-lg font-semibold mb-4">{t.history}</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
                    <div>
                      <div className="font-medium">{t.historyReceived}</div>
                      <div className="text-neutral-500">
                        {formatDate(request.created_at)}
                      </div>
                    </div>
                  </div>
                  {request.read_at && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-neutral-500 mt-1.5" />
                      <div>
                        <div className="font-medium">{t.historyRead}</div>
                        <div className="text-neutral-500">
                          {formatDate(request.read_at)}
                        </div>
                      </div>
                    </div>
                  )}
                  {request.contacted_at && (
                    <div className="flex items-start gap-3">
                      <div className="w-2 h-2 rounded-full bg-purple-500 mt-1.5" />
                      <div>
                        <div className="font-medium">{t.historyContacted}</div>
                        <div className="text-neutral-500">
                          {formatDate(request.contacted_at)}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-neutral-600 mt-1.5" />
                    <div>
                      <div className="font-medium">{t.historyUpdated}</div>
                      <div className="text-neutral-500">
                        {formatDate(request.updated_at)}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              {/* Technical Info */}
              <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-neutral-400 mb-3">
                  {t.techInfo}
                </h2>
                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-neutral-500">{t.idLabel}</span>{' '}
                    <span className="font-mono text-neutral-400">
                      {request.id}
                    </span>
                  </div>
                  {request.ip_address && (
                    <div>
                      <span className="text-neutral-500">{t.ipLabel}</span>{' '}
                      <span className="font-mono text-neutral-400">
                        {request.ip_address}
                      </span>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminPartnershipRequestDetailPage;
