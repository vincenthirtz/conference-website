// Single-shot reveal card used by `/onboard/secrets/[token]` (and reusable
// elsewhere). Renders two copy-to-clipboard inputs + a .env snippet.
//
// Inspired by `components/admin/BotSecretsRevealModal.tsx` but extracted so
// the public-facing reveal page can embed it inline (no modal chrome).

import { useCallback, useState } from 'react';
import { useToast } from '@/components/Toast';
import { useT, format } from '@/lib/i18n/useT';
import nsSecretRevealCard from '@/lib/i18n/locales/fr/secretRevealCard';

type Props = {
  botApiKey: string;
  botWebhookSecret: string;
  dotEnvSnippet?: string;
  tenantId?: string | null;
  tenantSlug?: string | null;
};

export default function SecretRevealCard({
  botApiKey,
  botWebhookSecret,
  dotEnvSnippet,
  tenantId,
  tenantSlug,
}: Props) {
  const { addToast } = useToast();
  const t = useT(nsSecretRevealCard);
  const [copiedKey, setCopiedKey] = useState<null | 'api' | 'webhook' | 'env'>(
    null
  );

  const copy = useCallback(
    async (value: string, which: 'api' | 'webhook' | 'env', label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopiedKey(which);
        addToast(format(t.copiedToast, { label }), 'success');
        window.setTimeout(
          () => setCopiedKey((c) => (c === which ? null : c)),
          1500
        );
      } catch {
        addToast(t.copyError, 'error');
      }
    },
    [addToast, t]
  );

  const fallbackEnv =
    dotEnvSnippet ??
    [
      '# Add to your docker-box bot service .env :',
      `BOT_API_KEY=${botApiKey}`,
      `BOT_WEBHOOK_SECRET=${botWebhookSecret}`,
      tenantId ? `TENANT_ID=${tenantId}` : null,
      tenantSlug ? `TENANT_SLUG=${tenantSlug}` : null,
    ]
      .filter(Boolean)
      .join('\n');

  return (
    <div className="rounded-2xl border border-amber-500/40 bg-neutral-900/80 p-6 shadow-2xl">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-amber-900/40 flex items-center justify-center text-amber-300 flex-shrink-0">
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-white">{t.title}</h2>
          <p className="mt-1 text-sm text-amber-200/90">{t.subtitle}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label
            htmlFor="bot-api-key-reveal"
            className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1"
          >
            BOT_API_KEY
          </label>
          <div className="flex gap-2">
            <input
              id="bot-api-key-reveal"
              type="text"
              readOnly
              value={botApiKey}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 px-3 py-2 rounded-lg bg-neutral-950/80 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono text-white"
              data-test="onboard-secret-api-key"
            />
            <button
              type="button"
              onClick={() => copy(botApiKey, 'api', 'BOT_API_KEY')}
              className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              {copiedKey === 'api' ? t.copied : t.copy}
            </button>
          </div>
        </div>

        <div>
          <label
            htmlFor="bot-webhook-secret-reveal"
            className="block text-xs font-medium uppercase tracking-wider text-neutral-400 mb-1"
          >
            BOT_WEBHOOK_SECRET
          </label>
          <div className="flex gap-2">
            <input
              id="bot-webhook-secret-reveal"
              type="text"
              readOnly
              value={botWebhookSecret}
              onFocus={(e) => e.currentTarget.select()}
              className="flex-1 px-3 py-2 rounded-lg bg-neutral-950/80 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono text-white"
              data-test="onboard-secret-webhook"
            />
            <button
              type="button"
              onClick={() =>
                copy(botWebhookSecret, 'webhook', 'BOT_WEBHOOK_SECRET')
              }
              className="px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-xs font-semibold text-white transition-colors whitespace-nowrap"
            >
              {copiedKey === 'webhook' ? t.copied : t.copy}
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label
              htmlFor="bot-env-snippet"
              className="block text-xs font-medium uppercase tracking-wider text-neutral-400"
            >
              {t.envSnippetLabel}
            </label>
            <button
              type="button"
              onClick={() => copy(fallbackEnv, 'env', t.envSnippetLabel)}
              className="text-xs font-semibold text-purple-300 hover:text-purple-200 transition-colors"
            >
              {copiedKey === 'env' ? t.copied : t.copyBlock}
            </button>
          </div>
          <textarea
            id="bot-env-snippet"
            readOnly
            value={fallbackEnv}
            onFocus={(e) => e.currentTarget.select()}
            rows={Math.min(8, fallbackEnv.split('\n').length + 1)}
            className="w-full px-3 py-2 rounded-lg bg-neutral-950/80 border border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs font-mono text-white resize-none"
          />
        </div>
      </div>
    </div>
  );
}
