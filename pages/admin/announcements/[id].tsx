import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';
import Button from '@/components/Buttons/button';
import { useToast } from '@/components/Toast';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

type AnnouncementData = {
  id: string;
  title: string;
  message: string;
  cta_label?: string | null;
  cta_url?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  priority: number;
  is_active: boolean;
  created_at: string;
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

function toDateTimeLocalValue(isoString: string | null | undefined): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

export const getServerSideProps = withStaffPage('admin');

function AdminAnnouncementEditPage({ staff }: Props) {
  const router = useRouter();
  const { addToast } = useToast();
  const { id } = router.query;

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
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

  const fetchAnnouncement = useCallback(async () => {
    if (!id || typeof id !== 'string') return;

    setLoading(true);
    setNotFound(false);
    setErrorMsg(null);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setErrorMsg('Session staff manquante.');
        setLoading(false);
        return;
      }

      const res = await fetch(`/api/admin/announcements/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        if (res.status === 404) {
          setNotFound(true);
        } else {
          const json = await res.json().catch(() => ({}));
          setErrorMsg(json.error || 'Erreur lors du chargement.');
        }
        setLoading(false);
        return;
      }

      const data: AnnouncementData = await res.json();

      setForm({
        title: data.title || '',
        message: data.message || '',
        ctaLabel: data.cta_label || '',
        ctaUrl: data.cta_url || '',
        startsAt: toDateTimeLocalValue(data.starts_at),
        endsAt: toDateTimeLocalValue(data.ends_at),
        priority: String(data.priority ?? 0),
        isActive: data.is_active ?? true,
      });
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Erreur inconnue.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAnnouncement();
  }, [fetchAnnouncement]);

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

      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de la mise à jour de l'annonce");
      }

      addToast('Annonce mise à jour avec succès.', 'success');
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ?? "Erreur inconnue lors de la mise à jour de l'annonce"
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer cette annonce ? Cette action est irréversible.")) {
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Session staff manquante.');
      }

      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok && res.status !== 204) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Erreur lors de la suppression.");
      }

      router.push('/admin/announcements');
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message || 'Erreur lors de la suppression.');
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <>
        <Head>
          <title>Admin – Chargement...</title>
        </Head>
        <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <Head>
          <title>Admin – Annonce introuvable</title>
        </Head>
        <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white p-6 pt-20">
          <div className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-8 text-center max-w-md mx-auto">
            <svg
              className="w-16 h-16 mx-auto mb-4 text-neutral-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h1 className="text-xl font-bold mb-2">Annonce introuvable</h1>
            <p className="text-neutral-400 mb-6">
              Cette annonce n&apos;existe pas ou a été supprimée.
            </p>
            <Button
              type="button"
              size="compact"
              onClick={() => router.push('/admin/announcements')}
            >
              Retour à la liste
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Head>
        <title>Admin – Modifier l&apos;annonce</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              type="button"
              onClick={() => router.push('/admin/announcements')}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              Retour aux annonces
            </button>
            <h1 className="text-3xl font-bold">Modifier l&apos;annonce</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Modifiez les informations de cette annonce.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDelete}
            disabled={submitting}
            className="px-4 py-2.5 rounded-xl bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 text-red-300 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
            Supprimer
          </button>
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
            {/* Informations generales */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Informations generales</h2>
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
                    placeholder="Offre speciale partenaire"
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
                  placeholder="Decouvrez notre partenaire avec -20% sur votre premiere commande..."
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
                    placeholder="Decouvrir, Voir l'offre..."
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
                    Date de debut
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.startsAt}
                    onChange={(e) => updateField('startsAt', e.target.value)}
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Laissez vide pour afficher immediatement.
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
                    Laissez vide pour une duree indefinie.
                  </p>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Priorite
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
                    Plus le chiffre est eleve, plus l&apos;annonce est
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
                {submitting ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminAnnouncementEditPage;
