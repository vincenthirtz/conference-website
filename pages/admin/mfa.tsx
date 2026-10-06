// pages/admin/mfa.tsx — double authentification du staff (TOTP Supabase).
//
// Destination des gardes quand l'obligation est active (STAFF_MFA_ENFORCED,
// cf. utils/staffMfa.ts) : enrôlement si le compte n'a aucun facteur, sinon
// saisie du code pour élever la session en `aal2`, puis retour sur `next`.
// Accessible aussi quand l'obligation est coupée — c'est alors une simple
// invitation.
//
// Cette page n'utilise PAS `withStaffPage` : elle en est l'exemption, sans
// quoi la redirection bouclerait.

import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { AdminButtonLink } from '@/features/admin/_shared/ui/AdminButton';
import StaffMfaPanel from '@/components/admin/profile/StaffMfaPanel';
import { getStaffContextFromRequest } from '@/utils/staff';
import { isStaffMfaEnforced, STAFF_MFA_PATH } from '@/utils/staffMfa';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminProfile from '@/lib/i18n/locales/admin-fr/adminProfile';

type Props = { enforced: boolean; next: string };

/** `next` sûr : une URL admin interne, jamais la page elle-même. */
function safeAdminNext(raw: unknown): string {
  const v = Array.isArray(raw) ? raw[0] : raw;
  if (
    typeof v === 'string' &&
    v.startsWith('/admin') &&
    !v.startsWith('//') &&
    !v.startsWith(STAFF_MFA_PATH)
  ) {
    return v;
  }
  return '/admin';
}

export const getServerSideProps: GetServerSideProps<Props> = async (ctx) => {
  const next = safeAdminNext(ctx.query.next);
  const staffCtx = await getStaffContextFromRequest(ctx.req, ctx.res);
  if (!staffCtx.user) {
    const back = `${STAFF_MFA_PATH}?next=${encodeURIComponent(next)}`;
    return {
      redirect: {
        destination: `/admin/login?next=${encodeURIComponent(back)}`,
        permanent: false,
      },
    };
  }
  if (!staffCtx.staff) {
    return { redirect: { destination: '/403', permanent: false } };
  }
  return { props: { enforced: isStaffMfaEnforced(), next } };
};

export default function AdminMfaPage({ enforced, next }: Props) {
  const t = useAdminT(nsAdminProfile);

  // Rechargement complet : le SSR de la page suivante doit relire les cookies
  // de la session tout juste élevée en `aal2`.
  const goNext = () => {
    window.location.assign(next);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-surface-black to-black text-white">
      <Head>
        <title>{t.mfaPageTitle}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-gray-300">
              {t.mfaPageBadge}
            </div>
            <h1 className="text-gradient mt-4 text-center text-3xl font-bold">
              {t.mfaPageHeading}
            </h1>
            <p className="mt-2 max-w-sm text-center text-sm text-gray-300">
              {enforced ? t.mfaPageEnforcedIntro : t.mfaPageOptionalIntro}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-xl">
            <StaffMfaPanel onVerified={goNext} />
          </div>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {/* Obligation active et session encore `aal1` : la garde renverra
                ici — le lien reste utile une fois la session validée. */}
            <AdminButtonLink href={next} variant="ghost" size="sm">
              {t.mfaPageContinue}
            </AdminButtonLink>
            <AdminButtonLink href="/admin/logout" variant="ghost" size="sm">
              {t.mfaPageLogout}
            </AdminButtonLink>
          </div>
        </div>
      </main>
    </div>
  );
}
