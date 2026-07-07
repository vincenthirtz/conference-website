// /onboard/invite-bot/[id]
//
// Step 3 of the onboarding flow. Pre-conditions :
//   - the request row exists,
//   - signed-in user owns it,
//   - status === 'pending_bot_invite' (otherwise we redirect / surface).
//
// Displays the Discord OAuth invite URL the operator must follow to invite
// the bot onto their guild. Polls /api/onboard/status/[id] every 5s while
// the page is open ; when status flips to 'completed' we either redirect to
// the secrets reveal page (if we got the token, currently NOT exposed by the
// status endpoint — UX falls back to "check your email") or show the
// "completed" success card.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import type { GetServerSideProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { getServerClient, supabaseAdmin } from '@/utils/supabase';
import { buildBotInviteUrl } from '@/utils/onboard';
import { logger } from '@/utils/logger';
import { useT } from '@/lib/i18n/useT';

type StatusFromApi = {
  id: string;
  status: string;
  requestedSlug: string;
  requestedName: string;
  createdTenantId: string | null;
  createdGuildId: string | null;
  botInviteUrl: string | null;
};

type ServerProps = {
  id: string;
  initialStatus: string;
  requestedSlug: string;
  requestedName: string;
  botInviteUrl: string | null;
  // TODO(perms) : bot permissions actuellement définies via env
  //   DISCORD_BOT_PERMISSIONS (`utils/onboard.ts`). Le bitfield par défaut
  //   est `1099780063312`, à garder en parité avec
  //   services/discord-bot/permissions.js (sibling repo docker-box).
};

const POLL_INTERVAL_MS = 5000;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const getServerSideProps: GetServerSideProps<ServerProps> = async (
  ctx
) => {
  const rawId = ctx.params?.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !UUID_RE.test(id)) {
    return { notFound: true };
  }

  if (!supabaseAdmin) {
    return { notFound: true };
  }

  // Auth — required to fetch the request row owned by this user.
  const supabase = getServerClient(ctx.req, ctx.res);
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    const dest = encodeURIComponent(`/onboard/invite-bot/${id}`);
    return {
      redirect: { destination: `/onboard?next=${dest}`, permanent: false },
    };
  }

  const { data: row, error: selErr } = await supabaseAdmin
    .from('tenant_requests')
    .select(
      'id, status, requester_auth_user_id, requester_discord_user_id, requested_slug, requested_name'
    )
    .eq('id', id)
    .maybeSingle();

  if (selErr || !row) {
    return { notFound: true };
  }

  // Ownership check : primary by auth_user_id, fallback via Discord identity.
  let isOwner = row.requester_auth_user_id === user.id;
  if (!isOwner) {
    try {
      const { data: adminUser } = await supabaseAdmin.auth.admin.getUserById(
        user.id
      );
      const discordIdentity = (adminUser?.user?.identities ?? []).find(
        (i) => i.provider === 'discord'
      );
      const identityData =
        (discordIdentity?.identity_data as
          | { provider_id?: string; sub?: string }
          | undefined) ?? {};
      const discordId = identityData.provider_id || identityData.sub || '';
      if (discordId && discordId === row.requester_discord_user_id) {
        isOwner = true;
      }
    } catch (e) {
      logger.warn('[onboard/invite-bot SSR] discord identity lookup failed', e);
    }
  }
  if (!isOwner) {
    return { notFound: true };
  }

  return {
    props: {
      id: row.id as string,
      initialStatus: row.status as string,
      requestedSlug: (row.requested_slug as string) ?? '',
      requestedName: (row.requested_name as string) ?? '',
      botInviteUrl: buildBotInviteUrl(),
    },
  };
};

