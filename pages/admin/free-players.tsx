// pages/admin/free-players.tsx
//
// Écran staff du marché des joueuses libres (lot 1 acquisition).
//
// POURQUOI cet écran alors que chaque joueuse a son lien de retrait par email :
// elle peut avoir perdu l'email, changé d'adresse, ou demander le retrait par
// Discord. Une donnée publiée doit avoir deux portes de sortie — la sienne et
// celle de l'opérateur qu'elle sollicite. C'est aussi la seule vue qui montre
// les DEUX provenances au même endroit.
//
// La page ne fait que câbler le module `features/admin/free-players` (pilote
// du plan d'industrialisation) : données par hooks, tableau présentationnel.

import Head from 'next/head';
import { withStaffPage } from '@/utils/staff';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminFreePlayers from '@/lib/i18n/locales/admin-fr/adminFreePlayers';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import { withAdminQuery } from '@/features/admin/_shared/query';
import {
  useFreePlayersList,
  useRemoveFreePlayer,
} from '@/features/admin/free-players/hooks/useFreePlayers';
import FreePlayersTable from '@/features/admin/free-players/ui/FreePlayersTable';
import type { FreePlayerAdminItem } from '@/features/admin/free-players/schemas';
import type { StaffProps } from '@/types/admin';

export const getServerSideProps = withStaffPage({ permission: 'manage_teams' });

function AdminFreePlayersPage(_props: StaffProps) {
  const t = useAdminT(nsAdminFreePlayers);
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();
  const list = useFreePlayersList();
  const remove = useRemoveFreePlayer();
  const items = list.data?.items ?? [];

  const handleRemove = async (item: FreePlayerAdminItem) => {
    const ok = await confirm({
      title: t.confirmTitle,
      // Le staff doit savoir AVANT de cliquer qu'un retrait Discord n'est pas
      // durable — sinon il le découvre 30 minutes plus tard, en la revoyant.
      subtitle:
        item.source === 'discord' ? t.confirmBodyDiscord : t.confirmBody,
      variant: 'danger',
      confirmLabel: t.confirmCta,
      cancelLabel: t.cancel,
    });
    if (!ok) return;
    try {
      const res = await remove.mutateAsync(item.id);
      addToast(res.willReturn ? t.removedWillReturn : t.removed, 'success');
    } catch (err) {
      addToast(adminErrorMessage(err, t.removeError), 'error');
    }
  };

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 pt-header pb-12 sm:px-6 lg:px-8">
          <div className="mb-6">
            <p className="text-sm text-neutral-400">{t.eyebrow}</p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight md:text-4xl">
              {t.heading}
            </h1>
            <p className="mt-2 max-w-3xl text-sm text-neutral-400">{t.intro}</p>
            <p className="mt-2 max-w-3xl text-xs text-neutral-500">
              {t.selfServiceNote}
            </p>
          </div>

          {list.isSuccess && items.length > 0 && (
            <p className="mb-3 text-sm text-neutral-400">
              {format(t.count, { count: items.length })}
            </p>
          )}

          <FreePlayersTable
            items={items}
            loading={list.isPending}
            error={list.isError}
            onRetry={() => void list.refetch()}
            onRemove={(i) => void handleRemove(i)}
            removingId={remove.isPending ? (remove.variables ?? null) : null}
          />
        </div>
      </div>
      {dialog}
    </>
  );
}

export default withAdminQuery(AdminFreePlayersPage);
