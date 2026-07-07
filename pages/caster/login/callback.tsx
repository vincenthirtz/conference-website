// pages/caster/login/callback.tsx
//
// Feature: Run-of-show — Lot 4.
// Callback du magic-link Supabase pour le caster login.
//
// Supabase peut renvoyer la session :
//   - via fragment hash (`#access_token=...&type=magiclink`) — flow legacy.
//   - via querystring (`?code=...`) — flow PKCE (par defaut sur les SDK
//     recents). Necessite exchangeCodeForSession().
//
// Dans tous les cas, supabaseClient detecte automatiquement le hash via
// `detectSessionInUrl=true` (defaut). On attend que la session soit posee
// avant de valider via /api/caster/me.
//
// Si l user a une session ET est lie a un cast_members actif → redirect vers
// /caster/cockpit. Sinon → redirect vers /caster/login?error=...

import { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { logger } from '@/utils/logger';
import { useT } from '@/lib/i18n/useT';

const POLL_DELAY_MS = 250;
const MAX_TRIES = 20; // 5s total

const CasterLoginCallbackPage = () => {
  const router = useRouter();
  const t = useT('casterLoginCallback');
  const [status, setStatus] = useState<string>('');

  useEffect(() => {
    setStatus((s) => s || t.statusValidating);
  }, [t]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        // Si on a un ?code=, c est le flow PKCE — on l echange explicitement.
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          const code = url.searchParams.get('code');
          if (code) {
            setStatus(t.statusExchanging);
            const { error } = await supabaseClient.auth.exchangeCodeForSession(
              window.location.href
            );
            if (error) {
              logger.error('[caster/callback] exchange error', error);
              if (!cancelled) {
                await router.replace('/caster/login?error=no_session');
              }
              return;
            }
          }
        }

        // Attendre la session (poll court). detectSessionInUrl peut prendre
        // un tick pour materialiser la session a partir du fragment.
        let session = null;
        for (let i = 0; i < MAX_TRIES; i += 1) {
          if (cancelled) return;
          const { data } = await supabaseClient.auth.getSession();
          if (data.session?.access_token) {
            session = data.session;
            break;
          }
          await new Promise((r) => setTimeout(r, POLL_DELAY_MS));
        }

        if (!session?.access_token) {
          if (!cancelled) {
            await router.replace('/caster/login?error=no_session');
          }
          return;
        }

        setStatus(t.statusVerifying);

        // /api/caster/me passe par withCasterRoute qui exige :
        //   - role staff >= caster
        //   - cast_members.auth_user_id = user.id ET is_active = true
        const res = await fetch('/api/caster/me', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          // Pas lie a un cast_members actif. On signe out pour eviter de
          // laisser une session caster non valide qui boucle.
          logger.warn('[caster/callback] /api/caster/me not ok', {
            status: res.status,
          });
          await supabaseClient.auth.signOut();
          if (!cancelled) {
            await router.replace('/caster/login?error=not_caster');
          }
          return;
        }

        setStatus(t.statusRedirecting);
        if (!cancelled) {
          await router.replace('/caster/cockpit');
        }
      } catch (err) {
        logger.error('[caster/callback] unexpected error', err);
        if (!cancelled) {
          await router.replace('/caster/login?error=callback_error');
        }
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [router, t]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <Head>
        <title>{t.docTitle}</title>
      </Head>
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-2 border-neutral-700 border-t-purple-400 rounded-full animate-spin mx-auto" />
        <div className="text-lg font-semibold">{status}</div>
        <div className="text-sm text-gray-400 max-w-sm">{t.pleaseWait}</div>
      </div>
    </div>
  );
};

const seo: SeoProps = {
  title: 'Connexion en cours',
  noindex: true,
};

CasterLoginCallbackPage.seo = seo;

export default CasterLoginCallbackPage;
