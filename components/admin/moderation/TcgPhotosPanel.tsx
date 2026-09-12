// components/admin/moderation/TcgPhotosPanel.tsx
//
// File de relecture des photos de cartes TCG.
//
// CE QUE LA RELECTRICE DOIT VOIR D'ABORD, c'est l'image — d'où la vignette en
// grand plutôt qu'une ligne de tableau. Le nom de la joueuse n'est pas résolu
// ici (le profil vit dans `auth.users.raw_user_meta_data`, via une RPC) : le
// lien vers la fiche publique le donne, et l'ajouter serait un enrichissement,
// pas une réécriture.
//
// LE REFUS EST IRRÉVERSIBLE et l'écran le dit avant le clic : le fichier est
// supprimé du bucket, qui est public — un cliché refusé n'a rien à y faire.
//
// Le conflit 409 (« plus en attente ») n'est pas une erreur mais une course
// normale : la joueuse peut retirer sa photo pendant la relecture, et sa
// décision prime. On rafraîchit alors la liste au lieu d'insister.

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTcgPhotos from '@/lib/i18n/locales/admin-fr/adminTcgPhotos';

type PendingPhoto = {
  userId: string;
  photoUrl: string | null;
  submittedAt: string | null;
};

function formatDate(value: string | null): string {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return value;
  }
}

export default function TcgPhotosPanel() {
  const t = useAdminT(nsAdminTcgPhotos);
  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch();

  const [photos, setPhotos] = useState<PendingPhoto[] | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ photos: PendingPhoto[] }>(
        '/api/admin/tcg/photos'
      );
      setPhotos(data.photos ?? []);
    } catch {
      setPhotos([]);
      addToast(t.loadError, 'error');
    }
  }, [adminFetchJson, addToast, t.loadError]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = useCallback(
    async (userId: string, decision: 'approve' | 'reject') => {
      setBusy(userId);
      try {
        const res = await adminFetch('/api/admin/tcg/photos', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId,
            decision,
            reason: decision === 'reject' ? (reasons[userId] ?? null) : null,
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
        await load();
      } catch {
        addToast(t.error, 'error');
      } finally {
        setBusy(null);
      }
    },
    [adminFetch, addToast, load, reasons, t]
  );

  return (
    <div>
      <h2 className="text-lg font-semibold text-white">{t.heading}</h2>
      <p className="mt-1 text-sm text-gray-400">{t.subtitle}</p>

      {photos === null ? (
        <p className="mt-6 text-sm text-gray-400">{t.loading}</p>
      ) : photos.length === 0 ? (
        <p className="mt-6 text-sm text-gray-400">{t.empty}</p>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {photos.map((photo) => (
            <li
              key={photo.userId}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
            >
              <div className="flex gap-4">
                {photo.photoUrl && (
                  <Image
                    src={photo.photoUrl}
                    alt=""
                    width={128}
                    height={128}
                    className="h-32 w-32 shrink-0 rounded-xl object-cover"
                    unoptimized
                  />
                )}
                <div className="min-w-0">
                  <p className="text-xs text-gray-500">
                    {format(t.submittedAt, {
                      date: formatDate(photo.submittedAt),
                    })}
                  </p>
                  <Link
                    href={`/player/${photo.userId}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-1 inline-block text-sm font-medium text-[var(--color-green-light)] hover:underline"
                  >
                    {t.viewProfile}
                  </Link>
                </div>
              </div>

              <input
                type="text"
                value={reasons[photo.userId] ?? ''}
                onChange={(e) =>
                  setReasons((prev) => ({
                    ...prev,
                    [photo.userId]: e.target.value,
                  }))
                }
                placeholder={t.reasonPlaceholder}
                className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500"
              />
              <p className="mt-2 text-xs text-gray-500">{t.rejectHint}</p>

              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  disabled={busy === photo.userId}
                  onClick={() => void decide(photo.userId, 'approve')}
                  className="rounded-full border border-emerald-400/30 px-4 py-1.5 text-sm text-emerald-200 transition hover:bg-emerald-500/10 disabled:opacity-50"
                >
                  {t.approve}
                </button>
                <button
                  type="button"
                  disabled={busy === photo.userId}
                  onClick={() => void decide(photo.userId, 'reject')}
                  className="rounded-full border border-rose-400/30 px-4 py-1.5 text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {t.reject}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
