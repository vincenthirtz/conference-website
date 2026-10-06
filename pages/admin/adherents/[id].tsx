import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { withAdminQuery } from '@/features/admin/_shared/query';
import { useHydrateOnce } from '@/features/admin/_shared/useHydrateOnce';
import {
  type AdherentRecord,
  adherentsClient,
} from '@/features/admin/adherents/client';
import {
  adherentsKeys,
  useAdherent,
  useCotisationAmount,
} from '@/features/admin/adherents/hooks/useAdherents';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminAdherentDetail from '@/lib/i18n/locales/admin-fr/adminAdherentDetail';
import AdminBreadcrumbs from '@/components/admin/AdminBreadcrumbs';
import nsAdminFiche from '@/lib/i18n/locales/admin-fr/adminFiche';
import EntityHeader from '@/features/admin/_shared/ui/EntityHeader';
import EntityHistoryButton from '@/components/admin/EntityHistoryButton';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  FicheLayout,
  FicheSection,
  MetaList,
} from '@/features/admin/_shared/ui/Fiche';

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

type AdherentData = AdherentRecord;

function AdminEditAdherentPage(_props: Props) {
  const t = useAdminT(nsAdminAdherentDetail);
  const tf = useAdminT(nsAdminFiche);
  const router = useRouter();
  const { id } = router.query;
  const idStr = typeof id === 'string' ? id : undefined;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const detail = useAdherent(idStr);
  const { data: cotisationAmount = 0 } = useCotisationAmount();

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

  const hydrate = useCallback((data: AdherentData) => {
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
  }, []);
  const hydrated = useHydrateOnce(idStr ?? null, detail.data, hydrate);
  // Lecture en échec : écran « introuvable », comme avant.
  const loading = !detail.error && !hydrated;
  const adherent: AdherentData | null = hydrated ? (detail.data ?? null) : null;

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
      await adherentsClient.update(idStr as string, {
        ...form,
        paymentMethod: form.paymentMethod || null,
      });
      // La liste (cache partagé) est périmée : relue au retour.
      void queryClient.invalidateQueries({ queryKey: adherentsKeys.all });

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
      <div className="flex min-h-screen items-center justify-center px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--line2,rgba(194,196,201,.2))] border-t-[var(--t1,#f4edf7)]" />
      </div>
    );
  }

  if (!adherent) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <p className="text-[var(--t3,#a39ba6)]">{t.notFound}</p>
        <Link
          href="/admin/adherents"
          className="text-[var(--or-200,#eec4ff)] hover:underline"
        >
          {t.backToList}
        </Link>
      </div>
    );
  }

  const fullName = `${adherent.first_name} ${adherent.last_name}`;
  const formId = 'adherent-edit-form';
  const inputClass =
    'w-full px-4 py-3 rounded-xl bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] text-[var(--t1,#f4edf7)]';
  const labelClass = 'block text-sm font-medium text-[var(--t2,#c7bfca)] mb-2';

  return (
    <>
      <Head>
        <title>{format(t.pageTitle, { name: fullName })}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <AdminBreadcrumbs />

        <EntityHeader
          crest={fullName.trim().slice(0, 3).toUpperCase() || undefined}
          title={fullName}
          meta={
            <>
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
            </>
          }
          status={
            adherent.member_number ? (
              <Chip>{adherent.member_number}</Chip>
            ) : undefined
          }
          actions={
            <>
              <EntityHistoryButton
                entityType="adherent"
                entityId={adherent.id}
              />
              <AdminButtonLink
                href="/admin/adherents"
                className={saving ? 'pointer-events-none opacity-50' : ''}
              >
                {tf.cancel}
              </AdminButtonLink>
              <AdminButton
                variant="primary"
                type="submit"
                form={formId}
                disabled={saving}
              >
                {saving ? tf.saving : tf.save}
              </AdminButton>
            </>
          }
        />

        <FicheLayout
          main={
            <form id={formId} onSubmit={handleSubmit}>
              <fieldset disabled={saving} className="flex flex-col gap-6">
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
                        onChange={(e) =>
                          updateField('firstName', e.target.value)
                        }
                        className={inputClass}
                        required
                      />
                    </div>

                    <div>
                      <label className={labelClass}>{t.lastName}</label>
                      <input
                        type="text"
                        value={form.lastName}
                        onChange={(e) =>
                          updateField('lastName', e.target.value)
                        }
                        className={inputClass}
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
                      />
                    </div>

                    <div>
                      <label className={labelClass}>{t.birthDate}</label>
                      <input
                        type="date"
                        value={form.birthDate}
                        onChange={(e) =>
                          updateField('birthDate', e.target.value)
                        }
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
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className={labelClass}>{t.address}</label>
                      <input
                        type="text"
                        value={form.address}
                        onChange={(e) => updateField('address', e.target.value)}
                        className={inputClass}
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
                      />
                    </div>

                    <div>
                      <label className={labelClass}>{t.city}</label>
                      <input
                        type="text"
                        value={form.city}
                        onChange={(e) => updateField('city', e.target.value)}
                        className={inputClass}
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
                        onChange={(e) =>
                          updateField('joinDate', e.target.value)
                        }
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
                          updateField(
                            'role',
                            e.target.value as FormData['role']
                          )
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
              </fieldset>
            </form>
          }
          aside={
            <FicheSection eyebrow title={tf.metaTitle}>
              <MetaList
                items={[
                  {
                    label: tf.metaId,
                    value: `${adherent.id.slice(0, 8)}…`,
                  },
                  {
                    label: tf.metaCreated,
                    value: new Date(adherent.created_at).toLocaleString(
                      'fr-FR'
                    ),
                  },
                  {
                    label: tf.metaUpdated,
                    value: new Date(adherent.updated_at).toLocaleString(
                      'fr-FR'
                    ),
                  },
                ]}
              />
            </FicheSection>
          }
        />
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage({
  permission: 'manage_communications',
});

export default withAdminQuery(AdminEditAdherentPage);
