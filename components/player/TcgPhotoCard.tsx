// components/player/TcgPhotoCard.tsx
//
// Carte « Ma carte à collectionner » : la joueuse y dépose, remplace ou retire
// la photo qui illustrera sa carte dans le TCG.
//
// L'EXPLICATION VIENT AVANT LE BOUTON. Il s'agit de la photo d'une personne
// réelle, sur un objet que d'autres collectionnent, dans un milieu où les
// joueuses subissent du harcèlement. L'écran dit donc d'abord ce qui va se
// passer — visibilité publique, relecture par l'équipe, retrait rétroactif —
// et propose le fichier ensuite. Un simple bouton « envoyer une photo » aurait
// obtenu un consentement sans qu'il soit éclairé.
//
// LE PLAFOND DE TAILLE EST REDÉCLARÉ ICI, à dessein. Le lire depuis
// `utils/uploads/imageBytes.ts` importerait un module qui manipule `Buffer`, et
// ferait entrer un polyfill Node dans le bundle navigateur — travers déjà
// rencontré dans ce dépôt. Les deux valeurs doivent bouger ensemble ; le
// serveur reste l'autorité, il refuse au-delà quoi qu'affiche cet écran.

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';

/** Miroir de `IMAGE_MAX_BYTES` (utils/uploads/imageBytes.ts). Cf. l'en-tête. */
const MAX_MB = 2;
const MAX_BYTES = MAX_MB * 1024 * 1024;
const ACCEPT = 'image/png,image/jpeg,image/webp';
const ACCEPTED_TYPES = ACCEPT.split(',');

type PhotoStatus = 'none' | 'pending' | 'approved' | 'rejected';

type State = {
  status: PhotoStatus;
  photoUrl: string | null;
  optedIn: boolean;
  rejectedReason: string | null;
  /** `false` : aucune carte possible pour ce compte (`null` = inconnu). */
  hasPlayerProfile?: boolean | null;
};

