import Head from 'next/head';
import { FormEvent, useEffect, useState } from 'react';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';
import Button from '@/components/Buttons/button';

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  cta_label: string | null;
  cta_url: string | null;
  is_active: boolean;
  priority: number | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type StaffProps = {
  staff: {
    id: string;
    role: string;
    display_name: string | null;
  };
};

type FormState = {
  title: string;
  message: string;
  ctaLabel: string;
  ctaUrl: string;
  startsAt: string;
  endsAt: string;
  priority: number;
  isActive: boolean;
};

const initialForm: FormState = {
  title: '',
  message: '',
  ctaLabel: '',
  ctaUrl: '',
  startsAt: '',
  endsAt: '',
  priority: 0,
  isActive: true,
};

export const getServerSideProps = withStaffPage('admin');

export default function AdminAnnouncements({ staff }: StaffProps) {
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        throw new Error('Session staff manquante.');
      }
      const res = await fetch('/api/admin/announcements?limit=200', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur de chargement');
      setItems(json.items || []);
    } catch (err: any) {
      console.error('admin announcements load error', err);
      setError(err?.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateField = (key: keyof FormState, value: any) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const resetForm = () => {
    setForm(initialForm);
    setEditingId(null);
  };

  const onEdit = (row: AnnouncementRow) => {
    setEditingId(row.id);
    setForm({
      title: row.title,
      message: row.message,
      ctaLabel: row.cta_label || '',
      ctaUrl: row.cta_url || '',
      startsAt: row.starts_at ? row.starts_at.slice(0, 16) : '',
      endsAt: row.ends_at ? row.ends_at.slice(0, 16) : '',
      priority: row.priority ?? 0,
      isActive: !!row.is_active,
    });
  };

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer cette annonce ?')) return;
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');
      const res = await fetch(`/api/admin/announcements/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Suppression impossible');
      }
      setItems((prev) => prev.filter((a) => a.id !== id));
      if (editingId === id) resetForm();
    } catch (err: any) {
      alert(err?.message || 'Erreur de suppression.');
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

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

      const res = await fetch(
        editingId
          ? `/api/admin/announcements/${editingId}`
          : '/api/admin/announcements',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.error || 'Enregistrement impossible');
      }

      resetForm();
      await load();
    } catch (err: any) {
      setError(err?.message || 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString('fr-FR') : '—';

  return (
    <>
      <Head>
        <title>Admin – Annonces</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl font-bold mt-1">Annonces / bandeau pub</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Créez et planifiez les messages sponsorisés affichés sur la
              page d&apos;accueil.
            </p>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          <section className="rounded-2xl border border-white/10 bg-neutral-800/60 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                {editingId ? 'Modifier une annonce' : 'Nouvelle annonce'}
              </h2>
              {editingId && (
                <button
                  onClick={resetForm}
                  className="text-sm px-3 py-1.5 rounded-lg border border-white/20 hover:border-white/40 transition"
                >
                  Réinitialiser
                </button>
              )}
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Titre *
                  <input
                    value={form.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2"
                    required
                  />
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.isActive}
                    onChange={(e) => updateField('isActive', e.target.checked)}
                    className="h-4 w-4"
                  />
                  Activer l&apos;annonce
                </label>
              </div>

              <label className="flex flex-col gap-1 text-sm">
                Message *
                <textarea
                  value={form.message}
                  onChange={(e) => updateField('message', e.target.value)}
                  rows={3}
                  className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2"
                  required
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="flex flex-col gap-1 text-sm">
                  Label CTA
                  <input
                    value={form.ctaLabel}
                    onChange={(e) => updateField('ctaLabel', e.target.value)}
                    placeholder="Découvrir, Voir l'offre..."
                    className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  URL CTA
                  <input
                    value={form.ctaUrl}
                    onChange={(e) => updateField('ctaUrl', e.target.value)}
                    placeholder="https://..."
                    className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm">
                  Début (UTC)
                  <input
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(e) => updateField('startsAt', e.target.value)}
                    className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Fin (UTC)
                  <input
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(e) => updateField('endsAt', e.target.value)}
                    className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2"
                  />
                </label>
                <label className="flex flex-col gap-1 text-sm">
                  Priorité
                  <input
                    type="number"
                    value={form.priority}
                    onChange={(e) =>
                      updateField('priority', Number(e.target.value))
                    }
                    className="rounded-lg bg-neutral-900 border border-white/10 px-3 py-2"
                  />
                </label>
              </div>

              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  size="compact"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold"
                >
                  {saving
                    ? 'Enregistrement...'
                    : editingId
                      ? 'Mettre à jour'
                      : 'Créer'}
                </Button>
                {error && (
                  <span className="text-sm text-red-200">{error}</span>
                )}
              </div>
            </form>
          </section>

          <section className="rounded-2xl border border-white/10 bg-neutral-800/40 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Annonces existantes</h2>
              <Button
                type="button"
                size="compact"
                onClick={load}
                className="px-3 py-1.5 text-sm"
              >
                Rafraîchir
              </Button>
            </div>

            {loading && <div className="text-neutral-300">Chargement…</div>}
            {!loading && items.length === 0 && (
              <div className="text-neutral-300">
                Aucune annonce pour le moment.
              </div>
            )}

            <div className="space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-white/10 bg-neutral-900/60 p-4 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-lg font-semibold">
                        {item.title}
                      </span>
                      <StatusBadge active={item.is_active} />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onEdit(item)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/30"
                      >
                        Modifier
                      </button>
                      <button
                        onClick={() => onDelete(item.id)}
                        className="text-sm px-3 py-1.5 rounded-lg border border-red-500/40 text-red-200 hover:border-red-400"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-neutral-200">{item.message}</p>
                  <div className="text-xs text-neutral-400 flex flex-wrap gap-3">
                    <span>CTA : {item.cta_label || '—'}</span>
                    <span>Priorité : {item.priority ?? 0}</span>
                    <span>Début : {formatDate(item.starts_at)}</span>
                    <span>Fin : {formatDate(item.ends_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  const cls = active
    ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
    : 'bg-neutral-600/40 text-neutral-200 border-neutral-400/30';
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full border uppercase tracking-wide ${cls}`}
    >
      {active ? 'Actif' : 'Inactif'}
    </span>
  );
}
