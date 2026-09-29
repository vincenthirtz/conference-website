// components/admin/moderation/TcgPhotosPanel.tsx
//
// File de relecture des photos de cartes TCG.
//
// CE QUE LA RELECTRICE DOIT VOIR D'ABORD, c'est l'image — d'où la vignette en
// grand plutôt qu'une ligne de tableau. Vient ensuite QUI l'a déposée : la
// route rend `displayName` et `email` (résolus côté serveur par la RPC de
// profils) ; l'écran affiche le pseudo, à défaut l'email, à défaut
// l'identifiant tronqué, et garde le lien vers la fiche publique. La lecture de
// la réponse et cette chaîne de repli vivent dans `tcgPhotoQueue.ts`.
//
// UNE LECTURE RATÉE N'EST PAS UNE FILE VIDE. La version précédente remplaçait
// la liste par `[]` sur erreur et affichait « Aucune photo en attente » : une
// panne se lisait comme « rien à relire », et les photos attendaient sans que
// personne le sache. L'erreur a désormais son propre état, avec « Réessayer »,
// et un rafraîchissement raté garde la liste déjà affichée.
//
// LE REFUS EST IRRÉVERSIBLE : le fichier est supprimé du bucket, qui est
// public — un cliché refusé n'a rien à y faire. L'écran le dit avant le clic, et
// le refus passe par une confirmation qui nomme la joueuse et le motif transmis.
//
// Le conflit 409 (« plus en attente », « photo remplacée ») n'est pas une
// erreur mais une course normale : la joueuse peut retirer ou remplacer sa
// photo pendant la relecture. La décision envoie le `photoPath` AFFICHÉ, et le
// serveur refuse de trancher sur un autre fichier : on ne peut approuver que ce
// qu'on a vu. On rafraîchit alors la liste au lieu d'insister.

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import AlertBanner from '@/components/admin/AlertBanner';
import LoadingSpinner from '@/components/admin/LoadingSpinner';
import EmptyState from '@/components/ui/EmptyState';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsAdminTcgPhotos from '@/lib/i18n/locales/admin-fr/adminTcgPhotos';
import {
  normalizePendingPhotos,
  photoOwnerLabel,
  type PendingPhoto,
} from './tcgPhotoQueue';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { rubanWarn } from '@/features/admin/diffusion/ui/rubanClasses';