function OnboardInviteBotPage({
  id,
  initialStatus,
  requestedSlug,
  requestedName,
  botInviteUrl,
}: ServerProps) {
  const t = useT('onboardInviteBot');
  const router = useRouter();
  const [status, setStatus] = useState(initialStatus);
  const [createdTenantId, setCreatedTenantId] = useState<string | null>(null);
  const stoppedRef = useRef(false);

  useEffect(() => {
    if (status === 'completed') {
      // Best-effort redirect — the status endpoint does NOT expose the
      // single-use reveal token (security), so the user is expected to use
      // the email link to land on /onboard/secrets/<token>.
      // We keep them on this page with a "success" card pointing to the
      // email.
      return;
    }
    stoppedRef.current = false;

    const tick = async () => {
      if (stoppedRef.current) return;
      try {
        const res = await fetch(`/api/onboard/status/${id}`, {
          credentials: 'include',
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusFromApi;
        setStatus(data.status);
        setCreatedTenantId(data.createdTenantId);
      } catch {
        /* swallow */
      }
    };

    tick();
    const handle = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      stoppedRef.current = true;
      window.clearInterval(handle);
    };
  }, [id, status, router]);

  const isCompleted = status === 'completed';
  const isBlocked = status !== 'pending_bot_invite' && !isCompleted;

  const handleInvite = useCallback(() => {
    if (!botInviteUrl) return;
    window.open(botInviteUrl, '_blank', 'noopener,noreferrer');
  }, [botInviteUrl]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="px-4 pt-28 pb-20 md:pt-32 flex items-center justify-center">
        <div className="w-full max-w-2xl">
          <div className="flex flex-col items-center text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              <span className="px-1.5 py-[2px] rounded-full bg-gradient-to-r from-purple-400/90 to-pink-400/90 text-black font-semibold">
                {t.stepBadge}
              </span>
              <span>{t.stepSub}</span>
            </div>
            <h1 className="text-3xl font-bold text-gradient mt-4">
              {isCompleted ? t.titleCompleted : t.title}
            </h1>
            <p className="text-sm text-gray-300 mt-2 max-w-md">
              {t.orgLabel}{' '}
              <span className="text-white font-semibold">
                {requestedName || '—'}
              </span>{' '}
              {requestedSlug && (
                <>
                  {t.slugLabel}{' '}
                  <span className="font-mono text-white">{requestedSlug}</span>
                </>
              )}
            </p>
          </div>

          {isBlocked && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 mb-6">
              <h2 className="text-sm font-semibold text-amber-100 mb-1">
                {t.blockedTitle}
              </h2>
              <p className="text-xs text-amber-100/90">
                {t.blockedStatusLabel}{' '}
                <span className="font-mono">{status}</span>
                {t.blockedBody}
                <Link
                  href="/onboard/request"
                  className="underline ml-1 hover:no-underline"
                >
                  {t.restart}
                </Link>
                .
              </p>
            </div>
          )}

          {isCompleted ? (
            <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-6 md:p-8 shadow-2xl space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-900/40 flex items-center justify-center text-emerald-300 flex-shrink-0">
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
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-base font-semibold text-emerald-100">
                    {t.completedHeading}
                  </h2>
                  <p className="text-sm text-emerald-100/90 mt-1">
                    {t.completedBody}
                  </p>
                </div>
              </div>
              <p className="text-xs text-emerald-100/80">
                {t.completedContact}{' '}
                <a
                  href="https://discord.gg/gERSsjC3Vd"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline hover:no-underline"
                >
                  {t.ourDiscord}
                </a>
                .
              </p>
              {createdTenantId && (
                <p className="text-[10px] text-emerald-100/60 font-mono">
                  tenant: {createdTenantId.slice(0, 8)}…
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 md:p-8 shadow-2xl">
              <p className="text-sm text-gray-300 mb-5">
                {t.inviteIntroBefore}{' '}
                <span className="text-white font-semibold">
                  {t.manageServerRole}
                </span>{' '}
                {t.inviteIntroAfter}
              </p>

              {!botInviteUrl ? (
                <div className="rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                  {t.noUrlBefore}{' '}
                  <span className="font-mono">DISCORD_CLIENT_ID</span>{' '}
                  {t.noUrlAfter}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleInvite}
                  disabled={isBlocked}
                  className="w-full inline-flex items-center justify-center gap-3 rounded-xl bg-[#5865F2] hover:bg-[#4752c4] disabled:opacity-50 disabled:cursor-not-allowed px-6 py-4 text-base font-semibold text-white transition shadow-lg shadow-[#5865F2]/20"
                  data-test="onboard-invite-bot-button"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 245 240"
                    className="h-6 w-6"
                    aria-hidden
                  >
                    <path
                      d="M104.4 104.5c-5.7 0-10.2 5-10.2 11.1 0 6.1 4.6 11.1 10.2 11.1 5.7 0 10.2-5 10.2-11.1.1-6.1-4.5-11.1-10.2-11.1zm36.2 0c-5.7 0-10.2 5-10.2 11.1 0 6.1 4.6 11.1 10.2 11.1 5.7 0 10.2-5 10.2-11.1s-4.5-11.1-10.2-11.1z"
                      fill="currentColor"
                    />
                    <path
                      d="M189.5 20h-134C44.2 20 34 30.2 34 42.8v130.9c0 12.7 10.2 22.8 21.5 22.8h113l-5.3-18.5 12.8 11.9 12.1 11.2 21.5 19V42.8c0-12.6-10.2-22.8-21.6-22.8z"
                      fill="currentColor"
                    />
                  </svg>
                  {t.inviteButton}
                </button>
              )}

              <ol className="mt-6 space-y-3 text-sm text-gray-300">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 border border-white/10 text-xs font-semibold flex items-center justify-center">
                    1
                  </span>
                  <span>
                    {t.step1Before}{' '}
                    <span className="text-white">{t.step1Highlight}</span>{' '}
                    {t.step1After}
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 border border-white/10 text-xs font-semibold flex items-center justify-center">
                    2
                  </span>
                  <span>{t.step2}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-white/10 border border-white/10 text-xs font-semibold flex items-center justify-center">
                    3
                  </span>
                  <span>{t.step3}</span>
                </li>
              </ol>

              <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-gray-400 flex items-center gap-2">
                <span
                  className="inline-block h-3 w-3 rounded-full border-2 border-white/30 border-t-white animate-spin"
                  aria-hidden
                />
                <span>{t.waiting}</span>
              </div>
            </div>
          )}

          <div className="mt-6 text-center text-xs text-gray-400">
            <Link href="/onboard" className="hover:text-white">
              {t.backToIntro}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

const onboardInviteBotSeo: SeoProps = {
  title: {
    fr: 'Invitez le bot sur votre serveur Discord',
    en: 'Invite the bot to your Discord server',
  },
  description: {
    fr: "Étape 3 de l'onboarding : ouvrez Discord et autorisez le bot Conférence sur votre serveur. Vos secrets vous seront ensuite envoyés par email.",
    en: 'Onboarding step 3: open Discord and authorise the Conférence bot on your server. Your secrets will then be emailed to you.',
  },
  noindex: true,
};

OnboardInviteBotPage.seo = onboardInviteBotSeo;

export default OnboardInviteBotPage;
