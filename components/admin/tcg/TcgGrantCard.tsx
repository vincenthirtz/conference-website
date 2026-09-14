// components/admin/tcg/TcgGrantCard.tsx
//
// « Ajuster un solde » : la correction manuelle et tracée d'un porte-monnaie
// TCG, via `POST /api/admin/tcg/grant` (écriture `admin_grant` au registre).
//
// CE N'EST PAS UNE BOUTIQUE. Jusqu'ici un solde faux ne se corrigeait qu'à la
// main en base (docs/TCG.md §7). Cette carte répare ; elle ne distribue pas. La
// monnaie se gagne et ne s'achète pas — d'où un motif OBLIGATOIRE, une
// confirmation qui répète l'intention exacte, et aucun vocabulaire d'achat.
//
// LA CLÉ D'IDEMPOTENCE SUIT L'INTENTION, PAS LE CLIC. Une clé par tentative ;
// relancer LE MÊME envoi (même compte, même montant, même motif) après une
// coupure réseau ou un 5xx la réutilise, et le serveur rejoue la première
// réponse au lieu de créditer deux fois (`replayed: true`, dit à l'écran).
// Toucher à un champ en fait une autre intention, donc une autre clé. La règle
// précise — quand garder, quand renouveler — vit, testée, dans
// `tcgGrantForm.ts` ; ce composant ne fait que l'appliquer. D'où
// `autoRegenerateOnSuccess: false` : c'est l'intention qui pilote la clé, pas
// le hook.
//
// LA CLÉ VOYAGE DEUX FOIS, dans le corps (`idempotencyKey`, exigé par le
// contrat) et dans l'en-tête `Idempotency-Key` que pose le hook : les deux
// portent la même valeur, lue au moment de l'envoi.
//
// LES LIBELLÉS VIENNENT DE `useAdminT`, et non d'une prop comme pour les cartes
// voisines : la carte et son sélecteur en consomment une soixantaine, et les
// recopier dans la page hôte l'aurait alourdie d'autant sans rien découpler.

import { type FormEvent, useId, useRef, useState } from 'react';

import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import WidgetCard from '@/components/admin/dashboard/WidgetCard';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsAdminTcgGrant from '@/lib/i18n/locales/admin-fr/adminTcgGrant';
import { logger } from '../../../utils/logger';
import TcgPlayerPicker, { type PickedUser } from './TcgPlayerPicker';
import {
  GRANT_MAX_ABS_AMOUNT,
  GRANT_REASON_MAX,
  GRANT_REASON_MIN,
  type GrantErrorKind,
  type GrantFormErrors,
  adminUserLabel,
  classifyGrantError,
  grantErrorAvailableBalance,
  grantIntentSignature,
  normalizeGrantSuccess,
  parseGrantAmount,
  shouldKeepIdempotencyKey,
  validateGrantForm,
} from './tcgGrantForm';

const ROUTE = '/api/admin/tcg/grant';

type Labels = typeof nsAdminTcgGrant.fr;

type Outcome =
  | {
      kind: 'success';
      name: string;
      balance: number | null;
      replayed: boolean;
    }
  | { kind: 'error'; error: GrantErrorKind; available: number | null };

function fieldErrorText(
  field: keyof GrantFormErrors,
  errors: GrantFormErrors,
  t: Labels
): string | null {
  const code = errors[field];
  if (!code) return null;
  if (field === 'userId') {
    return code === 'invalid' ? t.errUserInvalid : t.errUserRequired;
  }
  if (field === 'amount') {
    switch (code) {
      case 'notInteger':
        return t.errAmountNotInteger;
      case 'zero':
        return t.errAmountZero;
      case 'tooLarge':
        return format(t.errAmountTooLarge, { max: GRANT_MAX_ABS_AMOUNT });
      default:
        return t.errAmountRequired;
    }
  }
  switch (code) {
    case 'tooShort':
      return format(t.errReasonTooShort, { min: GRANT_REASON_MIN });
    case 'tooLong':
      return format(t.errReasonTooLong, { max: GRANT_REASON_MAX });
    default:
      return t.errReasonRequired;
  }
}

/** Message d'un échec, par nature. Exhaustif : un cas oublié ne compile pas. */
function endpointErrorText(
  kind: GrantErrorKind,
  available: string | null,
  t: Labels
): string {
  switch (kind) {
    case 'invalidBody':
      return t.errInvalidBody;
    case 'userNotFound':
      return t.errUserNotFound;
    case 'insufficientBalance':
      return available === null
        ? t.errInsufficientBalance
        : format(t.errInsufficientBalanceWithBalance, { balance: available });
    case 'balanceChanged':
      return t.errBalanceChanged;
    case 'forbidden':
      return t.errForbidden;
    case 'rateLimited':
      return t.errRateLimited;
    case 'queued':
      return t.errQueued;
    case 'network':
      return t.errNetwork;
    case 'unknown':
      return t.errUnknown;
  }
}

const INPUT_BASE =
  'w-full rounded-lg border bg-white/5 px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400';

