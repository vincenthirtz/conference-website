// features/admin/users/ui/PlayerViewBlocks.tsx — les blocs d'affichage de la
// « Vue player » (pages/admin/users/[userId]/player-view.tsx), passés en
// « Le Ruban » et sortis de la page (règle A7 : elle est gelée en taille).
//
// Purement présentationnel : la page garde l'état, les confirmations et les
// appels admin ; elle ne passe ici que des valeurs et des callbacks.

import type { ReactNode } from 'react';
import Image from 'next/image';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminUserPlayerView from '@/lib/i18n/locales/admin-fr/adminUserPlayerView';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import type { ChipTone } from '@/features/admin/_shared/ui/Chip';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import {
  formatDate,
  getDemandeTypeLabels,
  initials,
} from '@/components/admin/users/playerViewDisplay';
import type { AdminUserProfilePayload } from '@/pages/api/admin/users/[userId]/profile';

/** Ton de la puce de rôle (reprend les teintes de l'ancien badge). */
export function roleChipTone(role: string | null): ChipTone {
  switch ((role || '').toLowerCase()) {
    case 'owner':
      return 'brand';
    case 'admin':
      return 'err';
    case 'caster':
      return 'warn';
    case 'player':
      return 'ok';
    default:
      return 'neutral';
  }
}

const EYEBROW =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';

/** Bandeau « vous regardez l'espace de … » — porte le h1 de la page. */
export function PlayerViewBanner({ name }: { name: string }) {
  const t = useAdminT(nsAdminUserPlayerView);
  return (
    <div
      role="status"
      className="mb-8 rounded-[var(--r-card,14px)] border border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.06)] px-5 py-4"
    >
      <h1 className="text-lg font-bold text-[var(--t1,#f4edf7)] md:text-xl">
        {format(t.bannerTitle, { name })}
      </h1>
      <p className="mt-1 text-sm text-[var(--t2,#c7bfca)]">
        {t.bannerDescBefore}
        <strong className="text-[var(--lf-200,#b3e7a3)]">
          {t.bannerDescStrong}
        </strong>
        {t.bannerDescAfter}
      </p>
    </div>
  );
}

