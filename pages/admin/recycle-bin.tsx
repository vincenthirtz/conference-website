// pages/admin/recycle-bin.tsx

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAdminFetch } from '@/hooks/useAdminFetch';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};

type DeletedItem = {
  id: string;
  type:
    | 'stage'
    | 'team'
    | 'match'
    | 'announcement'
    | 'partner'
    | 'cast_member'
    | 'adherent'
    | 'staff'
    | 'scrim';
  name: string;
  details: string | null;
  deleted_at: string | null;
  tournament_id: string | null;
};

type RecycleBinResponse = {
  items: DeletedItem[];
  total: number;
};

const PAGE_SIZE = 50;

export const getServerSideProps = withStaffPage('admin');

function typeLabel(type: string) {
  switch (type) {
    case 'stage':
      return 'Phase';
    case 'team':
      return 'Equipe';
    case 'match':
      return 'Match';
    case 'announcement':
      return 'Annonce';
    case 'partner':
      return 'Partenaire';
    case 'cast_member':
      return 'Casteur';
    case 'adherent':
      return 'Adherent';
    case 'staff':
      return 'Staff';
    case 'scrim':
      return 'Scrim';
    default:
      return type;
  }
}

function typeColor(type: string) {
  switch (type) {
    case 'stage':
      return 'bg-purple-600/20 text-purple-300 border-purple-500/30';
    case 'team':
      return 'bg-blue-600/20 text-blue-300 border-blue-500/30';
    case 'match':
      return 'bg-amber-600/20 text-amber-300 border-amber-500/30';
    case 'announcement':
      return 'bg-emerald-600/20 text-emerald-300 border-emerald-500/30';
    case 'partner':
      return 'bg-pink-600/20 text-pink-300 border-pink-500/30';
    case 'cast_member':
      return 'bg-cyan-600/20 text-cyan-300 border-cyan-500/30';
    case 'adherent':
      return 'bg-orange-600/20 text-orange-300 border-orange-500/30';
    case 'staff':
      return 'bg-rose-600/20 text-rose-300 border-rose-500/30';
    case 'scrim':
      return 'bg-teal-600/20 text-teal-300 border-teal-500/30';
    default:
      return 'bg-neutral-600/20 text-neutral-300 border-neutral-500/30';
  }
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function AdminRecycleBinPage({ staff }: StaffProps) {
  const router = useRouter();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const { adminFetchJson } = useAdminFetch();

  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<DeletedItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [offset, setOffset] = useState(0);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));

      const json = await adminFetchJson<RecycleBinResponse>(
        `/api/admin/recycle-bin?${params.toString()}`
      );
      setItems(json.items || []);
      setTotal(typeof json.total === 'number' ? json.total : null);
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur inattendue');
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, typeFilter, offset]);

  // Recharge à chaque changement de filtre/page. Le reset d'offset sur
  // changement de filtre est géré dans le onChange du select.
  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleRestore(item: DeletedItem) {
    const ok = await confirm({
      title: `Restaurer ${typeLabel(item.type).toLowerCase()} "${item.name}" ?`,
      variant: 'info',
      confirmLabel: 'Restaurer',
    });
    if (!ok) return;

    setRestoringId(item.id);
    setErrorMsg(null);

    try {
      await adminFetchJson('/api/admin/recycle-bin', {
        method: 'PATCH',
        body: JSON.stringify({ id: item.id, type: item.type }),
      });

      addToast(
        `${typeLabel(item.type)} "${item.name}" restaure avec succes.`,
        'info'
      );
      fetchItems();
    } catch (err: unknown) {
      setErrorMsg((err as Error)?.message ?? 'Erreur lors de la restauration');
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      {dialog}
      <Head>
        <title>Admin – Corbeille</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          {/* Header */}
          <div className="mb-8">
            <button
              type="button"
              onClick={() => router.push('/admin')}
              className="mb-4 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white transition-colors"
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
              Retour au dashboard
            </button>

            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              Corbeille
            </h1>
            <p className="text-neutral-400 text-sm mt-1">
              Elements desactives ou annules. Restaurez-les pour les remettre en
              service.
              {total !== null && (
                <span className="ml-1">
                  {total} element{total > 1 ? 's' : ''} dans la corbeille.
                </span>
              )}
            </p>
          </div>

          {/* Messages */}
          {errorMsg && (
            <div className="mb-6 rounded-xl bg-red-900/40 border border-red-500/50 px-4 py-3 text-sm flex items-center gap-2">
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
          {/* Filter */}
          <div className="flex gap-3 mb-6">
            <select
              className="px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              value={typeFilter}
              onChange={(e) => {
                // Tout changement de filtre repart à la page 1.
                setOffset(0);
                setTypeFilter(e.target.value);
              }}
            >
              <option value="">Tous les types</option>
              <option value="stage">Phases</option>
              <option value="team">Equipes</option>
              <option value="match">Matches</option>
              <option value="announcement">Annonces</option>
              <option value="partner">Partenaires</option>
              <option value="cast_member">Casteurs</option>
              <option value="adherent">Adherents</option>
              <option value="staff">Staff</option>
              <option value="scrim">Scrims</option>
            </select>

            <button
              type="button"
              onClick={fetchItems}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50"
            >
              Rafraichir
            </button>
          </div>

          {/* Items list */}
          <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-2 border-neutral-600 border-t-white rounded-full animate-spin" />
              </div>
            ) : items.length === 0 ? (
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
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
                La corbeille est vide.
              </div>
            ) : (
              <div className="divide-y divide-neutral-700/50">
                {items.map((item) => (
                  <div
                    key={`${item.type}-${item.id}`}
                    className="p-4 hover:bg-neutral-700/20 transition-colors flex items-center gap-4"
                  >
                    {/* Type badge */}
                    <span
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium border ${typeColor(item.type)}`}
                    >
                      {typeLabel(item.type)}
                    </span>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">
                        {item.name}
                      </div>
                      <div className="text-xs text-neutral-500 flex gap-3">
                        {item.details && <span>{item.details}</span>}
                        <span>Supprime le {formatDate(item.deleted_at)}</span>
                        <span className="font-mono">
                          #{item.id.slice(0, 8)}
                        </span>
                      </div>
                    </div>

                    {/* Restore button */}
                    <button
                      type="button"
                      onClick={() => handleRestore(item)}
                      disabled={restoringId === item.id}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 flex-shrink-0"
                    >
                      {restoringId === item.id ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Restauration…
                        </>
                      ) : (
                        <>
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
                              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                            />
                          </svg>
                          Restaurer
                        </>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Pagination */}
          {(items.length > 0 || offset > 0) && (
            <div className="flex justify-between items-center mt-6">
              <button
                type="button"
                disabled={offset === 0 || loading}
                onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                Precedent
              </button>

              <span className="text-neutral-400 text-sm">
                {items.length > 0 ? offset + 1 : 0} – {offset + items.length}
                {total !== null ? ` sur ${total}` : ''}
              </span>

              <button
                type="button"
                disabled={
                  loading ||
                  (total !== null && offset + PAGE_SIZE >= total) ||
                  (total === null && items.length < PAGE_SIZE)
                }
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                Suivant
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
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default AdminRecycleBinPage;
