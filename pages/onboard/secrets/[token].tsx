// /onboard/secrets/[token]
//
// Single-use reveal page : SSR fetches the underlying API endpoint
// `/api/onboard/secrets/[token]` which atomically wipes the pending payload
// after the first read. Subsequent reloads return 410 → we render an error
// state.
//
// No auth required — the URL token IS the secret. Token TTL is 1h, enforced
// server-side.

import type { GetServerSideProps } from 'next';
import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import SecretRevealCard from '@/components/onboard/SecretRevealCard';
import { getSiteUrl } from '@/utils/onboard';
import { logger } from '@/utils/logger';
import { useT, format } from '@/lib/i18n/useT';

type SuccessProps = {
  kind: 'success';
  botApiKey: string;
  botWebhookSecret: string;
  tenantId: string | null;
  tenantSlug: string | null;
  tenantName: string | null;
  dotEnvSnippet: string;
};

type ErrorProps = {
  kind: 'error';
  status: number;
  code: string;
  message: string;
};

type ServerProps = SuccessProps | ErrorProps;

const TOKEN_RE = /^[a-f0-9]{64}$/i;

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  ctx
) => {
  const rawToken = ctx.params?.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;

  // Make sure search engines never index this URL even if accidentally
  // leaked.
  ctx.res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  ctx.res.setHeader('Cache-Control', 'private, no-store, max-age=0');

  if (!token || !TOKEN_RE.test(token)) {
    return {
      props: {
        kind: 'error',
        status: 400,
        code: 'INVALID_TOKEN',
        message:
          'Le lien de récupération est invalide. Vérifiez que vous avez copié toute l’URL.',
      },
    };
  }

  // Build an absolute URL : SSR fetch hits our own /api/onboard/secrets.
  const base = getSiteUrl();
  const url = `${base}/api/onboard/secrets/${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: 'GET',
      // Forward the user-agent so logs are useful, no cookies needed.
      headers: {
        'user-agent':
          (ctx.req.headers['user-agent'] ?? '').toString().slice(0, 200) ||
          'onboard-reveal-ssr',
      },
    });

    if (res.status === 200) {
      const data = (await res.json()) as {
        botApiKey: string;
        botWebhookSecret: string;
        tenantId: string | null;
        tenantSlug: string | null;
        tenantName: string | null;
        instructions?: { dotEnvSnippet?: string };
      };
      return {
        props: {
          kind: 'success',
          botApiKey: data.botApiKey,
          botWebhookSecret: data.botWebhookSecret,
          tenantId: data.tenantId ?? null,
          tenantSlug: data.tenantSlug ?? null,
          tenantName: data.tenantName ?? null,
          dotEnvSnippet: data.instructions?.dotEnvSnippet ?? '',
        },
      };
    }

    let payload: { error?: string; code?: string } | null = null;
    try {
      payload = await res.json();
    } catch {
      /* ignore */
    }

    if (res.status === 410) {
      return {
        props: {
          kind: 'error',
          status: 410,
          code: payload?.code ?? 'EXPIRED',
          message:
            payload?.error ??
            'Ce lien de récupération a déjà été consulté ou a expiré. Pour des raisons de sécurité, les secrets ne peuvent plus être affichés ici.',
        },
      };
    }

    return {
      props: {
        kind: 'error',
        status: res.status,
        code: payload?.code ?? 'UNKNOWN',
        message:
          payload?.error ??
          'Impossible d’afficher les secrets pour le moment. Contactez le staff.',
      },
    };
  } catch (err) {
    logger.error('[onboard/secrets SSR] fetch failed', err);
    return {
      props: {
        kind: 'error',
        status: 500,
        code: 'SSR_FETCH_FAILED',
        message:
          'Erreur lors de la récupération des secrets. Réessayez dans quelques instants.',
      },
    };
  }
};

function OnboardSecretsPage(props: ServerProps) {
  if (props.kind === 'error') {
    return <ErrorView {...props} />;
  }
  return <SuccessView {...props} />;
}

function ErrorView({ status, message }: ErrorProps) {
  const t = useT('onboardSecrets');
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="px-4 pt-28 pb-20 md:pt-32 flex items-center justify-center">
        <div className="w-full max-w-lg rounded-2xl border border-red-500/40 bg-red-500/10 p-6 md:p-8 shadow-2xl">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-full bg-red-900/40 flex items-center justify-center text-red-300 flex-shrink-0">
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">
                {t.errorTitle}
              </h1>
              <p className="text-xs text-red-100/80 font-mono mt-1">
                HTTP {status}
              </p>
            </div>
          </div>
          <p className="text-sm text-red-100/90 leading-relaxed">{message}</p>
          <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.04] p-4 text-xs text-gray-300">
            <p className="font-semibold text-white mb-1">{t.recoveryTitle}</p>
            <p>
              {t.recoveryBody}{' '}
              <a
                href="https://discord.gg/gERSsjC3Vd"
                target="_blank"
                rel="noreferrer noopener"
                className="text-purple-300 hover:text-purple-200"
              >
                {t.ourDiscord}
              </a>
              .
            </p>
          </div>
          <div className="mt-4">
            <Link href="/" className="text-xs text-gray-400 hover:text-white">
              {t.backHome}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

function SuccessView(props: SuccessProps) {
  const { botApiKey, botWebhookSecret, tenantId, tenantSlug, tenantName } =
    props;
  const t = useT('onboardSecrets');
  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="px-4 pt-28 pb-20 md:pt-32 flex justify-center">
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                {t.successBadge}
              </span>
              <span>{t.secretsBadgeSub}</span>
            </div>
            <h1 className="text-3xl font-bold text-gradient mt-4">
              {tenantName
                ? format(t.welcome, { name: tenantName })
                : t.secretsReady}
            </h1>
            <p className="text-sm text-gray-300 mt-2 max-w-md">
              {t.onceBefore}{' '}
              <span className="font-semibold">{t.onceHighlight}</span>
              {t.onceAfter}
              {tenantSlug && (
                <>
                  {' '}
                  {t.slugLabel}{' '}
                  <span className="font-mono text-white">{tenantSlug}</span>.
                </>
              )}
            </p>
          </div>

          <SecretRevealCard
            botApiKey={botApiKey}
            botWebhookSecret={botWebhookSecret}
            dotEnvSnippet={props.dotEnvSnippet}
            tenantId={tenantId}
            tenantSlug={tenantSlug}
          />

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 shadow-2xl">
            <h2 className="text-base font-semibold text-white mb-3">
              {t.nextTitle}
            </h2>
            <ol className="space-y-3 text-sm text-gray-300">
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 border border-white/10 text-xs font-semibold flex items-center justify-center">
                  1
                </span>
                <span>
                  {t.step1a} <span className="font-mono text-white">.env</span>{' '}
                  {t.step1b}{' '}
                  <span className="font-mono">services/discord-bot/.env</span>{' '}
                  {t.step1c} <code className="font-mono">docker-box</code>
                  {t.step1d}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 border border-white/10 text-xs font-semibold flex items-center justify-center">
                  2
                </span>
                <span>
                  {t.step2a} <span className="font-mono">/help</span>
                  {t.step2b}
                </span>
              </li>
              <li className="flex items-start gap-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 border border-white/10 text-xs font-semibold flex items-center justify-center">
                  3
                </span>
                <span>
                  {t.step3a}
                  <Link
                    href="/admin"
                    className="text-purple-300 hover:text-purple-200"
                  >
                    {t.adminSpace}
                  </Link>{' '}
                  {t.step3b}
                </span>
              </li>
            </ol>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
              <Link
                href="/admin"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:opacity-90 px-5 py-2.5 text-sm font-semibold text-white transition"
                data-test="onboard-secrets-go-admin"
              >
                {t.savedButton}
                <span aria-hidden>→</span>
              </Link>
              <Link href="/" className="text-xs text-gray-400 hover:text-white">
                {t.backHomePlain}
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const onboardSecretsSeo: SeoProps = {
  title: {
    fr: 'Secrets de votre bot',
    en: 'Your bot secrets',
  },
  description: {
    fr: 'Récupération unique de vos secrets de bot (clé API + secret webhook). Lien à usage unique.',
    en: 'One-time retrieval of your bot secrets (API key + webhook secret). Single-use link.',
  },
  noindex: true,
};

OnboardSecretsPage.seo = onboardSecretsSeo;

export default OnboardSecretsPage;
