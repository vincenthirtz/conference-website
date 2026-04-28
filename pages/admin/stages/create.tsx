// pages/admin/stages/create.tsx

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useToast } from '@/components/Toast';

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type StaffProps = {
  staff: StaffShape;
};
type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type Tournament = {
  id: string;
  name: string;
  slug: string | null;
};

type TournamentsApiResponse = {
  tournaments: Tournament[];
  total: number | null;
};

type CreateStageBody = {
  name: string;
  slug?: string | null;
  stage_type?: StageType | null;
  order_index?: number | null;
  is_active?: boolean;
  is_public?: boolean;
  start_date?: string | null;
  end_date?: string | null;
  settings?: any | null;
};

type CreateStageResponse = {
  stage: {
    id: string;
    tournament_id: string;
  };
};

export const getServerSideProps = withStaffPage('manager');

function AdminStageCreatePage({ staff }: StaffProps) {
  const router = useRouter();
  const { addToast } = useToast();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loadingTournaments, setLoadingTournaments] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  const [form, setForm] = useState<{
    tournamentId: string;
    name: string;
    slug: string;
    stage_type: StageType | '';
    order_index: string;
    is_active: boolean;
    is_public: boolean;
    start_date: string;
    end_date: string;
    settingsRaw: string;
  }>({
    tournamentId: '',
    name: '',
    slug: '',
    stage_type: '',
    order_index: '',
    is_active: true,
    is_public: true,
    start_date: '',
    end_date: '',
    settingsRaw: '{\n  \n}',
  });

  function updateField<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K]
  ) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  useEffect(() => {
    fetchTournaments();
  }, []);

  async function fetchTournaments() {
    setLoadingTournaments(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/admin/tournaments?limit=200');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(
          json.error || 'Impossible de charger la liste des tournois'
        );
      }
      const json: TournamentsApiResponse = await res.json();
      setTournaments(json.tournaments || []);
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ??
          'Erreur inattendue lors du chargement des tournois'
      );
    } finally {
      setLoadingTournaments(false);
    }
  }

  function parseSettings(): any | null {
    const raw = form.settingsRaw.trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (e) {
      throw new Error('Le JSON de configuration (settings) est invalide.');
    }
  }

  function toIsoOrNull(v: string): string | null {
    if (!v) return null;
    try {
      return new Date(v).toISOString();
    } catch {
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!form.tournamentId) {
      setErrorMsg('Merci de sélectionner un tournoi.');
      return;
    }
    setDateError(null);

    if (!form.name.trim()) {
      setErrorMsg('Le nom de la phase est obligatoire.');
      return;
    }

    if (form.start_date && form.end_date) {
      if (new Date(form.start_date) >= new Date(form.end_date)) {
        setDateError(
          'La date de fin doit être postérieure à la date de début.'
        );
        setErrorMsg('La date de fin doit être postérieure à la date de début.');
        return;
      }
    }

    let settings: any | null = null;
    try {
      settings = parseSettings();
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ?? 'Erreur dans le JSON de configuration.'
      );
      return;
    }

    setSubmitting(true);

    const payload: CreateStageBody = {
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      stage_type: (form.stage_type as StageType) || null,
      order_index: form.order_index ? Number(form.order_index) : null,
      is_active: form.is_active,
      is_public: form.is_public,
      start_date: toIsoOrNull(form.start_date),
      end_date: toIsoOrNull(form.end_date),
      settings,
    };

    try {
      // On s'aligne sur le pattern utilisé côté API:
      // POST /api/admin/tournament/[id]/stages
      const res = await fetch(
        `/api/admin/tournament/${form.tournamentId}/stages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: payload }),
        }
      );

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Erreur lors de la création de la phase');
      }

      const json: CreateStageResponse = await res.json();
      const created = json.stage;

      addToast('Phase créée avec succès.', 'success');
      if (created?.id) {
        router.push(`/admin/stages/${created.id}`);
      } else {
        router.push(`/admin/tournament/${form.tournamentId}`);
      }
    } catch (err: unknown) {
      setErrorMsg(
        (err as Error)?.message ??
          'Erreur inconnue lors de la création de la phase'
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <Head>
        <title>Admin – Créer une phase</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white p-6 pt-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="mb-2 inline-flex items-center gap-2 text-sm text-neutral-400 hover:text-white"
            >
              ← Retour
            </button>
            <h1 className="text-3xl font-bold">Nouvelle phase (stage)</h1>
            <p className="text-neutral-400 text-sm mt-1">
              Associe cette phase à un tournoi puis configure ses paramètres.
            </p>
          </div>
        </div>

        <div className="max-w-3xl bg-neutral-800 border border-neutral-700 rounded-xl p-6 pt-20">
          {errorMsg && (
            <div className="mb-4 rounded bg-red-900/60 border border-red-600 px-4 py-3 text-sm">
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Tournoi */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Tournoi parent</h2>
              <div>
                <label className="block text-sm mb-1 text-neutral-300">
                  Tournoi <span className="text-red-400">*</span>
                </label>
                <select
                  className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={form.tournamentId}
                  onChange={(e) => updateField('tournamentId', e.target.value)}
                  disabled={loadingTournaments || submitting}
                >
                  <option value="">
                    {loadingTournaments
                      ? 'Chargement des tournois…'
                      : 'Sélectionner un tournoi'}
                  </option>
                  {tournaments.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} {t.slug ? `(${t.slug})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-neutral-500 mt-1">
                  La phase sera rattachée à ce tournoi et visible dans son
                  dashboard admin.
                </p>
              </div>
            </section>

            {/* Infos générales */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Informations générales</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Nom de la phase <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.name}
                    onChange={(e) => updateField('name', e.target.value)}
                    placeholder="Playoffs, Groupes A, Swiss #1…"
                  />
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Slug (URL interne)
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.slug}
                    onChange={(e) => updateField('slug', e.target.value)}
                    placeholder="playoffs, swiss-1…"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Laisse vide pour laisser le backend gérer.
                  </p>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Type de phase
                  </label>
                  <select
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.stage_type}
                    onChange={(e) =>
                      updateField(
                        'stage_type',
                        e.target.value as StageType | ''
                      )
                    }
                  >
                    <option value="">(Non défini / custom)</option>
                    <option value="group">Groupes</option>
                    <option value="bracket">Bracket (elim)</option>
                    <option value="swiss">Swiss</option>
                    <option value="round_robin">Round Robin</option>
                    <option value="showmatch">Showmatch</option>
                    <option value="other">Autre</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Ordre dans le tournoi
                  </label>
                  <input
                    type="number"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.order_index}
                    onChange={(e) => updateField('order_index', e.target.value)}
                    placeholder="1, 2, 3…"
                  />
                  <p className="text-xs text-neutral-500 mt-1">
                    Pour trier les phases (1 = première, 2 = deuxième, etc.).
                  </p>
                </div>
              </div>
            </section>

            {/* Visibilité & dates */}
            <section className="space-y-4">
              <h2 className="font-semibold text-lg">Visibilité & planning</h2>

              <div className="flex flex-col gap-3">
                <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-500 bg-neutral-700"
                    checked={form.is_active}
                    onChange={(e) => updateField('is_active', e.target.checked)}
                  />
                  <span>Phase active (prise en compte dans le tournoi)</span>
                </label>

                <label className="inline-flex items-center gap-2 text-sm text-neutral-200">
                  <input
                    type="checkbox"
                    className="rounded border-neutral-500 bg-neutral-700"
                    checked={form.is_public}
                    onChange={(e) => updateField('is_public', e.target.checked)}
                  />
                  <span>Visible publiquement (page tournoi)</span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Début de la phase
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full px-3 py-2 rounded bg-neutral-700 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={form.start_date}
                    onChange={(e) => updateField('start_date', e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm mb-1 text-neutral-300">
                    Fin de la phase
                  </label>
                  <input
                    type="datetime-local"
                    className={`w-full px-3 py-2 rounded bg-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      dateError ? 'border-red-500' : 'border-neutral-600'
                    }`}
                    value={form.end_date}
                    onChange={(e) => {
                      updateField('end_date', e.target.value);
                      setDateError(null);
                    }}
                  />
                  {dateError && (
                    <p className="text-xs text-red-400 mt-1">{dateError}</p>
                  )}
                </div>
              </div>
            </section>

            {/* Settings JSON */}
            <section className="space-y-3">
              <h2 className="font-semibold text-lg">
                Configuration avancée (settings JSON)
              </h2>
              <p className="text-xs text-neutral-400">
                Utilisé pour stocker la configuration spécifique de la phase
                (options Swiss, nombre de maps, seedings, etc.). Tu peux laisser
                le JSON vide ou minimal et le compléter plus tard.
              </p>
              <textarea
                className="w-full min-h-[180px] font-mono text-xs bg-neutral-900 border border-neutral-700 rounded p-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={form.settingsRaw}
                onChange={(e) => updateField('settingsRaw', e.target.value)}
                spellCheck={false}
              />
            </section>

            {/* Actions */}
            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded border border-neutral-600 text-neutral-200 hover:bg-neutral-800 text-sm"
                onClick={() => window.history.back()}
                disabled={submitting}
              >
                Annuler
              </button>

              <button
                type="submit"
                disabled={submitting}
                className={`px-5 py-2 rounded font-semibold text-sm ${
                  submitting
                    ? 'bg-blue-800 cursor-wait'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {submitting ? 'Création…' : 'Créer la phase'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

export default AdminStageCreatePage;
