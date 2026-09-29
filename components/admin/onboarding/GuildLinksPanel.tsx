// components/admin/onboarding/GuildLinksPanel.tsx
//
// "Liens Discord" tab of the merged /admin/onboarding hub (manager+).
// Extracted from the former /admin/pending-guild-links page: staff claim a
// Discord guild that invited the bot but isn't linked to a tenant yet.

import { useState } from 'react';
import { useAdminResource } from '@/hooks/useAdminResource';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { tenantsPaths } from '@/features/admin/tenants/client';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import AlertBanner from '@/components/admin/AlertBanner';
import Modal from '@/components/admin/Modal';
import AdminListShell from '@/components/admin/AdminListShell';
import {
  useAccessibleTenants,
  type AccessibleTenant,
} from '@/hooks/useAccessibleTenants';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminPendingGuildLinks from '@/lib/i18n/locales/admin-fr/adminPendingGuildLinks';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type PendingLink = {
  guild_id: string;
  guild_name: string | null;
  owner_discord_id: string | null;
  requested_at: string | null;
};

type PendingLinksResponse = {
  links: PendingLink[];
};

function formatDate(s: string | null): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return s;
  }
}

type ClaimMode = 'existing' | 'new';

type ClaimModalState = {
  guild: PendingLink;
  mode: ClaimMode;
  selectedTenantId: string;
  newSlug: string;
  newName: string;
  saving: boolean;
  error: string | null;
};