/** Résumé d'identité, visible sur tous les onglets. */
export function PlayerIdentitySummary({
  profile,
  roleBadge,
  captainBadge,
}: {
  profile: AdminUserProfilePayload;
  roleBadge: ReactNode;
  captainBadge: ReactNode;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  return (
    <div
      aria-label={t.identitySummaryLabel}
      className="mb-6 rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center gap-4">
        {profile.user.avatarUrl ? (
          <Image
            src={profile.user.avatarUrl}
            alt=""
            width={48}
            height={48}
            className="h-12 w-12 rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded-[var(--r-ctrl,4px)] border-l-[3px] border-[var(--or,#b467d1)] bg-[var(--s3,#2f2732)] font-[family-name:var(--fd)] font-extrabold text-[var(--t1,#f4edf7)] [font-stretch:75%]">
            {initials(profile.user.displayName, profile.user.email)}
          </div>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-semibold text-[var(--t1,#f4edf7)]">
              {profile.user.displayName || t.noName}
            </span>
            {roleBadge}
          </div>
          {profile.team && (
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-[var(--t3,#a39ba6)]">
              {profile.team.name}
              {profile.team.role === 'captain' && captainBadge}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Fiche d'identité de l'onglet Profil. */
export function PlayerProfileFacts({
  profile,
  roleBadge,
}: {
  profile: AdminUserProfilePayload;
  roleBadge: ReactNode;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  const value = 'text-sm text-[var(--t1,#f4edf7)]';
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      <div>
        <dt className={EYEBROW}>{t.fieldEmail}</dt>
        <dd className={`${value} break-all`}>{profile.user.email || '—'}</dd>
      </div>
      <div>
        <dt className={EYEBROW}>{t.fieldRole}</dt>
        <dd className="mt-1">{roleBadge}</dd>
      </div>
      <div>
        <dt className={EYEBROW}>{t.fieldBattleTag}</dt>
        <dd className={`${value} font-mono`}>
          {profile.user.battleTag || '—'}
        </dd>
      </div>
      <div>
        <dt className={EYEBROW}>{t.fieldRegisteredOn}</dt>
        <dd className={value}>{formatDate(profile.user.createdAt)}</dd>
      </div>
      <div className="sm:col-span-2">
        <dt className={EYEBROW}>{t.fieldId}</dt>
        <dd className="break-all font-mono text-xs text-[var(--t3,#a39ba6)]">
          {profile.user.id}
        </dd>
      </div>
    </dl>
  );
}

/** Titre de sous-partie du panneau Profil (actions, demandes). */
export function PanelHeading({ children }: { children: ReactNode }) {
  return <h3 className={`mb-3 ${EYEBROW}`}>{children}</h3>;
}

type PendingDemandeRow = {
  id: string;
  type: string;
  created_at: string;
  team?: { id: string; name: string } | null;
};

/** Demandes en attente de la joueuse — modération staff. */
export function PendingDemandesList({
  demandes,
  busy,
  onProcess,
}: {
  demandes: PendingDemandeRow[];
  busy: string | null;
  onProcess: (id: string, status: 'approved' | 'rejected') => void;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  if (demandes.length === 0) {
    return (
      <p className="text-sm text-[var(--t4,#807984)]">{t.noDemandeDesc}</p>
    );
  }
  const typeLabels = getDemandeTypeLabels(t);
  return (
    <div className="divide-y divide-[var(--line,rgba(194,196,201,.12))] rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))]">
      {demandes.map((d) => (
        <div
          key={d.id}
          className="flex flex-wrap items-center justify-between gap-3 p-3"
        >
          <div className="min-w-0">
            <p className="text-sm text-[var(--t1,#f4edf7)]">
              {typeLabels[d.type] || t.demandeTypeOther}
              {d.team?.name && (
                <span className="text-[var(--t3,#a39ba6)]">
                  {' · '}
                  {d.team.name}
                </span>
              )}
            </p>
            <p className="font-mono text-xs text-[var(--t3,#a39ba6)]">
              {formatDate(d.created_at)}
            </p>
          </div>
          <div className="flex gap-2">
            <AdminButton
              size="xs"
              variant="secondary"
              onClick={() => onProcess(d.id, 'approved')}
              disabled={busy === `demande-${d.id}`}
            >
              {t.approve}
            </AdminButton>
            <AdminButton
              size="xs"
              variant="danger"
              onClick={() => onProcess(d.id, 'rejected')}
              disabled={busy === `demande-${d.id}`}
            >
              {t.reject}
            </AdminButton>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Cadre d'inspection : le vrai écran joueur, rendu tel quel.
 *
 * Les écrans posent leur propre fond plein écran (c'est le décor de l'espace
 * joueur) ; on les enferme dans un conteneur pour que la page admin garde ses
 * marges et que la frontière « ici c'est SA page » reste visible.
 */
export function InspectionFrame({
  userId,
  userName,
  children,
}: {
  userId: string;
  userName: string;
  children: ReactNode;
}) {
  const t = useAdminT(nsAdminUserPlayerView);
  return (
    <section role="tabpanel">
      <p className="mb-3 text-xs text-[var(--t3,#a39ba6)]">
        {format(t.inspectionNotice, { name: userName })}
      </p>
      <div className="overflow-hidden rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))]">
        <PlayerAreaProvider subjectId={userId} subjectName={userName}>
          {children}
        </PlayerAreaProvider>
      </div>
    </section>
  );
}

/** Pied des modales d'édition : annuler + valider. */
export function ModalActions({
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  disabled,
}: {
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  disabled: boolean;
}) {
  return (
    <>
      <AdminButton size="sm" onClick={onCancel}>
        {cancelLabel}
      </AdminButton>
      <AdminButton
        size="sm"
        variant="primary"
        onClick={onConfirm}
        disabled={disabled}
      >
        {confirmLabel}
      </AdminButton>
    </>
  );
}

/** Champ texte / sélecteur des modales, aux couleurs du Ruban. */
export const MODAL_FIELD_CLASS =
  'w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-[var(--t1,#f4edf7)] focus:outline-none focus:ring-2 focus:ring-[var(--or,#b467d1)] disabled:cursor-not-allowed disabled:opacity-50';
export const MODAL_LABEL_CLASS = 'mb-1 block text-sm text-[var(--t3,#a39ba6)]';
