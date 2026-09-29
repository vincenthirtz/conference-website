// pages/admin/documents.tsx
//
// Le Drive de l'association, en lecture seule. Voir docs/ETUDE-drive-et-chat.md.
//
// Ce que cette page fait : dire ce qu'il y a dans le Drive, sans quitter
// l'admin, et seulement à qui en a le droit.
// Ce qu'elle ne fait PAS : héberger, copier ou servir un fichier. Chaque ligne
// ouvre le document DANS Drive — c'est Google qui applique le partage, et il
// n'y a jamais deux versions du même PV.

import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import DriveUploadButton from '@/components/admin/documents/DriveUploadButton';
import DrivePrivateKeyForm from '@/components/admin/documents/DrivePrivateKeyForm';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminDocuments from '@/lib/i18n/locales/admin-fr/adminDocuments';
import DataTable, { type DataTableColumn } from '@/components/admin/DataTable';
import type { StaffProps } from '@/types/admin';
import { formatDriveSize, driveTypeKey } from '@/utils/documents/driveDisplay';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

// Planche « Le Ruban », archétype Liste. Les deux liens de ligne sont des <a>
// (téléchargement servi par une route API, ouverture dans Drive en nouvel
// onglet) : AdminButtonLink passe par next/link, on reprend donc son allure.
const ROW_LINK =
  'inline-flex h-[30px] shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] border px-3 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.02em] transition-colors';
const ROW_LINK_SECONDARY = `${ROW_LINK} border-[rgba(180,103,209,.45)] text-[var(--or-200,#eec4ff)] hover:border-[var(--or,#b467d1)] hover:bg-[rgba(180,103,209,.08)]`;
const ROW_LINK_GHOST = `${ROW_LINK} border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t2,#c7bfca)] hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]`;
const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4';

// La page se garde sur la LECTURE. L'écriture est un supplément, tranché par
// le serveur à chaque appel (`canWrite` dans la réponse) et re-vérifié par la
// route : un bouton masqué n'est pas un contrôle d'accès.
export const getServerSideProps = withStaffPage({
  permission: 'read_documents',
});

type DriveRow = {
  id: string;
  name: string;
  mimeType: string;
  isFolder: boolean;
  size: number | null;
  modifiedTime: string | null;
  modifiedBy: string | null;
  webViewLink: string | null;
};

type Payload = {
  configured: boolean;
  /** L'appelant a-t-il le droit d'ÉCRITURE ? Tranché par le serveur. */
  canWrite?: boolean;
  /** Le compte de service est reconnu, il ne manque que sa clé privée. */
  awaitingPrivateKey?: boolean;
  /** Peut-on enregistrer la clé ici (droit d'écriture + SECRETS_ENC_KEY posée) ? */
  canStoreKey?: boolean;
  files?: DriveRow[];
  folderId?: string;
  folderName?: string | null;
  breadcrumb?: { id: string; name: string }[];
  error?: string;
};

