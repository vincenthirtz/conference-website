// components/admin/tenants/TenantBotSecretsPanel.tsx
//
// Les secrets bot d'un espace : régénérer, et gérer la fenêtre pendant laquelle
// l'ancienne clé reste acceptée.
//
// La rotation ne coupe plus le bot en place (T8) : l'empreinte courante devient
// la « précédente » et vaut encore 48 h, le temps d'aller reposer la nouvelle
// valeur sur le serveur. L'écran doit le DIRE — sinon on croit à une coupure et
// on redéploie en catastrophe — et offrir la révocation immédiate, qui est le
// geste d'une fuite, pas une habitude.
//
// Extrait de `pages/admin/tenants/[id].tsx`, qui approchait son plafond de
// taille : la fiche gagne ses panneaux (vue d'ensemble, historique) sans que
// chaque ajout ne se paie en lignes dans le même fichier.

import { useState } from 'react';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useToast } from '@/components/Toast';
import BotSecretsRevealModal from '@/components/admin/BotSecretsRevealModal';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminTenantDetail from '@/lib/i18n/locales/admin-fr/adminTenantDetail';

type RotateSecretsResponse = {
  tenantId: string;
  botApiKey: string;
  botWebhookSecret: string;
  rotatedAt: string;
  /** null quand l'espace n'avait pas encore de clé : rien à faire cohabiter. */
  previousKeyValidUntil?: string | null;
};

export default function TenantBotSecretsPanel({
  tenantId,
}: {
  tenantId: string;
}) {
  const t = useAdminT(nsAdminTenantDetail);
  const { mutateJson } = useIdempotentMutation();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();

  const [rotating, setRotating] = useState(false);
  const [previousKeyUntil, setPreviousKeyUntil] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<{
    botApiKey: string;
    botWebhookSecret: string;
  } | null>(null);

  const handleRotate = async () => {
    const ok = await confirm({
      title: t.confirmRotateTitle,
      subtitle: t.confirmRotateSubtitle,
      variant: 'danger',
      confirmLabel: t.rotate,
    });
    if (!ok) return;
    setRotating(true);
    try {
      const resp = await mutateJson<RotateSecretsResponse>(
        `/api/admin/tenants/${tenantId}/rotate-secrets`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      // Montrées une seule fois : jamais stockées, jamais journalisées.
      setRevealed({
        botApiKey: resp.botApiKey,
        botWebhookSecret: resp.botWebhookSecret,
      });
      setPreviousKeyUntil(resp.previousKeyValidUntil ?? null);
      addToast(t.toastRotated, 'success');
    } catch (err) {
      addToast((err as Error)?.message || t.errorRotate, 'error');
    } finally {
      setRotating(false);
    }
  };

  /** Fuite de clé : on ne veut pas attendre la fin de la fenêtre de grâce. */
  const handleRevokePrevious = async () => {
    const ok = await confirm({
      title: t.confirmRevokePrevTitle,
      subtitle: t.confirmRevokePrevSubtitle,
      variant: 'danger',
      confirmLabel: t.revokePrev,
    });
    if (!ok) return;
    try {
      await mutateJson(`/api/admin/tenants/${tenantId}/rotate-secrets`, {
        method: 'DELETE',
      });
      setPreviousKeyUntil(null);
      addToast(t.toastPrevRevoked, 'success');
    } catch (err) {
      addToast((err as Error)?.message || t.errorRevokePrev, 'error');
    }
  };

  return (
    <>
      <section
        className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6 sm:p-8"
        data-testid="tenant-bot-secrets-section"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-900/30 flex items-center justify-center text-amber-300 flex-shrink-0">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {t.botSecretsHeading}
            </h2>
            <p className="mt-1 text-sm text-neutral-400">{t.botSecretsDesc}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleRotate}
            disabled={rotating}
            className="px-4 py-2.5 rounded-xl border border-amber-500/50 text-amber-200 hover:border-amber-400 hover:bg-amber-500/10 text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            data-testid="tenant-rotate-secrets-btn"
          >
            {rotating ? t.rotating : t.rotateBtn}
          </button>
          {previousKeyUntil && (
            <span className="flex flex-wrap items-center gap-2 text-xs text-neutral-300">
              {format(t.previousKeyValid, {
                date: new Date(previousKeyUntil).toLocaleString('fr-FR', {
                  dateStyle: 'short',
                  timeStyle: 'short',
                }),
              })}
              <button
                type="button"
                onClick={handleRevokePrevious}
                className="underline hover:text-white"
                data-testid="tenant-revoke-prev-key-btn"
              >
                {t.revokePrev}
              </button>
            </span>
          )}
        </div>
      </section>

      {revealed && (
        <BotSecretsRevealModal
          botApiKey={revealed.botApiKey}
          botWebhookSecret={revealed.botWebhookSecret}
          onClose={() => setRevealed(null)}
        />
      )}
      {dialog}
    </>
  );
}
