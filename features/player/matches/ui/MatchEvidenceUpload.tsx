// features/player/matches/ui/MatchEvidenceUpload.tsx — joindre une capture
// d'écran au match depuis l'étape « Score » (lot P4). Pendant web du dépôt de
// preuve du bot (POST /api/player/matches/{matchId}/evidence).
//
// Le type et la taille sont vérifiés ICI pour épargner un envoi de 4 Mo voué
// au refus, mais c'est le serveur qui décide (octets, pas type déclaré).

import { useRef, useState } from 'react';
import type nsPlayerMatch from '@/lib/i18n/locales/fr/playerMatch';
import { format } from '@/lib/i18n/useT';
import { useToast } from '@/components/Toast';
import { ApiHttpError } from '@/utils/http/authedRequest';
import { logger } from '@/utils/logger';
import { matchesClient } from '../client';
import { evidenceErrorMessage } from '../disputeView';
import { PLAYER_EVIDENCE_MAX_BYTES } from '../schemas';

type T = typeof nsPlayerMatch.fr;

const ACCEPTED = ['image/png', 'image/jpeg', 'image/webp'];

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

export default function MatchEvidenceUpload({
  matchId,
  t,
}: {
  matchId: string;
  t: T;
}) {
  const { addToast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(0);

  async function onFile(file: File) {
    if (!ACCEPTED.includes(file.type)) {
      addToast(t.evidenceErrType, 'error');
      return;
    }
    if (file.size > PLAYER_EVIDENCE_MAX_BYTES) {
      addToast(t.evidenceErrTooLarge, 'error');
      return;
    }
    setBusy(true);
    try {
      const file_base64 = await readAsDataUrl(file);
      await matchesClient.attachEvidence(matchId, {
        file_base64,
        filename: file.name.slice(0, 255) || undefined,
      });
      setSent((n) => n + 1);
      addToast(t.evidenceSuccess, 'success');
    } catch (err) {
      if (err instanceof ApiHttpError) {
        addToast(evidenceErrorMessage(err.status, err.code, t), 'error');
      } else {
        logger.warn('[player/match] evidence upload failed:', err);
        addToast(t.evidenceErrGeneric, 'error');
      }
    } finally {
      setBusy(false);
      // Le même fichier doit pouvoir être renvoyé après un échec.
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="mt-4 border-t border-[var(--line,rgba(194,196,201,.12))] pt-3">
      <p className="font-semibold text-[var(--t1,#f4edf7)]">
        {t.evidenceTitle}
      </p>
      <p className="mt-1 text-xs">{t.evidenceHelp}</p>
      <label
        className={`mt-2 inline-flex cursor-pointer items-center rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/10 ${
          busy ? 'pointer-events-none opacity-60' : ''
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="sr-only"
          disabled={busy}
          data-testid="match-evidence-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void onFile(file);
          }}
        />
        {busy ? t.evidenceUploading : t.evidenceCta}
      </label>
      {sent > 0 && (
        <p className="mt-2 text-xs text-emerald-200" aria-live="polite">
          {format(t.evidenceSent, { n: sent })}
        </p>
      )}
    </div>
  );
}