export default function GuildLinksPanel() {
  const t = useAdminT(nsAdminPendingGuildLinks);
  const { addToast } = useToast();
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { tenants } = useAccessibleTenants();

  const [modal, setModal] = useState<ClaimModalState | null>(null);

  // Liste non paginée (endpoint owner-only) → `includeTotal: false`.
  const {
    data: links,
    loading,
    error,
    refresh: fetchData,
  } = useAdminResource<PendingLink, PendingLinksResponse>(
    tenantsPaths.pendingGuildLinks,
    {
      includeTotal: false,
      select: (res) => res.links || [],
    }
  );

  const openClaim = (guild: PendingLink) => {
    setModal({
      guild,
      mode: 'existing',
      selectedTenantId:
        tenants.find((t: AccessibleTenant) => t.is_active)?.id ?? '',
      newSlug: '',
      newName: '',
      saving: false,
      error: null,
    });
  };

  const closeModal = () => setModal(null);

  const submitClaim = async () => {
    if (!modal) return;
    setModal({ ...modal, saving: true, error: null });
    try {
      let body: unknown;
      if (modal.mode === 'existing') {
        if (!modal.selectedTenantId) {
          setModal({
            ...modal,
            saving: false,
            error: t.errorSelectTenant,
          });
          return;
        }
        body = { tenant_id: modal.selectedTenantId };
      } else {
        const slug = modal.newSlug.trim().toLowerCase();
        const name = modal.newName.trim();
        if (!slug || !name) {
          setModal({
            ...modal,
            saving: false,
            error: t.errorSlugNameRequired,
          });
          return;
        }
        if (!SLUG_RE.test(slug)) {
          setModal({
            ...modal,
            saving: false,
            error: t.errorSlugInvalid,
          });
          return;
        }
        body = { new_tenant: { slug, name } };
      }
      await mutateJson(tenantsPaths.claimGuildLink(modal.guild.guild_id), {
        method: 'POST',
        body: JSON.stringify(body),
      });
      addToast(t.toastAssigned, 'success');
      closeModal();
      fetchData();
    } catch (err) {
      setModal((prev) =>
        prev
          ? {
              ...prev,
              saving: false,
              error: (err as Error)?.message ?? t.errorAssign,
            }
          : null
      );
    }
  };

  const handleReject = async (guild: PendingLink) => {
    const ok = await confirm({
      title: format(t.confirmRejectTitle, {
        name: guild.guild_name ?? guild.guild_id,
      }),
      subtitle: t.confirmRejectSubtitle,
      variant: 'danger',
      confirmLabel: t.reject,
    });
    if (!ok) return;
    try {
      await mutateJson(tenantsPaths.pendingGuildLink(guild.guild_id), {
        method: 'DELETE',
      });
      addToast(t.toastRejected, 'success');
      fetchData();
    } catch (err) {
      addToast((err as Error)?.message || t.errorReject, 'error');
    }
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{t.heading}</h2>
        <p className="mt-1 text-sm text-neutral-400">{t.subtitle}</p>
      </div>

      <AlertBanner message={error} className="mb-4" />

      <section className="bg-[var(--s1,#100812)] backdrop-blur border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] overflow-hidden">
        <AdminListShell
          loading={loading}
          error={null}
          isEmpty={links.length === 0}
          loadingLabel={t.loading}
          emptyTitle={t.emptyTitle}
          emptyMessage={t.emptyDesc}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-neutral-900/50 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colGuild}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colOwner}
                  </th>
                  <th scope="col" className="px-4 py-3 text-left">
                    {t.colRequested}
                  </th>
                  <th scope="col" className="px-4 py-3 text-right">
                    {t.colActions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-700/50">
                {links.map((g) => (
                  <tr
                    key={g.guild_id}
                    className="hover:bg-neutral-700/30 transition-colors"
                    data-testid={`pending-link-row-${g.guild_id}`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-white">
                        {g.guild_name ?? t.noName}
                      </div>
                      <div className="text-xs font-mono text-purple-300">
                        {g.guild_id}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-neutral-300 font-mono text-xs">
                      {g.owner_discord_id ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-neutral-400 text-xs">
                      {formatDate(g.requested_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2 flex-wrap">
                        <AdminButton
                          variant="secondary"
                          size="xs"
                          type="button"
                          onClick={() => openClaim(g)}
                          data-testid={`claim-${g.guild_id}`}
                        >
                          {t.assign}
                        </AdminButton>
                        <AdminButton
                          variant="danger"
                          size="xs"
                          type="button"
                          onClick={() => handleReject(g)}
                        >
                          {t.reject}
                        </AdminButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminListShell>
      </section>

      <Modal
        open={Boolean(modal)}
        onClose={closeModal}
        zIndexClassName="z-[200]"
        backdropClassName="bg-black/70"
        panelChromeClassName="bg-[var(--s1,#100812)] border border-[var(--line2,rgba(194,196,201,.2))] rounded-[var(--r-card,14px)] shadow-2xl"
        size="lg"
        title={
          <h2 className="text-lg font-semibold text-white">
            {format(t.modalTitle, {
              name: modal?.guild.guild_name ?? modal?.guild.guild_id ?? '',
            })}
          </h2>
        }
        subtitle={t.modalSubtitle}
        footer={
          <>
            <AdminButton
              variant="ghost"
              size="sm"
              type="button"
              onClick={closeModal}
            >
              {t.cancel}
            </AdminButton>
            <AdminButton
              variant="primary"
              size="sm"
              type="button"
              onClick={submitClaim}
              disabled={modal?.saving}
            >
              {modal?.saving ? t.assigning : t.assignBtn}
            </AdminButton>
          </>
        }
      >
        {modal && (
          <div className="space-y-4">
            <AlertBanner message={modal.error} />

            <div className="flex gap-2">
              {(['existing', 'new'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setModal({ ...modal, mode: m })}
                  className={`flex-1 px-3 py-2 rounded-[var(--r-ctrl,4px)] border text-sm transition-colors ${
                    modal.mode === m
                      ? 'border-[rgba(180,103,209,.45)] bg-[rgba(180,103,209,.12)] text-[var(--or-200,#eec4ff)]'
                      : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] text-[var(--t2,#c7bfca)] hover:text-[var(--t1,#f4edf7)]'
                  }`}
                >
                  {m === 'existing' ? t.modeExisting : t.modeNew}
                </button>
              ))}
            </div>

            {modal.mode === 'existing' ? (
              <div>
                <label
                  htmlFor="claim-tenant-select"
                  className="block text-xs font-medium text-neutral-400 mb-1"
                >
                  {t.tenantLabel}
                </label>
                <select
                  id="claim-tenant-select"
                  value={modal.selectedTenantId}
                  onChange={(e) =>
                    setModal({
                      ...modal,
                      selectedTenantId: e.target.value,
                    })
                  }
                  className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">{t.selectPlaceholder}</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.slug} — {tenant.name}
                      {!tenant.is_active ? t.archivedSuffix : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="claim-new-slug"
                    className="block text-xs font-medium text-neutral-400 mb-1"
                  >
                    {t.slugLabel}
                  </label>
                  <input
                    id="claim-new-slug"
                    type="text"
                    value={modal.newSlug}
                    onChange={(e) =>
                      setModal({
                        ...modal,
                        newSlug: e.target.value.toLowerCase(),
                      })
                    }
                    placeholder={t.slugPlaceholder}
                    className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm font-mono focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div>
                  <label
                    htmlFor="claim-new-name"
                    className="block text-xs font-medium text-neutral-400 mb-1"
                  >
                    {t.nameLabel}
                  </label>
                  <input
                    id="claim-new-name"
                    type="text"
                    value={modal.newName}
                    onChange={(e) =>
                      setModal({ ...modal, newName: e.target.value })
                    }
                    placeholder={t.namePlaceholder}
                    className="w-full px-3 py-2 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {dialog}
    </>
  );
}
