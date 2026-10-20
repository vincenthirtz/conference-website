// components/admin/moderation/LibraryAccessPanel.tsx
// Onglet « Library » du hub /admin/moderation : QUI ENTRE dans la Women's
// Library de l'espace (lot 14c de docs/PLAN-womens-library.md — une bêta par
// liste), réglé sans redéployer.
//
//   GET / PUT /api/admin/library/access
//
// Réservé à `manage_settings` (owner, admin, ou droit accordé) — la garde de
// la route ; l'onglet, lui, s'ouvre à `moderate_support`. Sans ce droit, le
// panneau ne s'affiche pas. Il dit ce que la porte applique EN CE MOMENT
// (`effectiveMode`), la dérogation `LIBRARY_ACCESS` de l'API si elle est
// posée, et une valeur stockée illisible (fermée : propriétaire seule).
//
// LIMITE (cf. features/player/library/service/libraryOpen.ts, conference-api) :
// retirer quelqu'un bloque ses requêtes aussitôt, mais un compte déjà attesté
// garde les canaux Realtime qu'il a rejoints jusqu'au rafraîchissement de son
// JWT. L'urgence, c'est le bannissement (panneau plus bas).

import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminLibraryAccess from '@/lib/i18n/locales/admin-fr/adminLibraryAccess';
import Chip from '@/features/admin/_shared/ui/Chip';
import AlertBanner from '@/components/admin/AlertBanner';
import { canAccess } from '@/utils/admin/adminAccess';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import type { StaffRole, StaffShape } from '@/types/admin';
import {
  useLibraryAccess,
  useSaveLibraryAccess,
} from '@/features/admin/library/hooks/useLibraryAccess';
import { MODE_LABEL_KEY, type LibraryAccessMode } from './libraryAccess';
import LibraryAccessForm from './LibraryAccessForm';

const MODE_TONE = {
  owner: 'neutral',
  staff: 'neutral',
  beta: 'warn',
  all: 'ok',
} as const satisfies Record<LibraryAccessMode, 'neutral' | 'warn' | 'ok'>;

function LibraryAccessSection() {
  const t = useAdminT(nsAdminLibraryAccess);
  const access = useLibraryAccess();
  const save = useSaveLibraryAccess();
  const data = access.data;

  return (
    <section
      aria-labelledby="library-access-heading"
      data-testid="library-access-panel"
      className="mb-8"
    >
      <div className="mb-3">
        <h2
          id="library-access-heading"
          className="text-2xl font-bold tracking-tight"
        >
          {t.heading}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{t.subtitle}</p>
      </div>
      {access.isError ? (
        <AlertBanner message={adminErrorMessage(access.error, t.loadError)} />
      ) : !data ? null : (
        <>
          <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-neutral-300">
            {t.effectiveLabel}
            <Chip tone={MODE_TONE[data.effectiveMode]}>
              {t[MODE_LABEL_KEY[data.effectiveMode]]}
            </Chip>
          </p>
          {data.envOverride && (
            <AlertBanner
              variant="warning"
              className="mb-3"
              message={format(t.envOverride, {
                mode: t[MODE_LABEL_KEY[data.envOverride]],
              })}
            />
          )}
          {data.invalid && (
            <AlertBanner
              variant="warning"
              className="mb-3"
              message={t.invalidSetting}
            />
          )}
          <LibraryAccessForm key={data.rev} data={data} save={save} />
        </>
      )}
    </section>
  );
}

export default function LibraryAccessPanel({ staff }: { staff: StaffShape }) {
  const allowed = canAccess(
    { permission: 'manage_settings' },
    staff.role as StaffRole,
    staff.permissions
  );
  return allowed ? <LibraryAccessSection /> : null;
}
