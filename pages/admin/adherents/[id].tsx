import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

type FormData = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthDate: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
  joinDate: string;
  currentYear: number;
  paymentStatus: 'pending' | 'partial' | 'paid' | 'exempt' | 'overdue';
  paymentAmount: number;
  paymentDate: string;
  paymentMethod:
    | 'cash'
    | 'check'
    | 'transfer'
    | 'card'
    | 'helloasso'
    | 'other'
    | '';
  paymentReference: string;
  isActive: boolean;
  role:
    | 'member'
    | 'volunteer'
    | 'board'
    | 'president'
    | 'treasurer'
    | 'secretary';
  notes: string;
};

type AdherentData = {
  id: string;
  member_number: string | null;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  join_date: string;
  current_year: number;
  payment_status: string;
  payment_amount: number;
  payment_date: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  is_active: boolean;
  role: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

function AdminEditAdherentPage({ staff }: Props) {
  const t = useAdminT('adminAdherentDetail');
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adherent, setAdherent] = useState<AdherentData | null>(null);
  const [cotisationAmount, setCotisationAmount] = useState<number>(0);

  const currentYear = new Date().getFullYear();
  const today = new Date().toISOString().split('T')[0];

  const [form, setForm] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    birthDate: '',
    address: '',
    city: '',
    postalCode: '',
    country: 'France',
    joinDate: today,
    currentYear: currentYear,
    paymentStatus: 'pending',
    paymentAmount: 0,
    paymentDate: '',
    paymentMethod: '',
    paymentReference: '',
    isActive: true,
    role: 'member',
    notes: '',
  });

  const fetchAdherent = useCallback(async () => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);
    try {
      const data = await adminFetchJson<AdherentData>(
        `/api/admin/adherents/${id}`
      );
      setAdherent(data);

      setForm({
        firstName: data.first_name,
        lastName: data.last_name,
        email: data.email,
        phone: data.phone || '',
        birthDate: data.birth_date || '',
        address: data.address || '',
        city: data.city || '',
        postalCode: data.postal_code || '',
        country: data.country || 'France',
        joinDate: data.join_date,
        currentYear: data.current_year,
        paymentStatus: data.payment_status as FormData['paymentStatus'],
        paymentAmount: data.payment_amount,
        paymentDate: data.payment_date || '',
        paymentMethod: (data.payment_method || '') as FormData['paymentMethod'],
        paymentReference: data.payment_reference || '',
        isActive: data.is_active,
        role: data.role as FormData['role'],
        notes: data.notes || '',
      });

      // Récupérer le montant de cotisation
      const settingsJson = await adminFetchJson<{
        items?: { key: string; value: string }[];
      }>('/api/admin/site-settings');
      const cotisation = settingsJson.items?.find(
        (s: { key: string }) => s.key === 'cotisation_amount'
      );
      if (cotisation?.value) {
        setCotisationAmount(parseFloat(cotisation.value) || 0);
      }
    } catch (err: unknown) {
      setError((err as Error).message || t.errorLoad);
    } finally {
      setLoading(false);
    }
  }, [id, adminFetchJson, t]);

  useEffect(() => {
    fetchAdherent();
  }, [fetchAdherent]);

  const updateField = <K extends keyof FormData>(
    field: K,
    value: FormData[K]
  ) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!form.firstName.trim()) {
      setError(t.errorFirstNameRequired);
      return;
    }
    if (!form.lastName.trim()) {
      setError(t.errorLastNameRequired);
      return;
    }
    if (!form.email.trim()) {
      setError(t.errorEmailRequired);
      return;
    }

    setSaving(true);

    try {
      await adminFetchJson(`/api/admin/adherents/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          ...form,
          paymentMethod: form.paymentMethod || null,
        }),
      });

      router.push('/admin/adherents');
    } catch (err: unknown) {
      setError((err as Error).message || t.errorGeneric);
    } finally {
      setSaving(false);
    }
  };

  const markAsPaid = () => {
    setForm((prev) => ({
      ...prev,
      paymentStatus: 'paid',
      paymentAmount: cotisationAmount,
      paymentDate: today,
    }));
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  if (!adherent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-neutral-400">{t.notFound}</p>
        <Link href="/admin/adherents" className="text-blue-400 hover:underline">
          {t.backToList}
        </Link>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>
          {format(t.pageTitle, {
            name: `${adherent.first_name} ${adherent.last_name}`,
          })}
        </title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/admin/adherents"
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
              {t.backToAdherents}
            </Link>
            <div className="flex items-center gap-4">
              <h1 className="text-3xl font-bold tracking-tight">
                {adherent.first_name} {adherent.last_name}
              </h1>
              {adherent.member_number && (
                <span className="px-3 py-1 rounded-full bg-neutral-700/50 text-neutral-300 text-sm font-mono">
                  {adherent.member_number}
                </span>
              )}
            </div>
            <p className="text-neutral-400 text-sm mt-1">
              {format(t.memberSince, {
                date: new Date(adherent.join_date).toLocaleDateString('fr-FR'),
              })}
              {cotisationAmount > 0 && (
                <span className="ml-2">
                  •{' '}
                  {format(t.cotisationInfo, {
                    amount: cotisationAmount.toFixed(2),
                  })}
                </span>
              )}
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8"
          >
            <fieldset disabled={saving} className="space-y-8">
              {error && (
                <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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
                  {error}
                </div>
              )}

              {/* Informations personnelles */}
              <section>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-blue-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  {t.sectionPersonal}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.firstName}
                    </label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.lastName}
                    </label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.email}
                    </label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.phone}
                    </label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.birthDate}
                    </label>
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={(e) => updateField('birthDate', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.country}
                    </label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.address}
                    </label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.postalCode}
                    </label>
                    <input
                      type="text"
                      value={form.postalCode}
                      onChange={(e) =>
                        updateField('postalCode', e.target.value)
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.city}
                    </label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>
                </div>
              </section>

              {/* Adhésion */}
              <section>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-purple-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                    />
                  </svg>
                  {t.sectionMembership}
                </h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.joinDate}
                    </label>
                    <input
                      type="date"
                      value={form.joinDate}
                      onChange={(e) => updateField('joinDate', e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.cotisationYear}
                    </label>
                    <select
                      value={form.currentYear}
                      onChange={(e) =>
                        updateField('currentYear', parseInt(e.target.value))
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    >
                      {[currentYear, currentYear - 1, currentYear + 1].map(
                        (y) => (
                          <option key={y} value={y}>
                            {y}
                          </option>
                        )
                      )}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.roleInAssoc}
                    </label>
                    <select
                      value={form.role}
                      onChange={(e) =>
                        updateField('role', e.target.value as FormData['role'])
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    >
                      <option value="member">{t.roleMember}</option>
                      <option value="volunteer">{t.roleVolunteer}</option>
                      <option value="board">{t.roleBoard}</option>
                      <option value="president">{t.rolePresident}</option>
                      <option value="treasurer">{t.roleTreasurer}</option>
                      <option value="secretary">{t.roleSecretary}</option>
                    </select>
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) =>
                          updateField('isActive', e.target.checked)
                        }
                        className="w-5 h-5 rounded border-neutral-600 bg-neutral-900/50 text-emerald-500 focus:ring-emerald-500"
                      />
                      <span className="text-sm font-medium text-neutral-300">
                        {t.activeMember}
                      </span>
                    </label>
                  </div>
                </div>
              </section>

              {/* Paiement */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <svg
                      className="w-5 h-5 text-emerald-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                      />
                    </svg>
                    {t.sectionPayment}
                  </h2>
                  {cotisationAmount > 0 && form.paymentStatus !== 'paid' && (
                    <button
                      type="button"
                      onClick={markAsPaid}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-sm hover:bg-emerald-600/30 transition"
                    >
                      {format(t.markPaid, {
                        amount: cotisationAmount.toFixed(2),
                      })}
                    </button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.paymentStatus}
                    </label>
                    <select
                      value={form.paymentStatus}
                      onChange={(e) =>
                        updateField(
                          'paymentStatus',
                          e.target.value as FormData['paymentStatus']
                        )
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    >
                      <option value="pending">{t.statusPending}</option>
                      <option value="partial">{t.statusPartial}</option>
                      <option value="paid">{t.statusPaid}</option>
                      <option value="exempt">{t.statusExempt}</option>
                      <option value="overdue">{t.statusOverdue}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.paymentAmount}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.paymentAmount}
                      onChange={(e) =>
                        updateField(
                          'paymentAmount',
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.paymentDate}
                    </label>
                    <input
                      type="date"
                      value={form.paymentDate}
                      onChange={(e) =>
                        updateField('paymentDate', e.target.value)
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.paymentMethod}
                    </label>
                    <select
                      value={form.paymentMethod}
                      onChange={(e) =>
                        updateField(
                          'paymentMethod',
                          e.target.value as FormData['paymentMethod']
                        )
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    >
                      <option value="">{t.methodUnspecified}</option>
                      <option value="cash">{t.methodCash}</option>
                      <option value="check">{t.methodCheck}</option>
                      <option value="transfer">{t.methodTransfer}</option>
                      <option value="card">{t.methodCard}</option>
                      <option value="helloasso">{t.methodHelloasso}</option>
                      <option value="other">{t.methodOther}</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-sm font-medium text-neutral-300 mb-2">
                      {t.paymentReference}
                    </label>
                    <input
                      type="text"
                      value={form.paymentReference}
                      onChange={(e) =>
                        updateField('paymentReference', e.target.value)
                      }
                      className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                      placeholder={t.paymentReferencePlaceholder}
                    />
                  </div>
                </div>
              </section>

              {/* Notes */}
              <section>
                <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-amber-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                  {t.sectionNotes}
                </h2>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white resize-none"
                  placeholder={t.notesPlaceholder}
                />
              </section>

              {/* Métadonnées */}
              <section className="text-xs text-neutral-500 border-t border-neutral-700/50 pt-4">
                <p>
                  {format(t.createdOn, {
                    date: new Date(adherent.created_at).toLocaleString('fr-FR'),
                  })}
                  {adherent.updated_at !== adherent.created_at &&
                    format(t.lastModified, {
                      date: new Date(adherent.updated_at).toLocaleString(
                        'fr-FR'
                      ),
                    })}
                </p>
              </section>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-semibold text-white transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      {t.saving}
                    </>
                  ) : (
                    t.submit
                  )}
                </button>
                <Link
                  href="/admin/adherents"
                  className={`px-6 py-3 rounded-xl border border-neutral-600 text-sm font-semibold text-white text-center transition hover:bg-neutral-800${saving ? ' pointer-events-none opacity-50' : ''}`}
                >
                  {t.cancel}
                </Link>
              </div>
            </fieldset>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminEditAdherentPage;
