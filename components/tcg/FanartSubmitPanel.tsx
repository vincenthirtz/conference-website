// components/tcg/FanartSubmitPanel.tsx
//
// « Proposer une carte fan art », dans la page TCG de l'espace joueuse.
//
// LE CRÉDIT EST UN CHAMP, PAS UNE DÉDUCTION. On demande le nom sous lequel la
// personne veut être reconnue : son pseudo de compte n'est pas forcément sa
// signature d'artiste, et une carte doit créditer le bon nom.
//
// LA CASE N'EST PAS UNE FORMALITÉ. Sans déclaration d'originalité ni accord de
// diffusion, on publierait le travail de quelqu'un sans le savoir : le bouton
// reste inactif tant qu'elle n'est pas cochée, et le serveur la réexige.
//
// L'IMAGE PART EN BASE64, comme la photo de carte (`TcgPhotoCard`) : le serveur
// vérifie le contenu (magic bytes) avant de la poser dans un bucket PUBLIC.
//
// TYPE ET TAILLE SONT VÉRIFIÉS AVANT L'ENVOI, et chaque refus a son message
// (`utils/tcg/fanartUploadErrors.ts`). Auparavant, tout refus d'image disait
// « vérifie le format et la taille », et un fichier trop lourd pour le
// bodyParser (413 sans `code`) disait « réessaie » — à une artiste dont l'envoi
// ne pouvait jamais passer.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import Link from 'next/link';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import nsTcgFanart from '@/lib/i18n/locales/fr/tcgFanart';
import { FANART_LIMITS } from '@/utils/tcg/fanart';
import {
  FANART_ACCEPT,
  FANART_MAX_MIB,
  checkFanartFile,
  fanartErrorKey,
  type FanartErrorKey,
} from '@/utils/tcg/fanartUploadErrors';

type Submission = {
  id: string;
  title: string;
  artistName: string;
  artistUrl: string | null;
  imageUrl: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'revoked';
  reviewNotes: string | null;
};

type Response = {
  submissions: Submission[];
  pending: number;
  maxPending: number;
  maxBytes: number;
};

