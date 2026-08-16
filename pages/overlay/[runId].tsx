// pages/overlay/[runId].tsx
//
// Feature: Production broadcast automatisée (roadmap #07) — the PUBLIC OVERLAY
// RENDERER. A chrome-less OBS browser-source page that renders the live
// broadcast scene for one run.
//
// URL shape: /overlay/<runId>
//
// - No auth (public by design; the API endpoint is public). Add the browser
//   source before going live — the API returns a safe empty-ish shape (scene
//   'starting') until the run is live.
// - No site chrome: `pages/_app.tsx` renders `/overlay/*` bare (like `/embed/*`
//   and the draft spectator overlay) — no Navbar/Footer/cookie banner/toasts.
// - Updates pushed via Supabase Realtime on the run's `event_runs` row, with a
//   ~5s polling fallback (see useOverlayState). A `broadcast_state` write →
//   subscription fires → refetch → new scene renders near-instantly.

import Head from 'next/head';
import { useRouter } from 'next/router';
import { useOverlayState } from '@/hooks/useOverlayState';
import { isValidUUID } from '@/utils/apiHelpers';
import { useT } from '@/lib/i18n/useT';
import { useTenantBranding } from '@/lib/branding/TenantBrandingProvider';
import {
  OverlayRenderer,
  type OverlayBranding,
} from '@/components/overlay/OverlayRenderer';
import nsOverlay from '@/lib/i18n/locales/fr/overlay';

function OverlayPage() {
  const router = useRouter();
  const t = useT(nsOverlay);
  const runIdRaw = router.query.runId;
  const runId = typeof runIdRaw === 'string' ? runIdRaw : '';
  const valid = isValidUUID(runId);

  const branding = useTenantBranding();
  const overlayBranding: OverlayBranding = branding
    ? { name: branding.name, logoUrl: branding.logoUrl }
    : null;

  const { data, loading, error } = useOverlayState({
    runId: valid ? runId : null,
    enabled: valid,
  });

  return (
    <>
      <Head>
        <title>{t.docTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      {/* OBS browser sources want a transparent page so live scenes composite
          over the video canvas. Scoped to this page's lifecycle. */}
      <style jsx global>{`
        html,
        body {
          background: transparent !important;
        }
      `}</style>

      {!valid ? (
        <main className="flex min-h-screen items-center justify-center bg-neutral-950 text-neutral-500">
          {t.invalidRunId}
        </main>
      ) : loading && !data ? (
        <main className="flex min-h-screen items-center justify-center bg-transparent text-neutral-500">
          {t.connecting}
        </main>
      ) : data ? (
        <OverlayRenderer
          scene={data.scene}
          onAir={data.onAir}
          lowerThird={data.lowerThird}
          pipEnabled={data.pip.enabled}
          match={data.match}
          sponsors={data.sponsors}
          branding={overlayBranding}
        />
      ) : error ? (
        // Never hard-fail a running browser source: hold on the last render if
        // we had one; otherwise a quiet neutral frame while polling recovers.
        <main className="flex min-h-screen items-center justify-center bg-transparent text-neutral-600">
          &nbsp;
        </main>
      ) : null}
    </>
  );
}

export default OverlayPage;
