import Link from 'next/link';
import { useState } from 'react';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

type FormData = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  website: string;
  category: 'super' | 'major' | 'cultural' | 'other' | '';
  message: string;
  budgetRange: string;
};

const budgetOptions = [
  'Moins de 500 EUR',
  '500 - 1000 EUR',
  '1000 - 3000 EUR',
  '3000 - 5000 EUR',
  'Plus de 5000 EUR',
  'Soutien en nature (matériel, services)',
  'À discuter',
];

function PartnershipRequestPage() {
  const t = useT('partnerRequest');

  const categoryLabels: Record<string, string> = {
    super: t.categorySuper,
    major: t.categoryMajor,
    cultural: t.categoryCultural,
    other: t.categoryOther,
  };

  const budgetLabels: Record<string, string> = {
    'Moins de 500 EUR': t.budgetLt500,
    '500 - 1000 EUR': t.budget500to1000,
    '1000 - 3000 EUR': t.budget1000to3000,
    '3000 - 5000 EUR': t.budget3000to5000,
    'Plus de 5000 EUR': t.budgetGt5000,
    'Soutien en nature (matériel, services)': t.budgetInKind,
    'À discuter': t.budgetToDiscuss,
  };

  const [form, setForm] = useState<FormData>({
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    website: '',
    category: '',
    message: '',
    budgetRange: '',
  });
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Basic validation
    if (!form.companyName.trim()) {
      setError(t.errorCompanyRequired);
      return;
    }
    if (!form.contactName.trim()) {
      setError(t.errorContactRequired);
      return;
    }
    if (!form.email.trim()) {
      setError(t.errorEmailRequired);
      return;
    }
    if (!form.category) {
      setError(t.errorCategoryRequired);
      return;
    }
    if (!form.message.trim()) {
      setError(t.errorMessageRequired);
      return;
    }

    setSending(true);

    try {
      const res = await fetch('/api/partnership-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || t.errorSendGeneric);
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || t.errorSendFallback);
    } finally {
      setSending(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center px-4">
        <div className="max-w-lg text-center">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <svg
              className="w-10 h-10 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h1 className="text-3xl font-bold mb-4">{t.successTitle}</h1>
          <p className="text-gray-300 mb-6">{t.successMessage}</p>
          <Link
            href="/partenaires"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110"
          >
            {t.backToPartners}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -left-24 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-0 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-3xl px-6 pt-32 pb-16">
          <Link
            href="/partenaires"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition mb-6"
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
            {t.backToPartners}
          </Link>

          <h1 className="text-3xl sm:text-4xl font-bold leading-tight">
            {t.pageTitle}
          </h1>
          <p className="mt-4 text-gray-300">{t.intro}</p>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 pb-20 sm:px-6">
        <form
          onSubmit={handleSubmit}
          className="bg-neutral-900/50 border border-white/10 rounded-2xl p-6 sm:p-8 space-y-6"
        >
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

          <div className="grid gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelCompany}
              </label>
              <input
                type="text"
                value={form.companyName}
                onChange={(e) => updateField('companyName', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
                placeholder={t.phCompany}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelContact}
              </label>
              <input
                type="text"
                value={form.contactName}
                onChange={(e) => updateField('contactName', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
                placeholder={t.phContact}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelEmail}
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => updateField('email', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
                placeholder={t.phEmail}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelPhone}
              </label>
              <input
                type="tel"
                value={form.phone}
                onChange={(e) => updateField('phone', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
                placeholder={t.phPhone}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelWebsite}
              </label>
              <input
                type="url"
                value={form.website}
                onChange={(e) => updateField('website', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500"
                placeholder={t.phWebsite}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelCategory}
              </label>
              <select
                value={form.category}
                onChange={(e) => updateField('category', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
                required
              >
                <option value="">{t.optionCategoryPlaceholder}</option>
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelBudget}
              </label>
              <select
                value={form.budgetRange}
                onChange={(e) => updateField('budgetRange', e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white"
              >
                <option value="">{t.optionBudgetPlaceholder}</option>
                {budgetOptions.map((option) => (
                  <option key={option} value={option}>
                    {budgetLabels[option] ?? option}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                {t.labelMessage}
              </label>
              <textarea
                value={form.message}
                onChange={(e) => updateField('message', e.target.value)}
                rows={5}
                className="w-full px-4 py-3 rounded-xl bg-neutral-800 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-white placeholder-gray-500 resize-none"
                placeholder={t.phMessage}
                required
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="submit"
              disabled={sending}
              className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-sm font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.submitting}
                </>
              ) : (
                t.submit
              )}
            </button>
            <Link
              href="/partenaires"
              className="px-6 py-3 rounded-xl border border-white/20 text-sm font-semibold text-white text-center transition hover:bg-white/10"
            >
              {t.cancel}
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

const partnershipRequestSeo: SeoProps = {
  title: {
    fr: 'Devenir partenaire',
    en: 'Become a partner',
  },
  description: {
    fr: "Faites une demande de partenariat pour soutenir l'OW Women's Cup et la scène Overwatch féminine.",
    en: "Submit a partnership request to support OW Women's Cup and the women's Overwatch scene.",
  },
};

PartnershipRequestPage.seo = partnershipRequestSeo;

export default PartnershipRequestPage;
