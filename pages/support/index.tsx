// pages/support/index.tsx
// Public support / safety reporting form. Anyone can submit, optionally
// anonymously. HIGH severity submissions ping the moderation role on Discord.

import { useState } from 'react';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';

type SupportDict = ReturnType<typeof useT<'supportPage'>>;

type Category = 'dispute' | 'behavior' | 'technical' | 'other';
type Severity = 'low' | 'medium' | 'high';

const getCategoryOptions = (
  t: SupportDict
): {
  value: Category;
  label: string;
  description: string;
}[] => [
  {
    value: 'dispute',
    label: t.catDisputeLabel,
    description: t.catDisputeDesc,
  },
  {
    value: 'behavior',
    label: t.catBehaviorLabel,
    description: t.catBehaviorDesc,
  },
  {
    value: 'technical',
    label: t.catTechnicalLabel,
    description: t.catTechnicalDesc,
  },
  {
    value: 'other',
    label: t.catOtherLabel,
    description: t.catOtherDesc,
  },
];

const getSeverityOptions = (
  t: SupportDict
): {
  value: Severity;
  label: string;
  hint: string;
  color: string;
}[] => [
  { value: 'low', label: t.sevLowLabel, hint: t.sevLowHint, color: 'blue' },
  {
    value: 'medium',
    label: t.sevMediumLabel,
    hint: t.sevMediumHint,
    color: 'amber',
  },
  {
    value: 'high',
    label: t.sevHighLabel,
    hint: t.sevHighHint,
    color: 'red',
  },
];

export default function SupportPage() {
  const t = useT('supportPage');
  const categoryOptions = getCategoryOptions(t);
  const severityOptions = getSeverityOptions(t);
  const [category, setCategory] = useState<Category>('behavior');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ ref: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!message.trim() || message.trim().length < 10) {
      setError(t.errMessageTooShort);
      return;
    }
    if (!isAnonymous && !email.trim()) {
      setError(t.errEmailRequired);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category,
          severity,
          isAnonymous,
          name: isAnonymous ? null : name.trim() || null,
          email: isAnonymous ? null : email.trim() || null,
          subject: subject.trim() || null,
          message: message.trim(),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || t.errSubmit);
      }
      setSuccess({ ref: json.referenceShort });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white pt-32 pb-16 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {t.pageTitle}
          </h1>
          <p className="text-neutral-400 mt-2 max-w-lg mx-auto">
            {t.pageSubtitle}
          </p>
        </div>

        {success ? (
          <div className="bg-emerald-900/30 border border-emerald-500/40 rounded-2xl p-8 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-600/20 border border-emerald-500/40 mb-4">
              <svg
                className="w-7 h-7 text-emerald-400"
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
            <h2 className="text-xl font-semibold mb-2">{t.successTitle}</h2>
            <p className="text-emerald-200/90 mb-4">{t.successBody}</p>
            <p className="text-sm text-emerald-300/80 mb-6">
              {t.referenceLabel}{' '}
              <code className="bg-emerald-900/40 px-2 py-0.5 rounded">
                {success.ref}
              </code>
            </p>
            <button
              type="button"
              onClick={() => {
                setSuccess(null);
                setSubject('');
                setMessage('');
              }}
              className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-sm font-medium transition-colors"
            >
              {t.anotherReport}
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 md:p-8 space-y-6"
          >
            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-2">
                {t.categoryLabel}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {categoryOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                      category === opt.value
                        ? 'border-blue-500 bg-blue-900/20'
                        : 'border-neutral-700 hover:bg-neutral-700/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="category"
                      value={opt.value}
                      checked={category === opt.value}
                      onChange={() => setCategory(opt.value)}
                      className="sr-only"
                    />
                    <div className="text-sm font-medium text-white">
                      {opt.label}
                    </div>
                    <div className="text-xs text-neutral-400 mt-1">
                      {opt.description}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Severity */}
            <div>
              <label className="block text-sm font-medium text-neutral-200 mb-2">
                {t.severityLabel}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {severityOptions.map((opt) => {
                  const ringColors: Record<string, string> = {
                    blue: 'border-blue-500 bg-blue-900/20',
                    amber: 'border-amber-500 bg-amber-900/20',
                    red: 'border-red-500 bg-red-900/20',
                  };
                  return (
                    <label
                      key={opt.value}
                      className={`cursor-pointer rounded-xl border p-3 transition-colors text-center ${
                        severity === opt.value
                          ? ringColors[opt.color]
                          : 'border-neutral-700 hover:bg-neutral-700/30'
                      }`}
                      title={opt.hint}
                    >
                      <input
                        type="radio"
                        name="severity"
                        value={opt.value}
                        checked={severity === opt.value}
                        onChange={() => setSeverity(opt.value)}
                        className="sr-only"
                      />
                      <div className="text-sm font-medium">{opt.label}</div>
                      <div className="text-xs text-neutral-400 mt-1">
                        {opt.hint}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Anonymous toggle */}
            <div className="flex items-start gap-3 bg-neutral-900/40 border border-neutral-700 rounded-xl p-3">
              <input
                id="anon"
                type="checkbox"
                checked={isAnonymous}
                onChange={(e) => setIsAnonymous(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-neutral-600 bg-neutral-900"
              />
              <label htmlFor="anon" className="text-sm cursor-pointer flex-1">
                <span className="font-medium">{t.anonToggle}</span>
                <span className="block text-xs text-neutral-400 mt-0.5">
                  {t.anonHint}
                </span>
              </label>
            </div>

            {/* Name + email (only if not anon) */}
            {!isAnonymous && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">
                    {t.nameLabel}
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={100}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t.namePlaceholder}
                  />
                </div>
                <div>
                  <label className="block text-sm text-neutral-400 mb-1">
                    {t.emailLabel} <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required={!isAnonymous}
                    className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={t.emailPlaceholder}
                  />
                </div>
              </div>
            )}

            {/* Subject */}
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.subjectLabel}
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={t.subjectPlaceholder}
              />
            </div>

            {/* Message */}
            <div>
              <label className="block text-sm text-neutral-400 mb-1">
                {t.messageLabel} <span className="text-red-400">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                minLength={10}
                maxLength={5000}
                rows={6}
                className="w-full px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                placeholder={t.messagePlaceholder}
              />
              <p className="text-xs text-neutral-500 mt-1 text-right">
                {message.length} / 5000
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-base font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {t.submitting}
                </>
              ) : (
                t.submit
              )}
            </button>

            <p className="text-xs text-neutral-500 text-center">
              {t.discordNote}
            </p>
          </form>
        )}
      </div>
    </main>
  );
}

const supportSeo: SeoProps = {
  title: {
    fr: 'Support & signalement',
    en: 'Support & reporting',
  },
  description: {
    fr: "Besoin d'aide ? Signale un litige, un comportement inapproprié ou un souci technique à l'OW Women's Cup, la coupe féminine Overwatch. Réponse rapide de l'équipe.",
    en: "Need help? Report a dispute, inappropriate behaviour or a technical issue to OW Women's Cup, the women's Overwatch cup. Quick response from the team.",
  },
};

SupportPage.seo = supportSeo;
