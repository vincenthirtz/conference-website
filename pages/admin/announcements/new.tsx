import { useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';
import Button from '@/components/Buttons/button';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

type FormState = {
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
  priority: string;
  isActive: boolean;
};

export const getServerSideProps = withStaffPage('admin');

function AdminAnnouncementCreatePage({ staff }: Props) {
  const router = useRouter();

  const [form, setForm] = useState<FormState>({
    title: '',
    message: '',
    ctaLabel: '',
    ctaUrl: '',
    startsAt: '',
    endsAt: '',
    priority: '0',
    isActive: true,
  });

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function updateField<K extends keyof FormState>(
    key: K,
    value: FormState[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.title.trim()) {
      setErrorMsg("Le titre de l'annonce est obligatoire.");
      return;
    }

    if (!form.message.trim()) {
      setErrorMsg("Le message de l'annonce est obligatoire.");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Session staff manquante.');
      }

      const payload = {
        title: form.title.trim(),
        message: form.message.trim(),
        ctaLabel: form.ctaLabel.trim() || null,
        ctaUrl: form.ctaUrl.trim() || null,
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
        isActive: form.isActive,
        priority: Number(form.priority) || 0,
      };

      const res = await fetch('/api/admin/announcements', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de la création de l'annonce");
      }

      router.push('/admin/announcements');
    } catch (err: any) {
      setErrorMsg(
        err?.message ?? "Erreur inconnue lors de la création de l'annonce"
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Nouvelle annonce</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Nouvelle annonce</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Créez un bandeau publicitaire ou une annonce pour la page
              d&apos;accueil.
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Informations générales */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Informations générales</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Titre <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Offre spéciale partenaire"
                  />
                </div>

                <div className="flex items-center gap-4">
                  <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                    <input
                      type="checkbox"
                      className="rounded border-neutral-500 bg-neutral-700 h-4 w-4"
                      checked={form.isActive}
                      onChange={(e) => updateField('isActive', e.target.checked)}
                    />
                    <span>Activer l&apos;annonce</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm mb-1 text-neutral-300">
                  Message <span className="text-red-400">*</span>
                </label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  placeholder="Découvrez notre partenaire avec -20% sur votre première commande..."
                />
              </div>
            </section>

            {/* Call to Action */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Call to Action (optionnel)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Label du bouton
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.ctaLabel}
                    onChange={(e) => updateField('ctaLabel', e.target.value)}
                    placeholder="Découvrir, Voir l'offre..."
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    URL du bouton
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.ctaUrl}
                    onChange={(e) => updateField('ctaUrl', e.target.value)}
                    placeholder="https://..."
                  />
                </div>
              </div>
            </section>

            {/* Planification */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Planification</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Date de début
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.startsAt}
                    onChange={(e) => updateField('startsAt', e.target.value)}
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Laissez vide pour afficher immédiatement.
                  </p>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Date de fin
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.endsAt}
                    onChange={(e) => updateField('endsAt', e.target.value)}
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Laissez vide pour une durée indéfinie.
                  </p>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Priorité
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.priority}
                    onChange={(e) => updateField('priority', e.target.value)}
                    placeholder="0"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Plus le chiffre est élevé, plus l&apos;annonce est
                    prioritaire.
                  </p>
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-neutral-700/50">
              <Button
                type="button"
                size="compact"
                className="px-4 py-2.5"
                onClick={() => router.push('/admin/announcements')}
                disabled={submitting}
              >
                Annuler
              </Button>

              <Button
                type="submit"
                size="compact"
                disabled={submitting}
                className="px-5 py-2.5 font-semibold bg-emerald-600 hover:bg-emerald-700"
              >
                {submitting ? 'Création...' : "Créer l'annonce"}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminAnnouncementCreatePage;
