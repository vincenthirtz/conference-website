import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';
import { StaffRoleBadge } from '@/components/admin/StaffRoleBadge';

type NewsRow = {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string | null;
  };
};

export const getServerSideProps = withStaffPage('admin');

export default function AdminNewsList({ staff }: Props) {
  const [items, setItems] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

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

      const res = await fetch('/api/admin/news?limit=200', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Erreur de chargement');
      setItems(json.items || []);
    } catch (err: any) {
      console.error('admin news load error', err);
      setError(err?.message || 'Erreur inattendue.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer cette news ?')) return;
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');

      const res = await fetch(`/api/admin/news/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json?.error || 'Erreur de suppression');
      }
      setItems((prev) => prev.filter((n) => n.id !== id));
    } catch (err: any) {
      alert(err?.message || 'Suppression impossible.');
    }
  };

  const formatDate = (value: string | null) =>
    value ? new Date(value).toLocaleString('fr-FR') : '—';

  return (
    <>
      <Head>
        <title>Admin – News</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <header className="flex items-center justify-between flex-wrap gap-4 mb-8">
          <div>
            <p className="text-sm text-neutral-400">Espace staff</p>
            <h1 className="text-3xl font-bold mt-1">News</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Créer, éditer ou supprimer les actualités du site.
            </p>
          </div>
          <StaffRoleBadge staff={staff} />
        </header>

        <div className="flex items-center justify-between gap-4 mb-4">
          <Link
            href="/admin/news/new"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition text-sm font-semibold"
          >
            Nouvelle news
          </Link>
          <button
            onClick={() => load()}
            className="text-sm px-3 py-2 rounded-lg border border-white/10 hover:border-white/20 transition"
          >
            Rafraîchir
          </button>
        </div>

        {loading && <div className="text-neutral-300">Chargement…</div>}
        {error && (
          <div className="text-red-200 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 mb-4">
            {error}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="text-neutral-300">Aucune news pour le moment.</div>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className="rounded-xl border border-white/10 bg-neutral-800/70 p-4 flex flex-col gap-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-semibold">{item.title}</span>
                  <StatusBadge status={item.status} />
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/news/${item.id}`}
                    className="text-sm px-3 py-1.5 rounded-lg border border-white/15 hover:border-white/30"
                  >
                    Éditer
                  </Link>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-red-500/40 text-red-200 hover:border-red-400"
                  >
                    Supprimer
                  </button>
                </div>
              </div>
              <div className="text-sm text-neutral-300">
                Slug : <span className="font-mono">{item.slug}</span>
              </div>
              <div className="text-xs text-neutral-400 flex gap-3 flex-wrap">
                <span>Créée le {formatDate(item.created_at)}</span>
                <span>·</span>
                <span>
                  Publication :{' '}
                  {item.status === 'published'
                    ? formatDate(item.published_at)
                    : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function StatusBadge({ status }: { status: 'draft' | 'published' }) {
  const cls =
    status === 'published'
      ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
      : 'bg-yellow-500/20 text-yellow-100 border-yellow-400/40';
  const label = status === 'published' ? 'Publié' : 'Brouillon';
  return (
    <span
      className={`text-xs px-2 py-1 rounded-full border ${cls} uppercase tracking-wide`}
    >
      {label}
    </span>
  );
}
