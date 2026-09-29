import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminPartnershipRequestDetail from '@/lib/i18n/locales/admin-fr/adminPartnershipRequestDetail';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';

type Dict = typeof nsAdminPartnershipRequestDetail.fr;

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

function AdminPartnershipRequestDetailPage(_props: Props) {
  const t = useAdminT(nsAdminPartnershipRequestDetail);
  const tf = useAdminT(nsAdminFiche);
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
    // adminFetchJson et t sont désormais stables : l'effet ne se relance qu'au
    // changement d'id de route, sans refetch parasite.
  }, [id, adminFetchJson, t]);

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
      <div className="flex min-h-screen items-center justify-center px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
      </div>
    );
  }

  if (!request) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="text-center">
          <p className="mb-4 text-[var(--t3,#a39ba6)]">{t.notFound}</p>
          <Link
            href="/admin/partners?tab=requests"
            className="text-[var(--or-200,#eec4ff)] hover:underline"
          >
            {t.backToRequests}
          </Link>
        </div>
      </div>
    );
  }

  const fieldLabel =
    'mb-1 text-xs uppercase tracking-wider text-[var(--t3,#a39ba6)]';
  const linkClass = 'font-medium text-[var(--or-200,#eec4ff)] hover:underline';

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { company: request.company_name })}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />

        <EntityHeader
          crest={request.company_name.slice(0, 3).toUpperCase() || undefined}
          title={request.company_name}
          meta={format(t.receivedOn, { date: formatDate(request.created_at) })}
          status={
            <Chip tone={request.status === 'new' ? 'brand' : 'neutral'}>
              {statusLabels[request.status] ?? request.status}
            </Chip>
          }
          actions={
            <>
              <AdminButtonLink
                href="/admin/partners?tab=requests"
                className={saving ? 'pointer-events-none opacity-50' : ''}
              >
                {tf.cancel}
              </AdminButtonLink>
              <AdminButton
                variant="primary"
                onClick={handleUpdate}
                disabled={saving}
              >
                {saving ? tf.saving : tf.save}
              </AdminButton>
            </>
          }
        />

        <FicheLayout
          main={
            <>
              <FicheSection title={t.contactInfo}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <div className={fieldLabel}>{t.contact}</div>
                    <div className="font-medium text-[var(--t1,#f4edf7)]">
                      {request.contact_name}
                    </div>
                  </div>
                  <div>
                    <div className={fieldLabel}>{t.email}</div>
                    <a href={`mailto:${request.email}`} className={linkClass}>
                      {request.email}
                    </a>
                  </div>
                  {request.phone && (
                    <div>
                      <div className={fieldLabel}>{t.phone}</div>
                      <a href={`tel:${request.phone}`} className={linkClass}>
                        {request.phone}
                      </a>
                    </div>
                  )}
                  {request.website && (
                    <div>
                      <div className={fieldLabel}>{t.website}</div>
                      <a
                        href={request.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`${linkClass} break-all`}
                      >
                        {request.website}
                      </a>
                    </div>
                  )}
                </div>
              </FicheSection>

              <FicheSection title={t.requestDetails}>
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-3">
                    <div className="rounded-lg bg-[var(--s2,#1d1520)] px-3 py-1.5 text-sm">
                      <span className="text-[var(--t3,#a39ba6)]">
                        {t.category}
                      </span>{' '}
                      <span className="font-medium text-[var(--t1,#f4edf7)]">
                        {categoryLabels[request.category]}
                      </span>
                    </div>
                    {request.budget_range && (
                      <div className="rounded-lg bg-[var(--s2,#1d1520)] px-3 py-1.5 text-sm">
                        <span className="text-[var(--t3,#a39ba6)]">
                          {t.budget}
                        </span>{' '}
                        <span className="font-medium text-[var(--t1,#f4edf7)]">
                          {request.budget_range}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <div className={`${fieldLabel} mb-2`}>{t.message}</div>
                    <div className="whitespace-pre-wrap rounded-xl bg-[var(--s2,#1d1520)] p-4 text-sm text-[var(--t1,#f4edf7)]">
                      {request.message}
                    </div>
                  </div>
                </div>
              </FicheSection>

              <FicheSection title={t.management}>
                {error && (
                  <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
                    {error}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--t2,#c7bfca)]">
                      {t.statusLabel}
                    </label>
                    <select
                      value={status}
                      onChange={(e) => {
                        setStatus(e.target.value);
                      }}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] text-[var(--t1,#f4edf7)]"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="mb-2 block text-sm font-medium text-[var(--t2,#c7bfca)]">
                      {t.adminNotesLabel}
                    </label>
                    <textarea
                      value={adminNotes}
                      onChange={(e) => {
                        setAdminNotes(e.target.value);
                      }}
                      rows={4}
                      className="w-full resize-none px-4 py-3 rounded-xl bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] text-sm text-[var(--t1,#f4edf7)]"
                      placeholder={t.adminNotesPlaceholder}
                    />
                  </div>
                </div>
              </FicheSection>

              <FicheSection title={t.quickActions}>
                <div className="flex flex-wrap gap-3">
                  <AdminButtonLink
                    variant="secondary"
                    size="sm"
                    href={`mailto:${request.email}?subject=Re: Demande de partenariat - OW Women's Cup`}
                  >
                    {t.sendEmail}
                  </AdminButtonLink>
                  {request.phone && (
                    <AdminButtonLink size="sm" href={`tel:${request.phone}`}>
                      {t.call}
                    </AdminButtonLink>
                  )}
                  <AdminButtonLink
                    variant="secondary"
                    size="sm"
                    href="/admin/partners/new"
                  >
                    {t.createPartner}
                  </AdminButtonLink>
                </div>
              </FicheSection>
            </>
          }
          aside={
            <>
              <FicheSection eyebrow title={t.history}>
                <MetaList
                  items={[
                    {
                      label: t.historyReceived,
                      value: formatDate(request.created_at),
                    },
                    ...(request.read_at
                      ? [
                          {
                            label: t.historyRead,
                            value: formatDate(request.read_at),
                          },
                        ]
                      : []),
                    ...(request.contacted_at
                      ? [
                          {
                            label: t.historyContacted,
                            value: formatDate(request.contacted_at),
                          },
                        ]
                      : []),
                    {
                      label: t.historyUpdated,
                      value: formatDate(request.updated_at),
                    },
                  ]}
                />
              </FicheSection>

              <FicheSection eyebrow title={tf.metaTitle}>
                <MetaList
                  items={[
                    {
                      label: tf.metaId,
                      value: (
                        <span title={request.id}>
                          {`${request.id.slice(0, 8)}…`}
                        </span>
                      ),
                    },
                    ...(request.ip_address
                      ? [{ label: t.ipLabel, value: request.ip_address }]
                      : []),
                  ]}
                />
              </FicheSection>
            </>
          }
        />
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

export default AdminPartnershipRequestDetailPage;