export default function AdminDocumentsPage(_props: StaffProps) {
  const t = useAdminT(nsAdminDocuments);
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [configured, setConfigured] = useState(true);
  // Deux droits, deux états. La page se garde sur la LECTURE ; l'écriture est
  // un supplément que le serveur accorde ou non, et qu'on n'affiche pas s'il ne
  // l'a pas accordé.
  const [canWrite, setCanWrite] = useState(false);
  const [awaitingKey, setAwaitingKey] = useState(false);
  const [canStoreKey, setCanStoreKey] = useState(false);
  const [trashing, setTrashing] = useState<string | null>(null);
  const [rows, setRows] = useState<DriveRow[]>([]);
  const [breadcrumb, setBreadcrumb] = useState<{ id: string; name: string }[]>(
    []
  );
  const [folderId, setFolderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (target: string | null) => {
      setLoading(true);
      setError(null);
      try {
        const qs = target ? `?folderId=${encodeURIComponent(target)}` : '';
        const data = await adminFetchJson<Payload>(`/api/admin/documents${qs}`);
        setConfigured(data.configured);
        setCanWrite(data.canWrite ?? false);
        setAwaitingKey(data.awaitingPrivateKey ?? false);
        setCanStoreKey(data.canStoreKey ?? false);
        setRows(data.files ?? []);
        setBreadcrumb(data.breadcrumb ?? []);
      } catch (err) {
        // Le serveur explique les refus qui se corrigent. Les remplacer par un
        // message générique est exactement ce qui a rendu indiagnosticable le
        // refus des sous-dossiers, le 2026-09-01.
        setError(
          err instanceof Error && err.message ? err.message : t.loadError
        );
      } finally {
        setLoading(false);
      }
    },
    [adminFetchJson, t.loadError]
  );

  useEffect(() => {
    void load(folderId);
  }, [load, folderId]);

  const handleTrash = async (file: DriveRow) => {
    const ok = await confirm({
      title: t.confirmTrashTitle,
      // Dire « corbeille », pas « supprimer » : c'est ce qui se passe
      // réellement, et la nuance est ce qui rend le geste acceptable.
      subtitle: format(t.confirmTrashBody, { name: file.name }),
      variant: 'danger',
      confirmLabel: t.confirmTrashCta,
      cancelLabel: t.cancel,
    });
    if (!ok) return;

    setTrashing(file.id);
    try {
      await adminFetchJson(
        `/api/admin/documents?fileId=${encodeURIComponent(file.id)}` +
          (folderId ? `&folderId=${encodeURIComponent(folderId)}` : ''),
        { method: 'DELETE' }
      );
      setRows((prev) => prev.filter((r) => r.id !== file.id));
      addToast(format(t.trashed, { name: file.name }), 'success');
    } catch {
      addToast(t.trashError, 'error');
    } finally {
      setTrashing(null);
    }
  };

  const typeLabels: Record<string, string> = {
    folder: t.typeFolder,
    pdf: t.typePdf,
    doc: t.typeDoc,
    sheet: t.typeSheet,
    slides: t.typeSlides,
    image: t.typeImage,
    other: t.typeOther,
  };

  // Colonnes déclaratives (kit A5) : `value` sert au tri, à la recherche et à
  // l'export — pas de seconde description des mêmes données.
  const columns: DataTableColumn<DriveRow>[] = [
    {
      key: 'name',
      header: t.colName,
      value: (f) => f.name,
      className: 'font-medium text-white',
      render: (f) =>
        f.isFolder ? (
          // Un dossier NAVIGUE (on reste dans l'admin) ; un fichier SORT vers
          // Drive. Deux gestes différents, deux affordances différentes.
          <button
            type="button"
            onClick={() => setFolderId(f.id)}
            className="text-left text-[var(--or-200,#eec4ff)] underline-offset-2 hover:underline"
          >
            📁 {f.name}
          </button>
        ) : (
          <span>{f.name}</span>
        ),
    },
    {
      key: 'type',
      header: t.colType,
      value: (f) => typeLabels[driveTypeKey(f.mimeType)] ?? t.typeOther,
    },
    {
      key: 'size',
      header: t.colSize,
      // Trié sur l'octet, affiché en Ko/Mo : trier « 9 Ko » et « 10 Mo »
      // alphabétiquement mettrait le mégaoctet avant le kilooctet.
      value: (f) => f.size ?? 0,
      render: (f) => <>{formatDriveSize(f.size) ?? t.sizeUnknown}</>,
      className: 'tabular-nums',
    },
    {
      key: 'modified',
      header: t.colModified,
      value: (f) => f.modifiedTime ?? '',
      render: (f) => (
        <>
          {f.modifiedTime
            ? new Date(f.modifiedTime).toLocaleDateString('fr-FR')
            : '—'}
        </>
      ),
    },
    {
      key: 'modifiedBy',
      header: t.colModifiedBy,
      value: (f) => f.modifiedBy ?? '',
      render: (f) => <>{f.modifiedBy ?? t.modifiedByUnknown}</>,
    },
    {
      key: 'actions',
      header: t.colActions,
      sortable: false,
      render: (f) => (
        <div className="flex items-center justify-end gap-2">
          {/* Téléchargement DIRECT, servi par le site. Il fonctionne même pour
              qui n'a pas d'accès Google personnel au dossier — c'était le trou
              du lien sortant : le site disait oui, Google non. Un dossier n'a
              rien à télécharger : on descend dedans. */}
          {!f.isFolder && (
            <a
              href={
                `/api/admin/documents/download?fileId=${encodeURIComponent(f.id)}` +
                (folderId ? `&folderId=${encodeURIComponent(folderId)}` : '')
              }
              title={format(t.downloadTitle, { name: f.name })}
              className={ROW_LINK_SECONDARY}
            >
              {t.download}
            </a>
          )}
          {f.webViewLink && (
            <a
              href={f.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className={ROW_LINK_GHOST}
            >
              {t.openInDrive}
            </a>
          )}
          {canWrite && !f.isFolder && (
            // Pas de corbeille sur un DOSSIER : jeter un dossier emporte tout
            // ce qu'il contient, et rien dans cette page ne montre ce que c'est.
            <AdminButton
              size="xs"
              variant="danger"
              onClick={() => void handleTrash(f)}
              disabled={trashing === f.id}
            >
              {trashing === f.id ? t.trashing : t.trash}
            </AdminButton>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div>
          <p className="mb-2 font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
            {t.eyebrow}
          </p>
          <AdminPageHeader
            title={t.heading}
            subtitle={
              <>
                <span className="block max-w-3xl">{t.intro}</span>
                <span className="mt-2 block max-w-3xl text-xs text-[var(--t4,#807984)]">
                  {t.downloadNote}
                </span>
              </>
            }
            actions={
              configured && canWrite ? (
                <DriveUploadButton
                  folderId={folderId}
                  onUploaded={() => void load(folderId)}
                />
              ) : undefined
            }
          />

          {!configured && awaitingKey && canStoreKey ? (
            // Le compte de service est là, seule la clé manque : proposer de la
            // coller, plutôt que de renvoyer vers la création d'un compte que
            // la personne a déjà faite.
            <DrivePrivateKeyForm onStored={() => void load(folderId)} />
          ) : !configured ? (
            <div className="max-w-3xl rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6">
              <h2 className="text-lg font-semibold text-amber-100">
                {t.setupTitle}
              </h2>
              <p className="mt-2 text-sm text-neutral-300">{t.setupIntro}</p>
              <ol className="mt-4 space-y-2 text-sm text-neutral-300">
                <li>{t.setupStep1}</li>
                <li>{t.setupStep2}</li>
                <li>{t.setupStep3}</li>
              </ol>
              <p className="mt-4 border-t border-white/10 pt-4 text-xs text-neutral-400">
                {t.setupWhy}
              </p>
            </div>
          ) : (
            <>
              {breadcrumb.length > 0 && (
                <nav
                  aria-label={t.breadcrumbAria}
                  className="mb-3 flex flex-wrap items-center gap-1 text-sm text-[var(--t3,#a39ba6)]"
                >
                  {breadcrumb.map((crumb, i) => (
                    <span key={crumb.id} className="flex items-center gap-1">
                      {i > 0 && <span aria-hidden="true">/</span>}
                      {i === breadcrumb.length - 1 ? (
                        <span className="text-[var(--t1,#f4edf7)]">
                          {crumb.name}
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setFolderId(crumb.id)}
                          className="text-[var(--or-200,#eec4ff)] underline-offset-2 hover:underline"
                        >
                          {crumb.name}
                        </button>
                      )}
                    </span>
                  ))}
                </nav>
              )}

              {/* L'import vit dans les actions de l'en-tête ; en lecture seule,
                  on le dit à la place. */}
              {!canWrite && (
                <p className="mb-4 text-xs text-[var(--t4,#807984)]">
                  {t.readOnlyNote}
                </p>
              )}

              {!loading && !error && rows.length > 0 && (
                <p
                  className="mb-3 text-sm text-[var(--t3,#a39ba6)]"
                  data-numeric
                >
                  {format(t.count, { count: rows.length })}
                </p>
              )}

              <div className={CARD}>
                <DataTable<DriveRow>
                  rows={rows}
                  columns={columns}
                  rowKey={(f) => f.id}
                  loading={loading}
                  error={error}
                  onRetry={() => void load(folderId)}
                  emptyTitle={t.empty}
                  searchPlaceholder={t.searchPlaceholder}
                  exportFilename="documents-asso"
                />
              </div>
            </>
          )}
        </div>
      </div>
      {dialog}
    </>
  );
}
