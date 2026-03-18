import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import slugify from 'slugify';
import { supabaseClient } from '@/utils/supabase';
import { withStaffPage } from '@/utils/staff';
import LogoUpload from '@/components/admin/LogoUpload';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string | null;
  };
};

type FormState = {
  title: string;
  slug: string;
  tag: string;
  excerpt: string;
  imageUrl: string;
  content: string;
  status: 'draft' | 'published';
  publishedAt: string;
};

export const getServerSideProps = withStaffPage('admin');

const slugifyValue = (value: string) =>
  slugify(value, { lower: true, strict: true });

export default function AdminNewsEdit({ staff }: Props) {
  const router = useRouter();
  const { id } = router.query;

  const [form, setForm] = useState<FormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const updateField = (key: keyof FormState, value: string) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  useEffect(() => {
    const fetchItem = async () => {
      if (!id) return;
      setLoading(true);
      setError(null);
      try {
        const {
          data: { session },
        } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        if (!token) throw new Error('Session staff manquante.');

        const res = await fetch(`/api/admin/news/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || 'Chargement impossible');

        setForm({
          title: json.title || '',
          slug: json.slug || '',
          tag: json.tag || 'general',
          excerpt: json.excerpt || '',
          imageUrl: json.image_url || '',
          content: json.content || '',
          status: json.status || 'draft',
          publishedAt: json.published_at
            ? new Date(json.published_at).toISOString().slice(0, 16)
            : '',
        });
      } catch (err: unknown) {
        setError((err as Error)?.message || 'Erreur inattendue.');
      } finally {
        setLoading(false);
      }
    };
    fetchItem();
  }, [id]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const payload = {
        ...form,
        slug: form.slug || slugifyValue(form.title),
      };

      const res = await fetch(`/api/admin/news/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Mise à jour impossible');
      router.push('/admin/news');
    } catch (err: unknown) {
      setError((err as Error)?.message || 'Erreur inattendue.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Éditer une news</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl font-bold mt-1">Éditer la news</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Met à jour le contenu ou le statut.
            </p>
          </div>
        </header>

        {loading && <div className="text-neutral-300">Chargement…</div>}
        {error && (
          <div className="text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}
        {form && (
          <form
            onSubmit={onSubmit}
            className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 max-w-5xl"
          >
            <fieldset disabled={saving} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label="Titre"
                required
                value={form.title}
                onChange={(v) => updateField('title', v)}
              />
              <Field
                label="Slug"
                placeholder="sera généré si vide"
                value={form.slug}
                onChange={(v) => updateField('slug', slugifyValue(v))}
              />
            </div>

            <div className="grid gap-2">
              <Field
                label="Tag / catégorie"
                placeholder="general, tournoi, announcement..."
                value={form.tag}
                onChange={(v) => updateField('tag', slugifyValue(v))}
                required
              />
              <p className="text-xs text-neutral-400">
                Utilisé pour filtrer les news par catégorie (slug simple).
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <LogoUpload
                value={form.imageUrl}
                onChange={(url) => updateField('imageUrl', url)}
                label="Image"
                hint="PNG, JPEG ou WebP, max 2 Mo."
              />
              <div className="grid gap-2">
                <label className="text-sm text-neutral-300">Statut</label>
                <select
                  className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                  value={form.status}
                  onChange={(e) =>
                    updateField('status', e.target.value as FormState['status'])
                  }
                >
                  <option value="draft">Brouillon</option>
                  <option value="published">Publié</option>
                </select>
                <div className="grid gap-1">
                  <label className="text-sm text-neutral-300">
                    Date de publication (si publiée)
                  </label>
                  <input
                    type="datetime-local"
                    className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                    value={form.publishedAt}
                    onChange={(e) =>
                      updateField('publishedAt', e.target.value)
                    }
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-2">
              <label className="text-sm text-neutral-300">Résumé</label>
              <textarea
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white min-h-[80px]"
                value={form.excerpt}
                onChange={(e) => updateField('excerpt', e.target.value)}
              />
            </div>

            <div className="grid gap-2">
              <label className="text-sm text-neutral-300">
                Contenu (markdown ou texte)
              </label>
              <textarea
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white min-h-[220px]"
                value={form.content}
                required
                onChange={(e) => updateField('content', e.target.value)}
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition disabled:opacity-60"
              >
                {saving ? 'Enregistrement…' : 'Mettre à jour'}
              </button>
              <Link
                href="/admin/news"
                className={`px-4 py-2 rounded-lg border border-white/15 hover:border-white/30${saving ? ' pointer-events-none opacity-50' : ''}`}
              >
                Retour
              </Link>
            </div>
            </fieldset>
          </form>
        )}
      </div>
    </>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <div className="grid gap-2">
      <label className="text-sm text-neutral-300">
        {label} {required && <span className="text-red-300">*</span>}
      </label>
      <input
        className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
      />
    </div>
  );
}
