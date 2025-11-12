/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useRef, useState } from 'react';

type Status = 'idle' | 'loading' | 'success' | 'error';

export default function Contact({ className = '' }: { className?: string }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const liveRef = useRef<HTMLSpanElement | null>(null);

  const formspreeId = process.env.NEXT_PUBLIC_FORMSPREE_ID; // e.g. "f/abcdwxyz"
  const endpoint = formspreeId ? `https://formspree.io/${formspreeId}` : '';

  // --- Confetti (SSR-safe) ---
  const burstConfetti = useCallback(async () => {
    // import dynamique côté client uniquement
    const { default: confetti } = await import('canvas-confetti');
    const count = 180;
    const defaults = { origin: { y: 0.6 } };

    function fire(particleRatio: number, opts: Record<string, any>) {
      confetti(Object.assign({}, defaults, opts, {
        particleCount: Math.floor(count * particleRatio),
      }));
    }

    fire(0.25, { spread: 26, startVelocity: 55 });
    fire(0.2,  { spread: 60 });
    fire(0.35, { spread: 100, decay: 0.91, scalar: 0.9 });
    fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
    fire(0.1,  { spread: 120, startVelocity: 45 });
  }, []);

  useEffect(() => {
    if (status === 'success') burstConfetti();
  }, [status, burstConfetti]);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!endpoint) {
      setStatus('error');
      setError('Formspree ID manquant. Définis NEXT_PUBLIC_FORMSPREE_ID dans .env.local');
      return;
    }

    const form = e.currentTarget;
    const data = new FormData(form);

    // Honeypot anti-bot
    if ((data.get('company') as string)?.trim()) {
      setStatus('success');
      form.reset();
      return;
    }

    setStatus('loading');
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: data,
      });
      const json = await res.json();

      if (res.ok) {
        setStatus('success');
        form.reset();
        liveRef.current?.focus();
      } else {
        setStatus('error');
        setError(json?.errors?.[0]?.message || 'Une erreur est survenue. Réessaie plus tard.');
      }
    } catch {
      setStatus('error');
      setError('Impossible de joindre le service. Vérifie ta connexion.');
    }
  };

  return (
    <section id="contact">
      <div className="max-w-3xl mx-auto">
        {/* Titre style site: gradient + sous-titre fin */}
        <div className="text-center">
          <p className="mt-4 text-gray-300">
            Une question sur l’OW Women&apos;s Cup ? Laisse-nous un message, on répond vite.
          </p>
        </div>

        {/* Card verre/frosted pour matcher la home */}
        <form
          onSubmit={onSubmit}
          className="mt-10 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-6 sm:p-8 shadow-[0_0_0_1px_rgba(255,255,255,0.04)] grid gap-6"
        >
          {/* Live region (a11y) */}
          <span
            ref={liveRef}
            tabIndex={-1}
            aria-live="polite"
            className="sr-only"
          >
            {status === 'success' ? 'Message envoyé avec succès.' : ''}
          </span>

          {/* Honeypot anti-spam */}
          <input
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            className="hidden"
            aria-hidden="true"
          />

          <div className="grid sm:grid-cols-2 gap-6">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-gray-200">Nom</label>
              <input
                id="name"
                name="name"
                required
                className="w-full rounded-xl bg-[#0b1020] border border-white/10 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-400/70 focus:border-transparent"
                placeholder="Ana Dupont"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="text-gray-200">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                inputMode="email"
                required
                className="w-full rounded-xl bg-[#0b1020] border border-white/10 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-400/70 focus:border-transparent"
                placeholder="ana@email.com"
              />
            </div>
          </div>

          <div className="grid gap-2">
            <label htmlFor="subject" className="text-gray-200">Sujet</label>
            <input
              id="subject"
              name="subject"
              required
              className="w-full rounded-xl bg-[#0b1020] border border-white/10 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-400/70 focus:border-transparent"
              placeholder="Demande d’informations"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="message" className="text-gray-200">Message</label>
            <textarea
              id="message"
              name="message"
              required
              rows={6}
              className="w-full rounded-xl bg-[#0b1020] border border-white/10 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-blue-400/70 focus:border-transparent"
              placeholder="Ton message…"
            />
          </div>

          <label className="flex items-start gap-3 text-gray-300 text-sm">
            <input type="checkbox" name="consent" required className="mt-1 accent-blue-500" />
            J’accepte que mes informations soient utilisées pour traiter ma demande. (Pas de revente.)
          </label>

          <div className="flex flex-wrap items-center gap-4">
            <button
              type="submit"
              disabled={status === 'loading'}
              className="relative inline-flex items-center justify-center rounded-2xl px-6 py-3 font-medium text-white
                bg-gradient-to-r from-blue-600 to-cyan-500
                shadow-[0_10px_30px_rgba(0,180,255,0.25)]
                hover:from-blue-500 hover:to-cyan-400
                focus:outline-none focus:ring-2 focus:ring-blue-400/60
                disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {status === 'loading' ? 'Envoi…' : 'Envoyer'}
            </button>

            {status === 'success' && (
              <span className="text-green-400">Merci ! Ton message a bien été envoyé 🎉</span>
            )}
            {status === 'error' && (
              <span className="text-red-400">{error}</span>
            )}
          </div>
        </form>
      </div>
    </section>
  );
}