function formatDate(value: string | null, locale: string): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function TcgPhotosPanel() {
  const t = useAdminT(nsAdminTcgPhotos);
  const locale = useLocale();
  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();

  // `null` = jamais chargée. Distinct de `[]` (chargée, vide) ET de l'échec,
  // porté à part par `loadFailed` : cf. l'en-tête.
  const [photos, setPhotos] = useState<PendingPhoto[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setReloading(true);
    try {
      const data = await adminFetchJson<unknown>('/api/admin/tcg/photos');
      setPhotos(normalizePendingPhotos(data));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setReloading(false);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (photo: PendingPhoto, decision: 'approve' | 'reject') => {
      const { userId, photoPath } = photo;
      const reason = reasons[userId]?.trim() || null;
      // Sans le chemin affiché, le serveur refuserait : on recharge la file
      // plutôt que d'envoyer une décision qui ne désignerait aucune image.
      if (!photoPath) {
        addToast(t.conflict, 'info');
        await load();
        return;
      }

      if (decision === 'reject') {
        const name = photoOwnerLabel(photo);
        const ok = await confirm({
          title: format(t.confirmRejectTitle, { name }),
          subtitle: t.confirmRejectBody,
          body: (
            <p className="text-xs text-gray-400">
              {reason
                ? format(t.confirmRejectReason, { reason })
                : t.confirmRejectNoReason}
            </p>
          ),
          variant: 'danger',
          confirmLabel: t.reject,
        });
        if (!ok) return;
      }

      setBusy(userId);
      try {
        const res = await adminFetch('/api/admin/tcg/photos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            photoPath,
            decision,
            reason: decision === 'reject' ? reason : null,
          }),
        });

        if (res.status === 409) {
          addToast(t.conflict, 'info');
          await load();
          return;
        }
        if (!res.ok) {
          addToast(t.error, 'error');
          return;
        }

        addToast(decision === 'approve' ? t.approved : t.rejected, 'success');
        setReasons((prev) => {
          const { [userId]: _done, ...rest } = prev;
          return rest;
        });
        await load();
      } catch {
        addToast(t.error, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetch, addToast, confirm, load, reasons, t]
  );

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold text-white">{t.heading}</h2>
        {photos !== null && photos.length > 0 && (
          <Chip tone="warn">
            {format(t.pendingCount, { count: photos.length })}
          </Chip>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>

      {loadFailed && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <AlertBanner message={t.loadError} variant="error" />
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => void load()}
            disabled={reloading}
          >
            {t.retry}
          </AdminButton>
        </div>
      )}

      {photos === null ? (
        // Premier chargement : un spinner, jamais un écran vide. En échec, le
        // bandeau ci-dessus suffit — rien à faire tourner.
        loadFailed ? null : (
          <LoadingSpinner className="mt-10" label={t.loading} />
        )
      ) : photos.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={t.empty}
          description={t.emptyDescription}
        />
      ) : (
        <ul aria-label={t.listLabel} className="mt-6 grid gap-4 sm:grid-cols-2">
          {photos.map((photo) => {
            const name = photoOwnerLabel(photo);
            const isBusy = busy === photo.userId;
            const reasonId = `tcg-photo-reason-${photo.userId}`;
            const hintId = `tcg-photo-hint-${photo.userId}`;
            return (
              <li
                key={photo.userId}
                aria-busy={isBusy}
                className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4"
              >
                <div className="flex gap-4">
                  {photo.photoUrl ? (
                    <Image
                      src={photo.photoUrl}
                      // L'image EST le contenu à juger : un `alt` vide la
                      // rendrait invisible à qui relit au lecteur d'écran.
                      alt={format(t.photoAlt, { name })}
                      width={128}
                      height={128}
                      className="h-32 w-32 shrink-0 rounded-[var(--r-ctrl,4px)] object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="flex h-32 w-32 shrink-0 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-2 text-center text-[11px] text-gray-500">
                      {t.photoMissing}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-white">
                      {name}
                    </h3>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {format(t.submittedAt, {
                        date: formatDate(photo.submittedAt, locale),
                      })}
                    </p>
                    {/* Avant de valider : sans profil joueuse, aucune carte
                        n'affichera cette photo. */}
                    {photo.hasPlayerProfile === false && (
                      <p
                        role="note"
                        className={`mt-2 px-2 py-1 text-xs ${rubanWarn}`}
                      >
                        <span className="font-semibold">{t.noCardTitle}</span>{' '}
                        {t.noCardBody}
                      </p>
                    )}
                    <Link
                      href={`/player/${photo.userId}`}
                      target="_blank"
                      rel="noreferrer noopener"
                      aria-label={format(t.viewProfileOf, { name })}
                      className="mt-1 inline-block text-sm font-medium text-[var(--color-green-light)] hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
                    >
                      {t.viewProfile}
                    </Link>
                  </div>
                </div>

                {/* Libellé réservé aux lecteurs d'écran : le placeholder
                    disparaît à la saisie et ne tient pas lieu de label. */}
                <label htmlFor={reasonId} className="sr-only">
                  {format(t.reasonLabel, { name })}
                </label>
                <input
                  id={reasonId}
                  type="text"
                  maxLength={500}
                  value={reasons[photo.userId] ?? ''}
                  disabled={isBusy}
                  aria-describedby={hintId}
                  onChange={(e) =>
                    setReasons((prev) => ({
                      ...prev,
                      [photo.userId]: e.target.value,
                    }))
                  }
                  placeholder={t.reasonPlaceholder}
                  className="mt-3 w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400 disabled:opacity-50"
                />
                <p id={hintId} className="mt-2 text-xs text-gray-500">
                  {t.rejectHint}
                </p>

                <div className="mt-3 flex gap-2">
                  <AdminButton
                    variant="secondary"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void decide(photo, 'approve')}
                  >
                    {isBusy ? t.working : t.approve}
                  </AdminButton>
                  <AdminButton
                    variant="danger"
                    size="sm"
                    disabled={isBusy}
                    onClick={() => void decide(photo, 'reject')}
                  >
                    {isBusy ? t.working : t.reject}
                  </AdminButton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {dialog}
    </div>
  );
}
