import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAutoSave } from '@/utils/useAutoSave';
import DraftBanner from '@/components/admin/DraftBanner';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import { FicheLayout, FicheSection } from '@/features/admin/_shared/ui/Fiche';

import { logger } from '../../../utils/logger';
import nsAdminAdherentsNew from '@/lib/i18n/locales/admin-fr/adminAdherentsNew';
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

function AdminNewAdherentPage(_props: Props) {
  const t = useAdminT(nsAdminAdherentsNew);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cotisationAmount, setCotisationAmount] = useState<number>(0);
  const [showDraftBanner, setShowDraftBanner] = useState(false);

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

  const { draftRestored, lastSaved, clearDraft, restoreDraft } = useAutoSave(
    form,
    {
      key: 'adherent_new',
    }
  );

  useEffect(() => {
    if (draftRestored) setShowDraftBanner(true);
  }, [draftRestored]);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const json = await adminFetchJson<{
          items?: { key: string; value: string }[];
        }>('/api/admin/site-settings');
        const cotisation = json.items?.find(
          (s: { key: string }) => s.key === 'cotisation_amount'
        );
        if (cotisation?.value) {
          setCotisationAmount(parseFloat(cotisation.value) || 0);
        }
      } catch (err) {
        logger.error('Error fetching settings', err);
      }
    };
    fetchSettings();
  }, [adminFetchJson]);

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
      await adminFetchJson('/api/admin/adherents', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          paymentMethod: form.paymentMethod || null,
        }),
      });

      clearDraft();
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

  const typedName = `${form.firstName} ${form.lastName}`.trim();
  const formId = 'adherent-new-form';
  const inputClass =
    'w-full px-4 py-3 rounded-xl bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] text-[var(--t1,#f4edf7)]';
  const labelClass = 'block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2';

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Link
          href="/admin/adherents"
          className="mb-3 inline-block text-sm text-[var(--t3,#a39ba6)] hover:text-[var(--t1,#f4edf7)]"
        >
          {t.backToAdherents}
        </Link>

        <EntityHeader
          crest={typedName ? typedName.slice(0, 3).toUpperCase() : undefined}
          title={typedName || t.heading}
          meta={
            cotisationAmount > 0
              ? format(t.annualCotisation, {
                  amount: cotisationAmount.toFixed(2),
                })
              : undefined
          }
          actions={
            <>
              <AdminButtonLink
                href="/admin/adherents"
                className={saving ? 'pointer-events-none opacity-50' : ''}
              >
                {t.cancel}
              </AdminButtonLink>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={saving}
              >
                {saving ? t.saving : t.submit}
              </AdminButton>
            </>
          }
        />

        <FicheLayout
          main={
            <form
              id={formId}
              onSubmit={handleSubmit}
              className="flex flex-col gap-6"
            >
              {showDraftBanner && (
                <DraftBanner
                  lastSaved={lastSaved}
                  onRestore={() => {
                    const draft = restoreDraft();
                    if (draft) setForm(draft);
                    setShowDraftBanner(false);
                  }}
                  onDiscard={() => {
                    clearDraft();
                    setShowDraftBanner(false);
                  }}
                />
              )}
              {error && (
                <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm text-[var(--t1,#f4edf7)]">
                  {error}
                </div>
              )}

              <FicheSection title={t.sectionPersonal}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>{t.firstName}</label>
                    <input
                      type="text"
                      value={form.firstName}
                      onChange={(e) => updateField('firstName', e.target.value)}
                      className={inputClass}
                      placeholder={t.firstNamePlaceholder}
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.lastName}</label>
                    <input
                      type="text"
                      value={form.lastName}
                      onChange={(e) => updateField('lastName', e.target.value)}
                      className={inputClass}
                      placeholder={t.lastNamePlaceholder}
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.email}</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => updateField('email', e.target.value)}
                      className={inputClass}
                      placeholder="marie@exemple.com"
                      required
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.phone}</label>
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={(e) => updateField('phone', e.target.value)}
                      className={inputClass}
                      placeholder={t.phonePlaceholder}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.birthDate}</label>
                    <input
                      type="date"
                      value={form.birthDate}
                      onChange={(e) => updateField('birthDate', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.country}</label>
                    <input
                      type="text"
                      value={form.country}
                      onChange={(e) => updateField('country', e.target.value)}
                      className={inputClass}
                      placeholder={t.countryPlaceholder}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className={labelClass}>{t.address}</label>
                    <input
                      type="text"
                      value={form.address}
                      onChange={(e) => updateField('address', e.target.value)}
                      className={inputClass}
                      placeholder={t.addressPlaceholder}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.postalCode}</label>
                    <input
                      type="text"
                      value={form.postalCode}
                      onChange={(e) =>
                        updateField('postalCode', e.target.value)
                      }
                      className={inputClass}
                      placeholder={t.postalCodePlaceholder}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.city}</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => updateField('city', e.target.value)}
                      className={inputClass}
                      placeholder={t.cityPlaceholder}
                    />
                  </div>
                </div>
              </FicheSection>

              <FicheSection title={t.sectionMembership}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>{t.joinDate}</label>
                    <input
                      type="date"
                      value={form.joinDate}
                      onChange={(e) => updateField('joinDate', e.target.value)}
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.cotisationYear}</label>
                    <select
                      value={form.currentYear}
                      onChange={(e) =>
                        updateField('currentYear', parseInt(e.target.value))
                      }
                      className={inputClass}
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
                    <label className={labelClass}>{t.roleInAssoc}</label>
                    <select
                      value={form.role}
                      onChange={(e) =>
                        updateField('role', e.target.value as FormData['role'])
                      }
                      className={inputClass}
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
                      <span className="text-sm font-medium text-[var(--t2,#c7bfca)]">
                        {t.activeMember}
                      </span>
                    </label>
                  </div>
                </div>
              </FicheSection>

              <FicheSection
                title={t.sectionPayment}
                aside={
                  cotisationAmount > 0 &&
                  form.paymentStatus !== 'paid' && (
                    <AdminButton
                      variant="secondary"
                      size="xs"
                      onClick={markAsPaid}
                    >
                      {format(t.markPaid, {
                        amount: cotisationAmount.toFixed(2),
                      })}
                    </AdminButton>
                  )
                }
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className={labelClass}>{t.paymentStatus}</label>
                    <select
                      value={form.paymentStatus}
                      onChange={(e) =>
                        updateField(
                          'paymentStatus',
                          e.target.value as FormData['paymentStatus']
                        )
                      }
                      className={inputClass}
                    >
                      <option value="pending">{t.statusPending}</option>
                      <option value="partial">{t.statusPartial}</option>
                      <option value="paid">{t.statusPaid}</option>
                      <option value="exempt">{t.statusExempt}</option>
                      <option value="overdue">{t.statusOverdue}</option>
                    </select>
                  </div>

                  <div>
                    <label className={labelClass}>{t.paymentAmount}</label>
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
                      className={inputClass}
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.paymentDate}</label>
                    <input
                      type="date"
                      value={form.paymentDate}
                      onChange={(e) =>
                        updateField('paymentDate', e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className={labelClass}>{t.paymentMethod}</label>
                    <select
                      value={form.paymentMethod}
                      onChange={(e) =>
                        updateField(
                          'paymentMethod',
                          e.target.value as FormData['paymentMethod']
                        )
                      }
                      className={inputClass}
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
                    <label className={labelClass}>{t.paymentReference}</label>
                    <input
                      type="text"
                      value={form.paymentReference}
                      onChange={(e) =>
                        updateField('paymentReference', e.target.value)
                      }
                      className={inputClass}
                      placeholder={t.paymentReferencePlaceholder}
                    />
                  </div>
                </div>
              </FicheSection>

              <FicheSection title={t.sectionNotes}>
                <textarea
                  value={form.notes}
                  onChange={(e) => updateField('notes', e.target.value)}
                  rows={3}
                  className={`${inputClass} resize-none`}
                  placeholder={t.notesPlaceholder}
                />
              </FicheSection>
            </form>
          }
        />
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

export default AdminNewAdherentPage;
