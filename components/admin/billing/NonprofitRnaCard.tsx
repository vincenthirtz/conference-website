// components/admin/billing/NonprofitRnaCard.tsx
//
// « Vous êtes une association ? Donnez votre numéro RNA, la Découverte est
// offerte. » — la seconde porte de la gratuité du palier d'entrée.
//
// POURQUOI UNE CARTE À PART, et pas une ligne de plus dans l'écran de
// facturation. Cet écran parle de ce qu'on doit ; celle-ci parle de ce qu'on
// ne doit PAS. C'est aussi la seule action de la page qui peut échouer sans
// que ce soit un problème — un numéro valide absent de l'Annuaire des
// Entreprises n'est pas un refus, c'est une attente, et il faut de la place
// pour le dire sans alarmer.
//
// LES TROIS ISSUES, et pourquoi elles ne se rendent pas pareil :
//   - vérifié     : la gratuité est acquise, tout de suite ;
//   - en attente  : le numéro est enregistré, le staff regarde. Ce n'est PAS
//     une erreur, et le ton ne doit pas le laisser croire — beaucoup de petites
//     associations ont un RNA valide sans SIREN, donc absent de l'annuaire ;
//   - refusé      : l'annuaire dit que le numéro désigne autre chose.
//
// Extrait de `pages/admin/billing.tsx` dès l'écriture : cet écran est à 770
// lignes pour un plafond à 800 (`tests/unit/adminFileSizeGuard.test.ts`), et y
// poser la carte l'aurait fait entrer dans les god-components le jour même.

import { useState } from 'react';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminBilling from '@/lib/i18n/locales/admin-fr/adminBilling';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCardPadded,
  rubanErr,
  rubanFormInput,
  rubanInset,
  rubanWarn,
} from '@/features/admin/_shared/ui/ruban';

type Dict = typeof nsAdminBilling.fr;

type PendingReason = 'not_in_directory' | 'inactive' | 'directory_unavailable';

type PutResponse = {
  rna?: string;
  verified?: boolean;
  orgName?: string | null;
  pendingReason?: PendingReason;
  removed?: boolean;
  error?: string;
  code?: string;
};

type Props = {
  tenantId: string;
  /** Numéro déjà déclaré, s'il y en a un. */
  rna: string | null;
  /** Provenance de l'estampille : seul `rna` veut dire « grâce à ce numéro ». */
  verifiedVia: string | null;
  orgName: string | null;
  /** Rechargement de l'écran de facturation après une écriture. */
  onChanged: () => void;
};

/** Message d'attente, par raison. Table explicite, pas de clé construite. */
const PENDING_KEY: Record<PendingReason, keyof Dict> = {
  not_in_directory: 'rnaPendingNotInDirectory',
  inactive: 'rnaPendingInactive',
  directory_unavailable: 'rnaPendingDirectoryDown',
};

/** Code serveur → message. Un code inconnu retombe sur le texte du serveur. */
const ERROR_KEY: Record<string, keyof Dict> = {
  RNA_INVALID: 'rnaErrorInvalid',
  RNA_ALREADY_USED: 'rnaErrorAlreadyUsed',
  RNA_NOT_ASSOCIATION: 'rnaErrorNotAssociation',
};

export default function NonprofitRnaCard({
  tenantId,
  rna,
  verifiedVia,
  orgName,
  onChanged,
}: Props) {
  const t = useAdminT(nsAdminBilling);
  const { adminFetchJson } = useAdminFetch();

  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingReason | null>(null);

  const verifiedByRna = verifiedVia === 'rna';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      const json = await adminFetchJson<PutResponse>(
        `/api/admin/tenants/${tenantId}/nonprofit-rna`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rna: input }),
        }
      );
      if (json?.verified === false && json.pendingReason) {
        setPending(json.pendingReason);
      }
      setInput('');
      onChanged();
    } catch (err) {
      const code = (err as { code?: string })?.code;
      const key = code ? ERROR_KEY[code] : undefined;
      setError(
        key
          ? (t[key] as string)
          : ((err as Error)?.message ?? (t.rnaErrorGeneric as string))
      );
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setPending(null);
    try {
      await adminFetchJson(`/api/admin/tenants/${tenantId}/nonprofit-rna`, {
        method: 'DELETE',
      });
      onChanged();
    } catch (err) {
      setError((err as Error)?.message ?? (t.rnaErrorGeneric as string));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`space-y-4 ${rubanCardPadded}`}>
      <div>
        <h2 className="text-lg font-semibold">{t.rnaTitle}</h2>
        <p className="mt-1 text-sm text-neutral-400">{t.rnaIntro}</p>
      </div>

      {rna ? (
        <div className="space-y-3">
          <div className={`p-3 ${rubanInset}`}>
            <p className="font-mono text-sm text-neutral-100">{rna}</p>
            <p className="mt-1 text-xs text-neutral-400">
              {verifiedByRna
                ? `${t.rnaVerified}${orgName ? ` — ${orgName}` : ''}`
                : t.rnaAwaitingStaff}
            </p>
          </div>
          <AdminButton
            variant="danger"
            size="sm"
            onClick={remove}
            disabled={busy}
          >
            {t.rnaRemove}
          </AdminButton>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="W751074179"
            aria-label={t.rnaFieldLabel}
            className={`${rubanFormInput} font-mono sm:max-w-xs`}
          />
          <AdminButton
            type="submit"
            variant="secondary"
            disabled={busy || input.trim().length === 0}
          >
            {busy ? t.rnaChecking : t.rnaSubmit}
          </AdminButton>
        </form>
      )}

      {pending && (
        <p className={`px-3 py-2 text-sm ${rubanWarn}`}>
          {t[PENDING_KEY[pending]] as string}
        </p>
      )}
      {error && (
        <p role="alert" className={`px-3 py-2 text-sm ${rubanErr}`}>
          {error}
        </p>
      )}

      <p className="text-xs text-neutral-500">{t.rnaScopeNote}</p>
    </section>
  );
}
