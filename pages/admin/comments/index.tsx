import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import Button from '@/components/Buttons/button';

type CommentRow = {
  id: string;
  news_id: string;
  author_name: string | null;
  content: string;
  created_at: string;
  news?: { id: string; title: string | null; slug: string | null } | null;
};

type ApiList = {
  comments: CommentRow[];
  total: number | null;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

function AdminCommentsPage({ staff }: Props) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [limit] = useState(30);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Record<string, string>>({});

  const fetchComments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      if (search.trim()) params.set('search', search.trim());

      const res = await fetch(`/api/admin/comments?${params.toString()}`);
      const json: ApiList = await res.json();
      if (!res.ok) {
        throw new Error((json as any)?.error || 'Erreur chargement');
      }
      setComments(json.comments || []);
    } catch (err: any) {
      setError(err?.message || 'Erreur chargement');
    } finally {
      setLoading(false);
    }
  }, [limit, offset, search]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce commentaire ?')) return;
    const res = await fetch('/api/admin/comments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      alert(json?.error || 'Suppression impossible');
      return;
    }
    fetchComments();
  };

  const handleSave = async (c: CommentRow) => {
    const newContent = editing[c.id] ?? c.content;
    const res = await fetch('/api/admin/comments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: c.id, content: newContent }),
    });
    const json = await res.json();
    if (!res.ok) {
      alert(json?.error || 'Mise à jour impossible');
      return;
    }
    setEditing((prev) => {
      const next = { ...prev };
      delete next[c.id];
      return next;
    });
    fetchComments();
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    fetchComments();
  };

  return (
    <>
      <Head>
        <title>Admin – Commentaires</title>
      </Head>
      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Gestion des commentaires</h1>
          <span className="text-sm text-gray-400">
            {staff.display_name || staff.id} · {staff.role}
          </span>
        </div>

        <form
          onSubmit={handleSearchSubmit}
          className="bg-neutral-800 p-4 rounded-lg mb-6 flex gap-3 flex-wrap"
        >
          <input
            type="text"
            placeholder="Recherche contenu / auteur"
            className="px-3 py-2 rounded bg-neutral-700 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Button type="submit" size="compact" className="px-4 py-2 text-sm">
            Rechercher
          </Button>
        </form>

        {error && (
          <div className="mb-4 rounded border border-red-500/50 bg-red-500/10 px-4 py-3 text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-4">
          {loading ? (
            <p className="text-gray-300">Chargement...</p>
          ) : comments.length === 0 ? (
            <p className="text-gray-300">Aucun commentaire.</p>
          ) : (
            comments.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-2"
              >
                <div className="flex items-center justify-between gap-2 text-xs text-gray-400">
                  <span>
                    {new Date(c.created_at).toLocaleString('fr-FR', {
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className="text-gray-500">·</span>
                  <span>{c.author_name || 'Anonyme'}</span>
                  <span className="text-gray-500">·</span>
                  <span>
                    {c.news?.title || c.news_id}{' '}
                    {c.news?.slug ? `(/${c.news.slug})` : ''}
                  </span>
                </div>
                <textarea
                  className="w-full rounded border border-white/15 bg-black/60 px-3 py-2 text-sm text-white"
                  value={editing[c.id] ?? c.content}
                  onChange={(e) =>
                    setEditing((prev) => ({ ...prev, [c.id]: e.target.value }))
                  }
                  rows={3}
                />
                <div className="flex items-center gap-3">
                  <Button
                    type="button"
                    onClick={() => handleSave(c)}
                    className="px-4 h-[36px]"
                  >
                    Sauvegarder
                  </Button>
                  <Button
                    type="button"
                    size="compact"
                    className="px-3 py-1 text-sm bg-red-800 hover:bg-red-700"
                    onClick={() => handleDelete(c.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('manager');

export default AdminCommentsPage;
