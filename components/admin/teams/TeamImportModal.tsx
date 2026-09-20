// components/admin/teams/TeamImportModal.tsx
//
// La modale d'import d'équipes (CSV, Toornament, Challonge, start.gg),
// extraite de `pages/admin/teams/index.tsx`.
//
// POURQUOI CETTE EXTRACTION. La règle du lot A7 (`docs/PLAN-espace-admin.md`) :
// « tout lot qui touche un de ces fichiers en extrait au moins un panneau ».
// La page pesait 1 464 lignes — le coût de chaque correctif fait un soir de
// journée dans un fichier qu'on ne peut pas lire d'un bloc.
//
// AUCUN CHANGEMENT DE COMPORTEMENT : le JSX est déplacé tel quel, et tout ce
// qu'il lisait dans la page arrive désormais en props. L'état reste là-bas —
// le découper aussi aurait mêlé une extraction à un changement de logique,
// c'est-à-dire deux risques dans un seul lot.

import type { ChangeEvent, JSX } from 'react';

import Modal from '@/components/admin/Modal';
import Tabs, {
  tabButtonId,
  tabPanelId,
  type TabItem,
} from '@/components/ui/Tabs';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTeamsList from '@/lib/i18n/locales/admin-fr/adminTeamsList';

export type ImportTab = 'csv' | 'toornament' | 'challonge' | 'startgg';

/** La forme EXACTE de l'état de la page — recopiée, pas devinée. */
export type ImportResult = {
  created: number;
  skipped: number;
  errors: { row: number; message: string }[];
};

/**
 * Les sources d'import, dans l'ordre d'affichage.
 *
 * Les libellés sont des noms de produits : ils ne se traduisent pas.
 */
const IMPORT_TABS: TabItem[] = [
  { id: 'csv', label: 'CSV' },
  { id: 'toornament', label: 'Toornament' },
  { id: 'challonge', label: 'Challonge' },
  { id: 'startgg', label: 'start.gg' },
];

export type TeamImportModalProps = {
  showImportModal: boolean;
  setShowImportModal: (open: boolean) => void;
  activeTab: ImportTab;
  setActiveTab: (tab: ImportTab) => void;
  csvText: string;
  setCsvText: (value: string) => void;
  platformRef: string;
  setPlatformRef: (value: string) => void;
  importTournamentId: string;
  setImportTournamentId: (value: string) => void;
  tournamentOptions: { id: string; name: string }[];
  importing: boolean;
  importResult: ImportResult | null;
  setImportResult: (result: ImportResult | null) => void;
  setShowApiKeysModal: (open: boolean) => void;
  handleImport: () => void;
  handleCsvFile: (event: ChangeEvent<HTMLInputElement>) => void;
  loadTournaments: () => void;
  loadApiKeys: () => void;
};