export default function FanartSubmitPanel({
  className,
}: {
  className?: string;
}): JSX.Element {
  const t = useT(nsTcgFanart);
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { addToast } = useToast();

  const [data, setData] = useState<Response | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [artistUrl, setArtistUrl] = useState('');
  const [licence, setLicence] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await adminFetchJson<Response>('/api/player/tcg/fanart');
      setData(res);
      loadedOnce.current = true;
      setState('ready');
    } catch {
      if (!loadedOnce.current) setState('error');
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Le texte d'un refus. La CLÉ vient de `utils/tcg/fanartUploadErrors.ts`, où
   * la règle est testée : un refus définitif (taille, format, contenu, champ)
   * dit quoi changer, et seul un incident passager invite à réessayer. Ici on
   * ne fait que remplir les variables du message.
   */
  const errorText = useCallback(
    (key: FanartErrorKey, maxPending: number): string =>
      format(t[key], {
        max:
          key === 'errorTooManyPending'
            ? maxPending
            : key === 'errorTitle'
              ? FANART_LIMITS.title
              : key === 'errorArtistName'
                ? FANART_LIMITS.artistName
                : FANART_MAX_MIB,
      }),
    [t]
  );

  const submit = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    // Contrôles CLIENT avant l'envoi, comme `components/player/TcgPhotoCard.tsx`.
    // Ils ne remplacent pas ceux du serveur (magic bytes compris), ils rendent
    // le refus LISIBLE : au-delà du plafond du bodyParser, Next répond 413 sans
    // `code`, avant même le handler.
    const refused = checkFanartFile(file);
    if (refused || !file) {
      addToast(
        errorText(refused ?? 'errorMissingImage', data?.maxPending ?? 3),
        'error'
      );
      return;
    }
    setBusy(true);
    try {
      const payload = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('read_error'));
        reader.readAsDataURL(file);
      });
      const res = await adminFetch('/api/player/tcg/fanart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: payload,
          mimeType: file.type,
          title: title.trim(),
          artistName: artistName.trim(),
          artistUrl: artistUrl.trim() || undefined,
          licenceAccepted: licence,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { code?: string };
        addToast(
          errorText(
            fanartErrorKey(res.status, body.code),
            data?.maxPending ?? 3
          ),
          'error'
        );
        // Relu aussi sur refus : un `too_many_pending` veut dire que la liste
        // affichée est en retard (une proposition faite depuis un autre onglet).
        await load();
        return;
      }
      addToast(t.submitted, 'success');
      setTitle('');
      setArtistUrl('');
      setLicence(false);
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch {
      addToast(t.errorGeneric, 'error');
      // La réponse n'est pas arrivée, ce qui ne veut pas dire que la
      // proposition n'a pas été enregistrée : on relit la liste, sans quoi
      // l'artiste renverrait la même œuvre et consommerait une place de plus
      // dans sa file d'attente (cf. `utils/tcg/reloadAfterMutation.ts`).
      await load();
    } finally {
      setBusy(false);
    }
  }, [
    adminFetch,
    addToast,
    artistName,
    artistUrl,
    data?.maxPending,
    errorText,
    licence,
    load,
    t,
    title,
  ]);

  const withdraw = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        await adminFetchJson(
          `/api/player/tcg/fanart?id=${encodeURIComponent(id)}`,
          { method: 'DELETE' }
        );
        addToast(t.withdrawn, 'success');
        await load();
      } catch {
        addToast(t.errorGeneric, 'error');
        // Refus (déjà relue par le staff) ou réponse perdue après le retrait :
        // dans les deux cas la liste affichée est fausse, on la relit.
        await load();
      } finally {
        setBusy(false);
      }
    },
    [adminFetchJson, addToast, load, t]
  );

  const statusLabel: Record<Submission['status'], string> = {
    pending: t.statusPending,
    approved: t.statusApproved,
    rejected: t.statusRejected,
    revoked: t.statusRevoked,
  };

  const input =
    'mt-1 w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-purple-400 focus:outline-none';
  const label = 'block text-sm font-medium text-gray-200';

  const canSubmit =
    !busy &&
    licence &&
    title.trim().length >= 2 &&
    artistName.trim().length >= 2 &&
    (data?.pending ?? 0) < (data?.maxPending ?? 3);

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-6 ${className ?? ''}`}
      aria-labelledby="fanart-title"
    >
      <h2 id="fanart-title" className="text-lg font-semibold">
        {t.panelTitle}
      </h2>
      <p className="mt-1 max-w-prose text-sm text-gray-400">{t.panelIntro}</p>
      <Link
        href="/tcg/fan-art"
        className="mt-2 inline-block text-sm text-purple-200 underline underline-offset-2 hover:text-white"
      >
        {t.panelSeeCredits}
      </Link>

      {state === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-300">
          {t.loadError}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="fanart-image" className={label}>
            {t.labelImage}
          </label>
          <input
            id="fanart-image"
            ref={fileRef}
            type="file"
            accept={FANART_ACCEPT}
            aria-describedby="fanart-image-hint"
            // Refus DÈS LE CHOIX, pas au clic sur « Proposer » après avoir rempli
            // le formulaire : le fichier est vidé pour qu'on en choisisse un autre.
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const refused = checkFanartFile(file);
              if (refused) {
                addToast(errorText(refused, data?.maxPending ?? 3), 'error');
                e.target.value = '';
              }
            }}
            className={`${input} file:mr-3 file:rounded-md file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-white`}
          />
          <p id="fanart-image-hint" className="mt-1 text-xs text-gray-400">
            {format(t.hintImage, { max: FANART_MAX_MIB })}
          </p>
        </div>
        <div>
          <label htmlFor="fanart-title-input" className={label}>
            {t.labelTitle}
          </label>
          <input
            id="fanart-title-input"
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={FANART_LIMITS.title}
          />
        </div>
        <div>
          <label htmlFor="fanart-artist" className={label}>
            {t.labelArtistName}
          </label>
          <input
            id="fanart-artist"
            className={input}
            value={artistName}
            onChange={(e) => setArtistName(e.target.value)}
            maxLength={FANART_LIMITS.artistName}
            aria-describedby="fanart-artist-hint"
          />
          <p id="fanart-artist-hint" className="mt-1 text-xs text-gray-400">
            {t.hintArtistName}
          </p>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="fanart-url" className={label}>
            {t.labelArtistUrl}
          </label>
          <input
            id="fanart-url"
            type="url"
            className={input}
            value={artistUrl}
            onChange={(e) => setArtistUrl(e.target.value)}
            maxLength={FANART_LIMITS.artistUrl}
          />
        </div>
      </div>

      <label className="mt-4 flex min-h-11 items-start gap-3 text-sm text-gray-200">
        <input
          type="checkbox"
          className="mt-1"
          checked={licence}
          onChange={(e) => setLicence(e.target.checked)}
        />
        <span>{t.labelLicence}</span>
      </label>

      <button
        type="button"
        onClick={() => void submit()}
        disabled={!canSubmit}
        className="mt-4 min-h-11 rounded-lg bg-purple-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? t.submitting : t.submit}
      </button>
      {data && data.pending >= data.maxPending && (
        <p className="mt-2 text-xs text-amber-200">
          {format(t.errorTooManyPending, { max: data.maxPending })}
        </p>
      )}

      <h3 className="mt-8 text-sm font-semibold text-white">{t.mineTitle}</h3>
      {!data || data.submissions.length === 0 ? (
        <p className="mt-2 text-sm text-gray-400">{t.mineEmpty}</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {data.submissions.map((submission) => (
            <li
              key={submission.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/30 p-3 text-sm"
            >
              <span className="text-gray-200">
                {submission.title}
                <span className="ml-2 text-xs text-gray-400">
                  {statusLabel[submission.status]}
                </span>
                {submission.status === 'rejected' && submission.reviewNotes && (
                  <span className="mt-1 block text-xs text-gray-400">
                    {format(t.rejectedReason, {
                      reason: submission.reviewNotes,
                    })}
                  </span>
                )}
              </span>
              {submission.status === 'pending' && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void withdraw(submission.id)}
                  className="min-h-11 rounded-lg border border-white/20 px-3 py-1.5 text-xs text-gray-200 hover:border-white/40 disabled:opacity-50"
                >
                  {t.withdraw}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
