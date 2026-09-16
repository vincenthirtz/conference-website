// components/admin/onboarding/MintApiKeyModal.tsx
//
// Émettre une clé d'API POUR UN ESPACE NOMMÉ, depuis le hub d'onboarding.
//
// POURQUOI ICI PLUTÔT QUE SUR /admin/api-tokens. Cet écran-là émet pour
// l'espace ACTIF du sélecteur, qu'il ne nomme nulle part : une clé destinée à
// un partenaire s'est retrouvée rattachée à l'espace historique, et comme le
// token est autoritaire sur l'espace, elle servait des données valides et
// fausses. Ici la cible est dans le titre et dans l'URL appelée — elle ne peut
// plus être devinée de travers.
//
// Le clair n'apparaît qu'une fois, dans `ApiTokenRevealModal` : ce composant ne
// le garde pas, il le passe et l'oublie.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import { ALL_SCOPES } from '@/utils/apiScopes';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';

type Props = {
  tenantId: string;
  tenantName: string;
  onClose: () => void;
  /** Reçoit le clair, une seule fois. */
  onMinted: (token: string) => void;
};

/**
 * 90 jours par défaut, et pas « jamais ».
 *
 * Une clé sans échéance survit à la raison qui l'a fait naître — un tournoi, un
 * partenariat, un prestataire. L'échéance se prolonge ; une clé oubliée ne se
 * rattrape pas.
 */
const DEFAULT_EXPIRY_DAYS = 90;

export default function MintApiKeyModal({
  tenantId,
  tenantName,
  onClose,
  onMinted,
}: Props) {
  const trapRef = useFocusTrap<HTMLDivElement>();
  const t = useAdminT(nsAdminOnboarding);
  const { adminFetchJson } = useAdminFetch();

  const sortedScopes = useMemo(() => [...ALL_SCOPES].sort(), []);

  const [name, setName] = useState(tenantName);
  // La lecture seule couvre les overlays, qui sont l'usage courant. L'écriture
  // se demande, elle ne se coche pas par défaut.
  const [scopes, setScopes] = useState<string[]>(() =>
    sortedScopes.filter((s) => s.endsWith(':read'))
  );
  const [comp, setComp] = useState(false);
  const [compNote, setCompNote] = useState('');
  const [expiryDays, setExpiryDays] = useState<string>(
    String(DEFAULT_EXPIRY_DAYS)
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const toggleScope = useCallback((scope: string) => {
    setScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (scopes.length === 0) {
        setError(t.mintKeyErrorNoScope);
        return;
      }

      const days = Number.parseInt(expiryDays, 10);
      setBusy(true);
      try {
        const res = await adminFetchJson<{ token: string }>(
          `/api/admin/tenants/${tenantId}/api-tokens`,
          {
            method: 'POST',
            body: JSON.stringify({
              name: name.trim() || tenantName,
              scopes,
              comp,
              ...(comp && compNote.trim()
                ? { comp_note: compNote.trim() }
                : {}),
              expires_in_days: Number.isFinite(days) && days > 0 ? days : null,
            }),
          }
        );
        onMinted(res.token);
      } catch (err) {
        setError(err instanceof Error ? err.message : t.mintKeyError);
      } finally {
        setBusy(false);
      }
    },
    [
      adminFetchJson,
      compNote,
      comp,
      expiryDays,
      name,
      onMinted,
      scopes,
      t.mintKeyError,
      t.mintKeyErrorNoScope,
      tenantId,
      tenantName,
    ]
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mint-key-title"
    >
      <div
        ref={trapRef}
        className="w-full max-w-lg rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
      >
        <h2 id="mint-key-title" className="text-lg font-semibold text-white">
          {format(t.mintKeyTitle, { tenant: tenantName })}
        </h2>
        <p className="mt-1 text-sm text-neutral-400">{t.mintKeyIntro}</p>

        <AlertBanner message={error} variant="error" className="mt-3" />

        <form onSubmit={submit} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="mint-key-name"
              className="mb-1 block text-xs font-medium text-neutral-400"
            >
              {t.mintKeyNameLabel}
            </label>
            <input
              id="mint-key-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>

          <fieldset>
            <legend className="mb-1 text-xs font-medium text-neutral-400">
              {t.mintKeyScopesLabel}
            </legend>
            <div className="grid grid-cols-2 gap-1.5">
              {sortedScopes.map((scope) => (
                <label
                  key={scope}
                  className="flex items-center gap-2 text-sm text-neutral-200"
                >
                  <input
                    type="checkbox"
                    checked={scopes.includes(scope)}
                    onChange={() => toggleScope(scope)}
                    className="rounded border-neutral-600 bg-neutral-900"
                  />
                  <code className="text-xs">{scope}</code>
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label
              htmlFor="mint-key-expiry"
              className="mb-1 block text-xs font-medium text-neutral-400"
            >
              {t.mintKeyExpiryLabel}
            </label>
            <input
              id="mint-key-expiry"
              type="number"
              min={1}
              max={3650}
              value={expiryDays}
              onChange={(e) => setExpiryDays(e.target.value)}
              className="w-32 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
            <p className="mt-1 text-xs text-neutral-500">
              {t.mintKeyExpiryHint}
            </p>
          </div>

          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3">
            <label className="flex items-start gap-2 text-sm text-amber-100">
              <input
                type="checkbox"
                checked={comp}
                onChange={(e) => setComp(e.target.checked)}
                className="mt-1 rounded border-neutral-600 bg-neutral-900"
              />
              <span>
                <span className="font-medium">{t.mintKeyCompLabel}</span>
                <span className="mt-0.5 block text-xs text-amber-200/70">
                  {t.mintKeyCompHint}
                </span>
              </span>
            </label>
            {comp && (
              <input
                value={compNote}
                onChange={(e) => setCompNote(e.target.value)}
                placeholder={t.mintKeyCompNotePlaceholder}
                maxLength={500}
                className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:bg-neutral-800"
            >
              {t.mintKeyCancel}
            </button>
            <button
              type="submit"
              disabled={busy}
              data-testid="mint-key-submit"
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
            >
              {busy
                ? t.mintKeyBusy
                : format(t.mintKeySubmit, { tenant: tenantName })}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