export default function TcgPhotoCard() {
  const t = useT(nsPlayerTcg);
  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await adminFetchJson<State>('/api/player/tcg/photo');
      setState(data);
    } catch {
      // Lecture impossible : on n'affiche pas la carte plutôt que d'afficher un
      // état faux (« aucune photo » alors qu'il y en a peut-être une).
      setState(null);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Traduit le `code` rendu par l'API ; repli générique si inconnu. */
  const errorLabel = useCallback(
    (code: unknown): string => {
      switch (code) {
        case 'missing_data':
          return t.errMissingData;
        case 'unsupported_type':
          return t.errUnsupportedType;
        case 'invalid_base64':
          return t.errInvalidBase64;
        case 'too_large':
          return format(t.errTooLarge, { mo: MAX_MB });
        case 'content_mismatch':
          return t.errContentMismatch;
        case 'no_player_profile':
          return t.errNoPlayerProfile;
        default:
          return t.errGeneric;
      }
    },
    [t]
  );

  const onPick = useCallback(
    async (file: File) => {
      // Contrôles CLIENT, comme le dépôt d'illustration d'équipe
      // (components/Team/TcgTeamImageCard.tsx). Ils ne remplacent pas ceux du
      // serveur, qui reste seul juge — ils rendent le refus LISIBLE.
      //
      // Sans eux, un fichier de plus de ~3 Mio n'atteint jamais le handler :
      // le base64 le gonfle d'un tiers et dépasse le `sizeLimit: '4mb'` du
      // bodyParser, qui répond une erreur sans `code`. L'interface retombait
      // alors sur `errGeneric` — « réessaie dans un instant » — pour une photo
      // qu'aucune tentative ne ferait passer.
      if (!ACCEPTED_TYPES.includes(file.type)) {
        addToast(t.errUnsupportedType, 'error');
        return;
      }
      if (file.size > MAX_BYTES) {
        addToast(format(t.errTooLarge, { mo: MAX_MB }), 'error');
        return;
      }

      setBusy('upload');
      try {
        const data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('read_error'));
          reader.readAsDataURL(file);
        });

        const res = await adminFetch('/api/player/tcg/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data, mimeType: file.type }),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          addToast(errorLabel((body as { code?: string }).code), 'error');
          return;
        }
        addToast(t.uploadSuccess, 'success');
        await load();
      } catch {
        addToast(t.errGeneric, 'error');
      } finally {
        setBusy(null);
        // Sans ce reset, re-choisir LE MÊME fichier ne déclenche pas `change`.
        if (fileRef.current) fileRef.current.value = '';
      }
    },
    [adminFetch, addToast, errorLabel, load, t]
  );

  const onRemove = useCallback(async () => {
    if (!window.confirm(t.confirmRemove)) return;
    setBusy('remove');
    try {
      const res = await adminFetch('/api/player/tcg/photo', {
        method: 'DELETE',
      });
      if (!res.ok) {
        addToast(t.errGeneric, 'error');
        return;
      }
      addToast(t.removeSuccess, 'success');
      await load();
    } catch {
      addToast(t.errGeneric, 'error');
    } finally {
      setBusy(null);
    }
  }, [adminFetch, addToast, load, t]);

  if (!state) return null;

  const noProfile = state.hasPlayerProfile === false;

  const statusLabel =
    state.status === 'pending'
      ? t.statusPending
      : state.status === 'approved'
        ? t.statusApproved
        : state.status === 'rejected'
          ? t.statusRejected
          : t.statusNone;

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl">
      <h2 className="mb-2 text-lg font-semibold">{t.title}</h2>
      <p className="mb-4 text-sm text-gray-300">{t.intro}</p>

      <div className="mb-5 rounded-xl border border-white/10 bg-white/[0.04] p-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
          {t.consentTitle}
        </h3>
        <ul className="space-y-1.5 text-sm text-gray-300">
          <li>{t.consentPublic}</li>
          <li>{t.consentModerated}</li>
          <li>{t.consentRevocable}</li>
        </ul>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {state.photoUrl && (
          <Image
            src={state.photoUrl}
            alt=""
            width={96}
            height={96}
            className="h-24 w-24 rounded-xl object-cover"
            unoptimized
          />
        )}

        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{statusLabel}</p>
          {state.status === 'rejected' && (
            <p className="mt-1 text-xs text-rose-300">
              {state.rejectedReason
                ? format(t.rejectedReason, { reason: state.rejectedReason })
                : t.rejectedNoReason}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {format(t.formatsHint, { mo: MAX_MB })}
          </p>
        </div>
      </div>

      {state.status === 'approved' && (
        <p className="mt-3 text-xs text-gray-500">{t.replaceWarning}</p>
      )}

      {/* Sans profil joueuse, on le dit AVANT l'envoi : une photo déposée ici
          serait validée pour une carte qui n'existe pas. */}
      {noProfile && (
        <div
          role="note"
          className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3"
        >
          <p className="text-sm font-semibold text-amber-200">
            {t.noProfileTitle}
          </p>
          <p className="mt-1 text-xs text-amber-100/80">{t.noProfileBody}</p>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {!noProfile && (
          <label className="inline-flex cursor-pointer items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white transition hover:border-[var(--color-yellow)]/60 hover:text-[var(--color-yellow)]">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              disabled={busy !== null}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onPick(file);
              }}
            />
            {busy === 'upload'
              ? t.uploading
              : state.photoUrl
                ? t.replace
                : t.choose}
          </label>
        )}

        {state.photoUrl && (
          <button
            type="button"
            onClick={() => void onRemove()}
            disabled={busy !== null}
            className="inline-flex items-center rounded-full border border-rose-400/30 px-4 py-2 text-sm text-rose-200 transition hover:bg-rose-500/10 disabled:opacity-50"
          >
            {busy === 'remove' ? t.removing : t.remove}
          </button>
        )}
      </div>
    </section>
  );
}
