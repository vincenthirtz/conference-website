import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { withStaffPage } from '@/utils/staff';
import { supabaseClient } from '@/utils/supabase';

type PartnerRow = {
  id: string;
  name: string;
  description: string;
  category: 'super' | 'major' | 'cultural';
  logo_url: string | null;
  website_url: string | null;
  note: string | null;
  display_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type Props = {
  staff: {
    id: string;
    role: string;
    display_name: string;
  };
};

const categoryLabels: Record<string, string> = {
  super: 'Super partenaire',
  major: 'Partenaire majeur',
  cultural: 'Partenaire culturel',
};

const categoryColors: Record<string, string> = {
  super: 'bg-amber-600 text-white',
  major: 'bg-purple-600 text-white',
  cultural: 'bg-emerald-600 text-white',
};

function AdminPartnersPage({ staff }: Props) {
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const params = new URLSearchParams();
      if (categoryFilter) params.set('category', categoryFilter);
      if (activeFilter) params.set('active', activeFilter);

      const res = await fetch(`/api/admin/partners?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = await res.json();

      setPartners(json.items || []);
    } catch (err) {
      console.error('Error fetching partners', err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, activeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onDelete = async (id: string) => {
    if (!confirm('Supprimer ce partenaire ?')) return;
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');
      const res = await fetch(`/api/admin/partners/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Suppression impossible');
      }
      fetchData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Erreur de suppression.');
    }
  };

  const toggleActive = async (partner: PartnerRow) => {
    try {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Session staff manquante.');
      const res = await fetch(`/api/admin/partners/${partner.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ isActive: !partner.is_active }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Modification impossible');
      }
      fetchData();
    } catch (err: unknown) {
      alert((err as Error)?.message || 'Erreur de modification.');
    }
  };

  return (
    <>
      <Head>
        <title>Admin - Partenaires</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
                  Gestion des partenaires
                </h1>
                <p className="text-neutral-400 text-sm mt-1">
                  {partners.length} partenaire{partners.length > 1 ? 's' : ''}
                </p>
              </div>

              <Link
                href="/admin/partners/new"
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors flex items-center gap-2"
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
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Nouveau partenaire
              </Link>
            </div>
          </div>

          {/* Filters */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 mb-6">
            <div className="flex gap-4 flex-wrap items-end">
              <div className="min-w-[180px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Catégorie
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={categoryFilter || ''}
                  onChange={(e) => setCategoryFilter(e.target.value || null)}
                >
                  <option value="">Toutes les catégories</option>
                  <option value="super">Super partenaire</option>
                  <option value="major">Partenaire majeur</option>
                  <option value="cultural">Partenaire culturel</option>
                </select>
              </div>

              <div className="min-w-[160px]">
                <label className="block text-sm text-neutral-400 mb-1">
                  Statut
                </label>
                <select
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={activeFilter || ''}
                  onChange={(e) => setActiveFilter(e.target.value || null)}
                >
                  <option value="">Tous les statuts</option>
                  <option value="true">Actifs</option>
                  <option value="false">Inactifs</option>
                </select>
              </div>
            </div>
          </section>

          {/* Partners List */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : partners.length === 0 ? (
              <div className="text-center py-20 text-neutral-400">
                <svg
                  className="w-12 h-12 mx-auto mb-4 text-neutral-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Aucun partenaire trouvé
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {partners.map((p) => (
                  <div
                    key={p.id}
                    className={`flex items-center gap-4 p-4 hover:bg-neutral-700/30 transition-colors group ${
                      !p.is_active ? 'opacity-60' : ''
                    }`}
                  >
                    {/* Logo or icon */}
                    <div className="flex-shrink-0">
                      {p.logo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.logo_url}
                          alt={p.name}
                          className="w-12 h-12 rounded-xl border border-neutral-700 object-cover bg-white/5"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-neutral-700/50 flex items-center justify-center border border-neutral-700">
                          <svg
                            className="w-6 h-6 text-neutral-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                            />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white group-hover:text-blue-400 transition-colors truncate">
                          {p.name}
                        </h3>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            categoryColors[p.category]
                          }`}
                        >
                          {categoryLabels[p.category]}
                        </span>
                        {p.note && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-600/20 text-amber-300 border border-amber-500/30">
                            {p.note}
                          </span>
                        )}
                        {!p.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-600 text-neutral-300">
                            Inactif
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-neutral-400 truncate">
                        {p.description}
                      </p>
                      <div className="flex items-center gap-3 text-xs text-neutral-500 mt-1">
                        <span>Ordre: {p.display_order}</span>
                        {p.website_url && (
                          <>
                            <span>•</span>
                            <a
                              href={p.website_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:text-blue-400 transition"
                            >
                              Site web
                            </a>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => toggleActive(p)}
                        className={`px-3 py-1.5 rounded-lg border text-sm transition-colors ${
                          p.is_active
                            ? 'border-amber-500/40 text-amber-300 hover:border-amber-400'
                            : 'border-emerald-500/40 text-emerald-300 hover:border-emerald-400'
                        }`}
                      >
                        {p.is_active ? 'Désactiver' : 'Activer'}
                      </button>
                      <Link
                        href={`/admin/partners/${p.id}`}
                        className="px-3 py-1.5 rounded-lg border border-neutral-600 hover:border-neutral-500 text-sm transition-colors"
                      >
                        Modifier
                      </Link>
                      <button
                        onClick={() => onDelete(p.id)}
                        className="px-3 py-1.5 rounded-lg border border-red-500/40 text-red-300 hover:border-red-400 text-sm transition-colors"
                      >
                        Supprimer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps = withStaffPage('admin');

export default AdminPartnersPage;
