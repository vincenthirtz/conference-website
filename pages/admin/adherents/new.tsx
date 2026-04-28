import { useState, useEffect } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';
import { useAutoSave } from '@/utils/useAutoSave';
import DraftBanner from '@/components/admin/DraftBanner';
import AutoSaveIndicator from '@/components/admin/AutoSaveIndicator';

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

function AdminNewAdherentPage({ staff }: Props) {
  const router = useRouter();
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
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        if (!token) return;

        const res = await fetch('/api/admin/site-settings', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        const cotisation = json.items?.find(
          (s: { key: string }) => s.key === 'cotisation_amount'
        );
        if (cotisation?.value) {
          setCotisationAmount(parseFloat(cotisation.value) || 0);
        }
      } catch (err) {
        console.error('Error fetching settings', err);
      }
    };
    fetchSettings();
  }, []);

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
      setError('Le prénom est requis.');
      return;
    }
    if (!form.lastName.trim()) {
      setError('Le nom est requis.');
      return;
    }
    if (!form.email.trim()) {
      setError("L'email est requis.");
      return;
    }

    setSaving(true);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const res = await fetch('/api/admin/adherents', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          paymentMethod: form.paymentMethod || null,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || 'Erreur lors de la création.');
      }

      clearDraft();
      router.push('/admin/adherents');
    } catch (err: unknown) {
      setError((err as Error).message || 'Une erreur est survenue.');
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

  return (
    <>
      <Head>
        <title>Admin - Nouvel adhérent</title>
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
              Retour aux adhérents
            </Link>
            <h1 className="text-3xl font-bold tracking-tight">
              Nouvel adhérent
            </h1>
            {cotisationAmount > 0 && (
              <p className="text-neutral-400 text-sm mt-1">
                Cotisation annuelle : {cotisationAmount.toFixed(2)} €
              </p>
            )}
          </div>

          <form
            onSubmit={handleSubmit}
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8 space-y-8"
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
                Informations personnelles
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Prénom *
                  </label>
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="Marie"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Nom *
                  </label>
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="Dupont"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => updateField('email', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="marie@exemple.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="06 12 34 56 78"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Date de naissance
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
                    Pays
                  </label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => updateField('country', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="France"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Adresse
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => updateField('address', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="123 rue de la Paix"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Code postal
                  </label>
                  <input
                    type="text"
                    value={form.postalCode}
                    onChange={(e) => updateField('postalCode', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="75001"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={form.city}
                    onChange={(e) => updateField('city', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="Paris"
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
                Adhésion
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Date d&apos;adhésion
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
                    Année de cotisation
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
                    Rôle dans l&apos;association
                  </label>
                  <select
                    value={form.role}
                    onChange={(e) =>
                      updateField('role', e.target.value as FormData['role'])
                    }
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                  >
                    <option value="member">Membre</option>
                    <option value="volunteer">Bénévole</option>
                    <option value="board">Membre du bureau</option>
                    <option value="president">Président(e)</option>
                    <option value="treasurer">Trésorier(ère)</option>
                    <option value="secretary">Secrétaire</option>
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
                      Membre actif
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
                  Paiement de la cotisation
                </h2>
                {cotisationAmount > 0 && form.paymentStatus !== 'paid' && (
                  <button
                    type="button"
                    onClick={markAsPaid}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-sm hover:bg-emerald-600/30 transition"
                  >
                    Marquer comme payé ({cotisationAmount.toFixed(2)} €)
                  </button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Statut du paiement
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
                    <option value="pending">En attente</option>
                    <option value="partial">Partiel</option>
                    <option value="paid">Payé</option>
                    <option value="exempt">Exempté</option>
                    <option value="overdue">En retard</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Montant payé (€)
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
                    placeholder="0.00"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Date du paiement
                  </label>
                  <input
                    type="date"
                    value={form.paymentDate}
                    onChange={(e) => updateField('paymentDate', e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Mode de paiement
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
                    <option value="">Non spécifié</option>
                    <option value="cash">Espèces</option>
                    <option value="check">Chèque</option>
                    <option value="transfer">Virement</option>
                    <option value="card">Carte bancaire</option>
                    <option value="helloasso">HelloAsso</option>
                    <option value="other">Autre</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Référence de paiement
                  </label>
                  <input
                    type="text"
                    value={form.paymentReference}
                    onChange={(e) =>
                      updateField('paymentReference', e.target.value)
                    }
                    className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white"
                    placeholder="N° de chèque, ID transaction HelloAsso..."
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
                Notes internes
              </h2>
              <textarea
                value={form.notes}
                onChange={(e) => updateField('notes', e.target.value)}
                rows={3}
                className="w-full px-4 py-3 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-white resize-none"
                placeholder="Notes internes (visibles uniquement par le staff)..."
              />
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
                    Création...
                  </>
                ) : (
                  "Créer l'adhérent"
                )}
              </button>
              <Link
                href="/admin/adherents"
                className="px-6 py-3 rounded-xl border border-neutral-600 text-sm font-semibold text-white text-center transition hover:bg-neutral-800"
              >
                Annuler
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminNewAdherentPage;
