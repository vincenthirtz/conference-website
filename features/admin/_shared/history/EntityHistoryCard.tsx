// features/admin/_shared/history/EntityHistoryCard.tsx — l'historique en
// colonne de droite de l'archétype Fiche : les dernières actions sur l'entité,
// « TOUT VOIR » ouvre le tiroir complet (EntityHistoryDrawer, avant/après L8).
//
// Si la personne n'a pas le droit de lire le journal (route gardée par
// `manage_settings`), la carte ne s'affiche pas : une carte vide ou en erreur
// n'apprendrait rien.

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import EntityHistoryDrawer from '@/components/admin/EntityHistoryDrawer';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminEntityHistory from '@/lib/i18n/locales/admin-fr/adminEntityHistory';
import type { HistoryEntityType } from '@/pages/api/admin/entity-history';
import { adminRequest } from '@/utils/admin/adminHttp';
import { adminKey } from '../query';
import { FicheSection } from '../ui/Fiche';

type Log = {
  id: string;
  created_at: string;
  readableAction: string;
  staff: { display_name: string | null } | null;
};

const SHOWN = 3;

export default function EntityHistoryCard({
  entityType,
  entityId,
}: {
  entityType: HistoryEntityType;
  entityId: string;
}) {
  const t = useAdminT(nsAdminEntityHistory);
  const [open, setOpen] = useState(false);
  const history = useQuery({
    queryKey: adminKey('entity-history', entityType, entityId),
    queryFn: () =>
      adminRequest<{ logs: Log[] }>(
        `/api/admin/entity-history?type=${encodeURIComponent(entityType)}&id=${encodeURIComponent(entityId)}`,
        { skipAuthRedirect: true }
      ),
  });
  if (history.isError) return null;
  const logs = history.data?.logs ?? [];

  return (
    <>
      <FicheSection
        eyebrow
        title={t.title}
        aside={
          logs.length > 0 && (
            <button
              type="button"
              data-case="normal"
              onClick={() => setOpen(true)}
              className="font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--or-300,#dea3f6)]"
            >
              {t.seeAll}
            </button>
          )
        }
      >
        {history.isPending ? (
          <p className="text-[13px] text-[var(--t4,#807984)]">{t.loading}</p>
        ) : logs.length === 0 ? (
          <p className="text-[13px] text-[var(--t3,#a39ba6)]">{t.empty}</p>
        ) : (
          <ol className="flex flex-col">
            {logs.slice(0, SHOWN).map((log) => (
              <li
                key={log.id}
                className="flex gap-3 border-b border-[var(--line,rgba(194,196,201,.12))] py-2.5 text-[12.5px] last:border-0"
              >
                <time
                  dateTime={log.created_at}
                  className="w-[52px] shrink-0 font-mono text-[var(--t4,#807984)]"
                >
                  {new Date(log.created_at).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })}
                </time>
                <span className="text-[var(--t3,#a39ba6)]">
                  <span className="text-[var(--t1,#f4edf7)]">
                    {log.staff?.display_name ?? t.unknownStaff}
                  </span>{' '}
                  {log.readableAction}
                </span>
              </li>
            ))}
          </ol>
        )}
      </FicheSection>
      <EntityHistoryDrawer
        entityType={entityType}
        entityId={entityId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
