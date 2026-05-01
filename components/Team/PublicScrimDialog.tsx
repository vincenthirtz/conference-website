// components/team/PublicScrimDialog.tsx
// Modal form letting any visitor (no login required) propose a scrim to a team.
// Submits to POST /api/public/scrim-requests.

import { useEffect, useState } from 'react';

type Props = {
  teamId: string;
  teamName: string;
  open: boolean;
  onClose: () => void;
};

type Captcha = { token: string; question: string };

export default function PublicScrimDialog({
  teamId,
  teamName,
  open,
  onClose,
}: Props) {
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [fromTeamName, setFromTeamName] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterEmail, setRequesterEmail] = useState('');
  const [requesterDiscord, setRequesterDiscord] = useState('');
  const [preferredDate, setPreferredDate] = useState('');
  const [format, setFormat] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch a fresh captcha challenge whenever the modal opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/captcha');
        const data = await res.json();
        if (!cancelled && res.ok) {
          setCaptcha({ token: data.token, question: data.question });
          setCaptchaAnswer('');
        }
      } catch {
        // Network errors are surfaced on submit.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset transient state when the modal closes.
  useEffect(() => {
    if (open) return;
    setSuccess(null);
    setError(null);
    setSubmitting(false);
  }, [open]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/public/scrim-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetTeamId: teamId,
          fromTeamName,
          requesterName,
          requesterEmail,
          requesterDiscord: requesterDiscord || undefined,
          preferredDate: preferredDate || undefined,
          format: format || undefined,
          message: message || undefined,
          honeypot,
          captchaToken: captcha?.token,
          captchaAnswer,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Refresh captcha on failure (server invalidates the token after use
        // semantics may vary, but a fresh challenge avoids a confused user).
        try {
          const c = await fetch('/api/captcha');
          if (c.ok) {
            const cd = await c.json();
            setCaptcha({ token: cd.token, question: cd.question });
            setCaptchaAnswer('');
          }
        } catch {
          /* noop */
        }
        throw new Error(data?.error || 'Échec de la demande.');
      }
      setSuccess(data.message || 'Demande envoyée.');
      setMessage('');
      setPreferredDate('');
      setFormat('');
    } catch (err) {
      setError((err as Error)?.message || 'Erreur inconnue.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="public-scrim-title"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-neutral-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2
              id="public-scrim-title"
              className="text-lg font-semibold text-white"
            >
              Proposer un scrim à {teamName}
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              Le capitaine recevra ta demande et pourra te répondre via le
              contact que tu fournis ci-dessous.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="text-gray-400 hover:text-white"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {success ? (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            {success}
            <div className="mt-3">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-white/10 text-xs hover:bg-white/20"
              >
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3" noValidate>
            {/* Honeypot — hidden from real users via aria + position */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: '-9999px',
                width: '1px',
                height: '1px',
              }}
            >
              <label>
                Ne pas remplir
                <input
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                />
              </label>
            </div>

            <Field
              label="Équipe demandeuse"
              required
              value={fromTeamName}
              onChange={setFromTeamName}
              maxLength={80}
              placeholder="Nom de ton équipe"
            />
            <Field
              label="Nom du contact"
              required
              value={requesterName}
              onChange={setRequesterName}
              maxLength={80}
              placeholder="Pseudo ou prénom"
            />
            <Field
              label="Email"
              required
              type="email"
              value={requesterEmail}
              onChange={setRequesterEmail}
              maxLength={200}
              placeholder="contact@example.com"
            />
            <Field
              label="Discord (optionnel)"
              value={requesterDiscord}
              onChange={setRequesterDiscord}
              maxLength={100}
              placeholder="pseudo ou invite Discord"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field
                label="Date souhaitée"
                type="datetime-local"
                value={preferredDate}
                onChange={setPreferredDate}
              />
              <Field
                label="Format"
                value={format}
                onChange={setFormat}
                maxLength={50}
                placeholder="ex. 5v5 BO3"
              />
            </div>
            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                Message (optionnel)
              </label>
              <textarea
                rows={3}
                maxLength={1000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Précise tes disponibilités, le serveur, etc."
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm text-white"
              />
            </div>

            <div>
              <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                Anti-bot — combien font {captcha?.question || '...'} ?
              </label>
              <input
                type="text"
                inputMode="numeric"
                required
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
                placeholder="Réponds par un nombre"
                className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm text-white"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-lg border border-white/10 bg-white/5 text-sm hover:bg-white/10"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || !captcha}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white"
              >
                {submitting ? 'Envoi…' : 'Envoyer la demande'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  type = 'text',
  value,
  onChange,
  maxLength,
  placeholder,
}: {
  label: string;
  required?: boolean;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
        {label}
        {required && <span className="text-red-300"> *</span>}
      </label>
      <input
        type={type}
        required={required}
        maxLength={maxLength}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-500 text-sm text-white"
      />
    </div>
  );
}