export default function TeamImportModal({
  showImportModal,
  setShowImportModal,
  activeTab,
  setActiveTab,
  csvText,
  setCsvText,
  platformRef,
  setPlatformRef,
  importTournamentId,
  setImportTournamentId,
  tournamentOptions,
  importing,
  importResult,
  setImportResult,
  setShowApiKeysModal,
  handleImport,
  handleCsvFile,
  loadTournaments,
  loadApiKeys,
}: TeamImportModalProps): JSX.Element {
  const t = useAdminT(nsAdminTeamsList);

  return (
    <Modal
      open={showImportModal}
      onClose={() => setShowImportModal(false)}
      size="2xl"
      title={
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold">{t.importModalTitle}</h3>
          <button
            type="button"
            onClick={() => {
              setShowApiKeysModal(true);
              loadApiKeys();
            }}
            title={t.configApiKeysTitle}
            aria-label={t.configApiKeysTitle}
            className="p-1.5 rounded-lg hover:bg-neutral-700 transition-colors"
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
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
      }
      footer={
        <>
          <button
            type="button"
            onClick={() => setShowImportModal(false)}
            className="px-4 py-2.5 rounded-xl bg-neutral-700 hover:bg-neutral-600 text-sm font-medium transition-colors"
          >
            {t.close}
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={
              importing ||
              (activeTab === 'csv' ? !csvText.trim() : !platformRef.trim())
            }
            className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {importing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t.importing}
              </>
            ) : (
              t.importAction
            )}
          </button>
        </>
      }
    >
      <>
        {/* ONGLETS — la primitive partagée, pas une barre à la main. Celle
          d'avant n'avait AUCUN attribut ARIA : pour un lecteur d'écran,
          c'étaient quatre boutons sans lien entre eux ni avec le panneau
          qu'ils commandent, et rien ne disait lequel était actif. `Tabs`
          apporte le motif complet — `tablist`/`tab`/`tabpanel`, un seul
          arrêt de tabulation, et les flèches pour passer de l'un à
          l'autre. */}
        <Tabs
          tabs={IMPORT_TABS}
          active={activeTab}
          onChange={(id) => {
            setActiveTab(id as ImportTab);
            setImportResult(null);
          }}
          ariaLabel={t.importSourceAria}
          idBase="team-import"
          className="mb-5"
        />

        {/* UN SEUL PANNEAU, celui de l'onglet actif : les autres ne sont pas
          rendus. L'identifiant suit donc `activeTab`, et correspond
          toujours à l'`aria-controls` du bouton sélectionné — c'est ce qui
          relie la barre à son contenu pour un lecteur d'écran. */}
        <div
          role="tabpanel"
          id={tabPanelId('team-import', activeTab)}
          aria-labelledby={tabButtonId('team-import', activeTab)}
        >
          {/* CSV tab */}
          {activeTab === 'csv' && (
            <>
              <p className="text-sm text-neutral-400 mb-4">
                {t.csvFormatPrefix}
                <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                  name,short_name,country,joueurs
                </code>
                <br />
                {t.csvPlayersSepBefore}{' '}
                <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                  ;
                </code>{' '}
                {t.csvPlayersSepAfter}
              </p>

              <div className="mb-4">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.csvFileLabel}
                </label>
                <input
                  type="file"
                  accept=".csv,.txt,.tsv"
                  onChange={handleCsvFile}
                  className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-neutral-700 file:text-white hover:file:bg-neutral-600 file:cursor-pointer"
                />
              </div>

              <div className="mb-4">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.csvContentLabel}
                </label>
                <textarea
                  className="w-full h-40 px-3 py-2 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono"
                  placeholder={`name,short_name,country,joueurs\nTeam Alpha,TA,FR,Player1#1234;Player2#5678\nTeam Beta,TB,BE,Player3#9999`}
                  value={csvText}
                  onChange={(e) => setCsvText(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Platform tabs */}
          {activeTab !== 'csv' && (
            <>
              <p className="text-sm text-neutral-400 mb-4">
                {activeTab === 'toornament' && (
                  <>
                    {t.toornamentProseBefore}
                    <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                      https://www.toornament.com/tournaments/12345/
                    </code>{' '}
                    {t.proseOr}{' '}
                    <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                      12345
                    </code>
                    {t.prosePeriod}
                  </>
                )}
                {activeTab === 'challonge' && (
                  <>
                    {t.challongeProseBefore}
                    <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                      https://challonge.com/mon-tournoi
                    </code>{' '}
                    {t.proseOr}{' '}
                    <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                      mon-tournoi
                    </code>
                    {t.prosePeriod}
                  </>
                )}
                {activeTab === 'startgg' && (
                  <>
                    {t.startggProseBefore}
                    <code className="bg-neutral-900 px-1.5 py-0.5 rounded text-xs">
                      https://www.start.gg/tournament/genesis-9/event/melee-singles
                    </code>
                    {t.prosePeriod}
                  </>
                )}
                <br />
                {t.apiKeyRequiredBefore}
                <span className="inline-block">⚙️</span>
                {t.apiKeyRequiredAfter}
              </p>

              <div className="mb-4">
                <label className="block text-sm text-neutral-400 mb-1">
                  {t.urlOrIdLabel}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                  placeholder={
                    activeTab === 'toornament'
                      ? 'https://www.toornament.com/tournaments/...'
                      : activeTab === 'challonge'
                        ? 'https://challonge.com/...'
                        : 'https://www.start.gg/tournament/.../event/...'
                  }
                  value={platformRef}
                  onChange={(e) => setPlatformRef(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        {/* Tournoi cible (commun) */}
        <div className="mb-4">
          <label className="block text-sm text-neutral-400 mb-1">
            {t.registerToTournamentLabel}
          </label>
          <select
            className="w-full px-3 py-2.5 rounded-xl bg-neutral-900/50 border border-neutral-600 text-sm"
            value={importTournamentId}
            onFocus={loadTournaments}
            onChange={(e) => setImportTournamentId(e.target.value)}
          >
            <option value="">{t.none}</option>
            {tournamentOptions.map((tour) => (
              <option key={tour.id} value={tour.id}>
                {tour.name}
              </option>
            ))}
          </select>
        </div>

        {/* Result (commun) */}
        {importResult && (
          <div className="mb-4 rounded-xl bg-neutral-900/50 border border-neutral-700 p-4 text-sm">
            <div className="flex gap-4 mb-2">
              <span className="text-emerald-400">
                {format(t.resultCreated, { count: importResult.created })}
              </span>
              {importResult.skipped > 0 && (
                <span className="text-amber-400">
                  {format(t.resultSkipped, {
                    count: importResult.skipped,
                  })}
                </span>
              )}
              {importResult.errors.length > 0 && (
                <span className="text-red-400">
                  {format(t.resultErrors, {
                    count: importResult.errors.length,
                  })}
                </span>
              )}
            </div>
            {importResult.errors.length > 0 && (
              <ul className="text-xs text-red-300 space-y-1 max-h-32 overflow-y-auto">
                {importResult.errors.map((e, i) => (
                  <li key={i}>
                    {e.row > 0
                      ? format(t.resultLinePrefix, { row: e.row })
                      : ''}
                    {e.message}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </>
    </Modal>
  );
}