export default function TcgGrantCard() {
  const t = useAdminT(nsAdminTcgGrant);
  const locale = useLocale();
  const mutation = useIdempotentMutation({ autoRegenerateOnSuccess: false });
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const baseId = useId();
  const ids = {
    user: `${baseId}-user`,
    userError: `${baseId}-user-error`,
    amount: `${baseId}-amount`,
    amountHint: `${baseId}-amount-hint`,
    amountError: `${baseId}-amount-error`,
    reason: `${baseId}-reason`,
    reasonHint: `${baseId}-reason-hint`,
    reasonError: `${baseId}-reason-error`,
  };

  const [user, setUser] = useState<PickedUser | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // Les erreurs ne s'affichent qu'après une première tentative : rougir un
  // champ qu'on n'a pas encore eu le temps de remplir est du bruit.
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // Empreinte de l'intention dont on GARDE la clé (issue incertaine). `null` =
  // aucune : le prochain envoi, quel qu'il soit, tire une clé neuve.
  const keptIntentRef = useRef<string | null>(null);

  const validation = validateGrantForm({
    userId: user?.id ?? null,
    amount,
    reason,
  });
  const errors: GrantFormErrors =
    showErrors && !validation.ok ? validation.errors : {};
  const userError = fieldErrorText('userId', errors, t);
  const amountError = fieldErrorText('amount', errors, t);
  const reasonError = fieldErrorText('reason', errors, t);

  const parsedAmount = parseGrantAmount(amount);
  const nf = (n: number) => n.toLocaleString(locale);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    if (!validation.ok) {
      setShowErrors(true);
      // Le focus va au PREMIER champ fautif, dans l'ordre de lecture : sinon un
      // clavier ou un lecteur d'écran ne sait pas ce qui a bloqué l'envoi.
      const first = validation.errors.userId
        ? ids.user
        : validation.errors.amount
          ? ids.amount
          : ids.reason;
      document.getElementById(first)?.focus();
      return;
    }

    const value = validation.value;
    const name = user ? adminUserLabel(user) : value.userId;
    const abs = nf(Math.abs(value.amount));
    const isDebit = value.amount < 0;

    // La confirmation RÉPÈTE l'intention exacte : on ne valide pas « ajuster un
    // solde », on valide « +50 pièces à Marie, motif … ».
    const ok = await confirm({
      title: format(isDebit ? t.confirmTitleDebit : t.confirmTitleCredit, {
        amount: abs,
      }),
      subtitle: format(
        isDebit ? t.confirmSummaryDebit : t.confirmSummaryCredit,
        { amount: abs, name, reason: value.reason }
      ),
      body: (
        <div className="space-y-2 text-xs text-gray-400">
          <p className="break-all font-mono text-[11px] text-gray-500">
            {format(t.confirmAccount, { id: value.userId })}
          </p>
          <p>{t.confirmLedgerNote}</p>
        </div>
      ),
      // Un retrait est le geste qui peut faire du tort : même rouge que les
      // suppressions. Un crédit reste un geste engageant, donc ambre.
      variant: isDebit ? 'danger' : 'warning',
      confirmLabel: isDebit ? t.confirmDebit : t.confirmCredit,
    });
    if (!ok) return;

    const intent = grantIntentSignature(value);
    const idempotencyKey =
      keptIntentRef.current === intent ? mutation.key : mutation.regenerate();
    keptIntentRef.current = intent;

    setBusy(true);
    setOutcome(null);
    try {
      const raw = await mutation.mutateJson<unknown>(ROUTE, {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({
          userId: value.userId,
          amount: value.amount,
          reason: value.reason,
          idempotencyKey,
        }),
      });
      const result = normalizeGrantSuccess(raw);
      // L'intention est close : la suivante, même identique, est un NOUVEL
      // ajustement voulu, et doit porter une nouvelle clé.
      keptIntentRef.current = null;
      mutation.regenerate();
      setOutcome({
        kind: 'success',
        name,
        balance: result.balance,
        replayed: result.replayed,
      });
      // On vide le montant et le motif, pas le compte : enchaîner deux
      // corrections sur la même joueuse est courant, et un formulaire resté
      // plein est la meilleure façon de renvoyer deux fois la même.
      setAmount('');
      setReason('');
      setShowErrors(false);
      addToast(t.toastApplied, 'success');
    } catch (err) {
      const kind = classifyGrantError(err);
      if (!shouldKeepIdempotencyKey(kind)) keptIntentRef.current = null;
      // Les refus du contrat sont des issues normales ; le reste mérite une
      // trace pour qui cherchera pourquoi un solde n'a pas bougé.
      if (shouldKeepIdempotencyKey(kind) || kind === 'forbidden') {
        logger.error('[admin/tcg/grant] submit error:', err);
      }
      setOutcome({
        kind: 'error',
        error: kind,
        available: grantErrorAvailableBalance(err),
      });
    } finally {
      setBusy(false);
    }
  };

  const outcomeText =
    outcome === null
      ? ''
      : outcome.kind === 'error'
        ? endpointErrorText(
            outcome.error,
            outcome.available === null ? null : nf(outcome.available),
            t
          )
        : outcome.balance === null
          ? format(
              outcome.replayed
                ? t.resultReplayedNoBalance
                : t.resultAppliedNoBalance,
              { name: outcome.name }
            )
          : format(outcome.replayed ? t.resultReplayed : t.resultApplied, {
              name: outcome.name,
              balance: nf(outcome.balance),
            });

  return (
    <>
      <WidgetCard title={t.heading}>
        <p className="mb-4 max-w-prose text-xs text-gray-400">{t.subtitle}</p>

        <form noValidate onSubmit={(event) => void onSubmit(event)}>
          {/* `disabled` sur le fieldset gèle TOUS les champs pendant l'envoi :
              modifier le motif en vol ferait afficher un résultat qui ne
              correspond plus à ce qu'on lit. */}
          <fieldset disabled={busy} aria-busy={busy} className="space-y-4">
            <div>
              <label
                htmlFor={ids.user}
                className="mb-1 block text-xs font-medium text-gray-300"
              >
                {t.playerLabel}
              </label>
              <TcgPlayerPicker
                labels={t}
                value={user}
                onChange={(next) => {
                  setUser(next);
                  setOutcome(null);
                }}
                inputId={ids.user}
                errorId={ids.userError}
                invalid={Boolean(userError)}
              />
              {userError && (
                <p id={ids.userError} className="mt-1 text-xs text-red-300">
                  {userError}
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
              <div>
                <label
                  htmlFor={ids.amount}
                  className="mb-1 block text-xs font-medium text-gray-300"
                >
                  {t.amountLabel}
                </label>
                <input
                  id={ids.amount}
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={-GRANT_MAX_ABS_AMOUNT}
                  max={GRANT_MAX_ABS_AMOUNT}
                  value={amount}
                  onChange={(event) => {
                    setAmount(event.target.value);
                    setOutcome(null);
                  }}
                  aria-invalid={Boolean(amountError) || undefined}
                  aria-describedby={[
                    ids.amountHint,
                    amountError ? ids.amountError : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  className={`${INPUT_BASE} tabular-nums ${
                    amountError ? 'border-red-500/60' : 'border-white/10'
                  }`}
                />
                <p
                  id={ids.amountHint}
                  className="mt-1 text-[11px] text-gray-500"
                >
                  {format(t.amountHint, { max: nf(GRANT_MAX_ABS_AMOUNT) })}
                </p>
                {/* Le sens se LIT en toutes lettres : un signe moins oublié ou
                    en trop ne doit pas passer inaperçu jusqu'à la confirmation. */}
                {parsedAmount.ok && (
                  <p
                    className={`mt-1 text-xs font-medium ${
                      parsedAmount.amount < 0
                        ? 'text-rose-300'
                        : 'text-emerald-300'
                    }`}
                  >
                    {format(
                      parsedAmount.amount < 0
                        ? t.amountPreviewDebit
                        : t.amountPreviewCredit,
                      { amount: nf(Math.abs(parsedAmount.amount)) }
                    )}
                  </p>
                )}
                {amountError && (
                  <p id={ids.amountError} className="mt-1 text-xs text-red-300">
                    {amountError}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor={ids.reason}
                  className="mb-1 block text-xs font-medium text-gray-300"
                >
                  {t.reasonLabel}
                </label>
                <textarea
                  id={ids.reason}
                  rows={3}
                  required
                  maxLength={GRANT_REASON_MAX}
                  value={reason}
                  placeholder={t.reasonPlaceholder}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setOutcome(null);
                  }}
                  aria-invalid={Boolean(reasonError) || undefined}
                  aria-describedby={[
                    ids.reasonHint,
                    reasonError ? ids.reasonError : null,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  className={`${INPUT_BASE} resize-y ${
                    reasonError ? 'border-red-500/60' : 'border-white/10'
                  }`}
                />
                <div className="mt-1 flex items-start justify-between gap-3">
                  <p id={ids.reasonHint} className="text-[11px] text-gray-500">
                    {t.reasonHint}
                  </p>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-[11px] tabular-nums text-gray-500"
                  >
                    {format(t.reasonCounter, {
                      count: reason.trim().length,
                      max: GRANT_REASON_MAX,
                    })}
                  </span>
                </div>
                {reasonError && (
                  <p id={ids.reasonError} className="mt-1 text-xs text-red-300">
                    {reasonError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="submit"
                className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:opacity-50"
              >
                {busy ? t.submitting : t.submit}
              </button>
            </div>
          </fieldset>
        </form>

        {/* Région live TOUJOURS montée : elle doit exister avant de se remplir
            pour que le résultat soit annoncé. Le solde résultant y reste
            affiché — un toast disparaît, un solde corrigé se vérifie. */}
        <div
          role="status"
          aria-live="polite"
          className={
            outcome === null
              ? ''
              : outcome.kind === 'success'
                ? 'mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200'
                : shouldKeepIdempotencyKey(outcome.error)
                  ? 'mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200'
                  : 'mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200'
          }
        >
          {outcomeText}
        </div>
      </WidgetCard>
      {dialog}
    </>
  );
}
