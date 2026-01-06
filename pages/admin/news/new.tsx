import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useState } from 'react';
import slugify from 'slugify';
import { supabaseClient } from '@/utils/supabase';
import { withStaffPage } from '@/utils/staff';
import Button from '@/components/Buttons/button';

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string | null;
  };
};

export const getServerSideProps = withStaffPage('admin');

const slugifyValue = (value: string) =>
  slugify(value, { lower: true, strict: true });

export default function AdminNewsCreate({ staff }: Props) {
  const router = useRouter();
  const [form, setForm] = useState({
    title: '',
    slug: '',
    tag: 'general',
    excerpt: '',
    imageUrl: '',
    content: '',
    status: 'draft',
    publishedAt: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
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

      const res = await fetch('/api/admin/news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Création impossible');
      router.push(`/admin/news/${json.id}`);
    } catch (err: any) {
      setError(err?.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Admin – Nouvelle news</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-6">
          <div>
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl font-bold mt-1">Nouvelle news</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Publie une actualité pour le site.
            </p>
          </div>
        </header>

        <form
          onSubmit={onSubmit}
          className="bg-neutral-800 border border-neutral-700 rounded-xl p-6 space-y-4 max-w-5xl"
        >
          {error && (
            <div className="text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

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
              Utilisé pour filtrer les news par catégorie (slug simple, ex :
              tournoi).
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="Image (URL)"
              value={form.imageUrl}
              onChange={(v) => updateField('imageUrl', v)}
            />
            <div className="grid gap-2">
              <label className="text-sm text-neutral-300">Statut</label>
              <select
                className="bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-white"
                value={form.status}
                onChange={(e) => updateField('status', e.target.value)}
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
                  onChange={(e) => updateField('publishedAt', e.target.value)}
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
            <Button
              type="submit"
              size="compact"
              disabled={loading}
              className="px-4 py-2"
            >
              {loading ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
            <Link href="/admin/news">
              <Button type="button" size="compact" className="px-4 py-2">
                Annuler
              </Button>
            </Link>
          </div>
        </form>
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
