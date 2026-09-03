// pages/admin/onboarding/index.tsx
//
// Hub d'onboarding de la plateforme. DEUX onglets :
//
//   - « Espaces »    : ce qui manque à chaque espace pour être opérationnel,
//                      avec le lien qui règle chaque manque. Onglet par défaut,
//                      parce que c'est le seul qui a du contenu en régime
//                      normal — une file d'attente vide est un mauvais accueil.
//   - « À traiter »  : les deux boîtes d'entrée, demandes d'espace et serveurs
//                      Discord en attente, avec leurs actions.
//
// Il y en avait quatre. Le premier, « File d'onboarding », listait les MÊMES
// lignes que les deux suivants, en lecture seule, avec un lien vers eux pour
// agir : trois onglets, deux appels réseau et zéro action pour une information
// déjà là. Il est supprimé ; ce qu'il apportait vraiment — savoir sans cliquer
// qu'il y a quelque chose en attente — vit maintenant dans le compteur porté
// par l'onglet lui-même.
//
// Les anciens `?tab=` (queue, tenant-requests, guild-links) restent valides :
// ils pointent tous vers « À traiter ». Sans cet alias, un lien envoyé par
// email ou posé dans la doc atterrirait silencieusement sur le premier onglet.

import Head from 'next/head';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { withStaffPage } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Tabs, {
  useQueryTab,
  tabPanelId,
  tabButtonId,
} from '@/components/admin/Tabs';
import type { StaffProps } from '@/types/admin';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';

import { lazyPanel } from '@/components/admin/lazyPanel';
import TenantFormModal from '@/components/admin/tenants/TenantFormModal';

// Le panneau par défaut reste statique ; les autres arrivent au clic
// (cf. components/admin/lazyPanel).
import TenantReadinessPanel from '@/components/admin/onboarding/TenantReadinessPanel';

const TenantRequestsPanel = lazyPanel(
  () => import('@/components/admin/onboarding/TenantRequestsPanel')
);
const GuildLinksPanel = lazyPanel(
  () => import('@/components/admin/onboarding/GuildLinksPanel')
);

const ID_BASE = 'admin-onboarding';

const TAB_READINESS = 'espaces';
const TAB_INBOX = 'a-traiter';

/** Anciens identifiants d'onglet, encore présents dans des liens en circulation. */
const TAB_ALIAS: Record<string, string> = {
  queue: TAB_INBOX,
  'tenant-requests': TAB_INBOX,
  'guild-links': TAB_INBOX,
  readiness: TAB_READINESS,
};

type Props = StaffProps & {
  /** Snowflake Discord de l appelant (best-effort, null si non résolu). */
  currentStaffDiscordId: string | null;
};

/**
 * Ce qui attend derrière l'onglet « À traiter ».
 *
 * Deux compteurs seulement — pas les lignes : le badge doit être connu AVANT
 * d'ouvrir l'onglet, et le panneau, lui, est chargé paresseusement. La demande
 * porte `status=pending`, donc le serveur ne compte que ce qui est encore en
 * vol : une demande aboutie il y a trois semaines n'est pas « à traiter ».
 */
function useInboxCount(): number | null {
  const { adminFetchJson } = useAdminFetch();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [requests, guilds] = await Promise.all([
          adminFetchJson<{ total: number }>(
            '/api/admin/tenant-requests?status=pending&limit=1'
          ),
          adminFetchJson<{ links: unknown[] }>('/api/admin/pending-guild-links'),
        ]);
        if (cancelled) return;
        setCount((requests.total ?? 0) + (guilds.links?.length ?? 0));
      } catch {
        // Un compteur indisponible ne doit pas priver du hub : on n'affiche
        // simplement pas de badge.
        if (!cancelled) setCount(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminFetchJson]);

  return count;
}

export default function AdminOnboardingPage({ currentStaffDiscordId }: Props) {
  const t = useAdminT(nsAdminOnboarding);
  const router = useRouter();
  const inbox = useInboxCount();

  // Créer un espace depuis ICI : c'est en triant cette file qu'on découvre
  // qu'un serveur en attente n'a aucun espace à rattacher. Envoyer le staff
  // sur une autre page pour revenir ensuite lui faisait perdre son contexte.
  // Même modale que `/admin/tenants` — une seule implémentation à maintenir.
  const [createOpen, setCreateOpen] = useState(false);

  const tabs = [
    { id: TAB_READINESS, label: t.tabReadiness },
    {
      id: TAB_INBOX,
      label: (
        <span className="inline-flex items-center gap-2">
          {t.tabInbox}
          {inbox !== null && inbox > 0 && (
            <span
              className="rounded-full bg-violet-600/30 px-2 py-0.5 text-[11px] font-semibold text-violet-200"
              data-testid="onboarding-inbox-count"
            >
              {inbox}
            </span>
          )}
        </span>
      ),
    },
  ];

  const [active, setActive] = useQueryTab(tabs);
  const rawTab = Array.isArray(router.query.tab)
    ? router.query.tab[0]
    : router.query.tab;
  const effective = (rawTab && TAB_ALIAS[rawTab]) || active;

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12">
          <Breadcrumb
            items={[
              { label: t.breadcrumbAdmin, href: '/admin' },
              { label: t.breadcrumbCurrent },
            ]}
          />

          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm text-neutral-400">{t.subtitle}</p>
              <h1 className="mt-1 text-3xl md:text-4xl font-bold tracking-tight">
                {t.heading}
              </h1>
            </div>
            <button
              type="button"
              onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-300"
              data-testid="onboarding-create-tenant"
            >
              {t.createTenantCta}
            </button>
          </div>

          <Tabs
            tabs={tabs}
            active={effective}
            onChange={setActive}
            ariaLabel={t.tabsAriaLabel}
            idBase={ID_BASE}
            className="mb-8"
          />

          <div
            role="tabpanel"
            id={tabPanelId(ID_BASE, effective)}
            aria-labelledby={tabButtonId(ID_BASE, effective)}
          >
            {effective === TAB_INBOX ? (
              // Les deux boîtes d'entrée l'une sous l'autre : ce sont deux
              // objets distincts (une demande d'espace, un serveur qui a invité
              // le bot sans espace), mais une seule question — « qu'est-ce qui
              // attend à la porte ? ».
              <div className="flex flex-col gap-10">
                <TenantRequestsPanel
                  currentStaffDiscordId={currentStaffDiscordId}
                />
                <GuildLinksPanel />
              </div>
            ) : (
              <TenantReadinessPanel />
            )}
          </div>
        </div>
      </div>

      <TenantFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          setCreateOpen(false);
          // L'espace créé est immédiatement rattachable : on va sur la file des
          // serveurs en attente, là où le besoin est né.
          void router.replace(
            { pathname: '/admin/onboarding', query: { tab: TAB_INBOX } },
            undefined,
            { shallow: true }
          );
        }}
      />
    </>
  );
}

// SSR : hub réservé aux OWNERS DE LA PLATEFORME.
//
// La portée `platform` n'est pas décorative : depuis que `tenant_staff.role`
// élève le rôle effectif, le propriétaire d'un espace porte `owner` chez lui.
// Sans cette portée, il entrerait dans le hub d'onboarding — c'est-à-dire dans
// la file des demandes et des serveurs en attente de TOUS les espaces.
//
// Le badge « Toi » de la file des demandes a besoin du snowflake Discord de
// l'appelant : on le résout ici, best-effort, sans jamais faire échouer la page.
// `manage_tenant` n'est portée QUE par le rôle owner (cf.
// utils/staffPermissions.ts) : c'est la forme « par permission » qu'impose le
// garde-fou `adminPageGuards`, et elle dit la même chose que « owner-only ».
export const getServerSideProps = withStaffPage<{
  currentStaffDiscordId: string | null;
}>(
  { permission: 'manage_tenant', scope: 'platform' },
  async (_ctx, staffCtx) => {
    let discordId: string | null = null;
    try {
      const { data } = await supabaseAdmin.auth.admin.getUserById(
        staffCtx.user.id
      );
      const identities = data?.user?.identities ?? [];
      const discord = identities.find(
        (i: { provider: string }) => i.provider === 'discord'
      );
      const identityData = (discord?.identity_data ?? {}) as {
        provider_id?: string;
        sub?: string;
      };
      const candidate = identityData.provider_id || identityData.sub || '';
      if (/^\d{17,20}$/.test(candidate)) {
        discordId = candidate;
      }
    } catch (err) {
      logger.error('onboarding SSR: discord id lookup failed', err);
    }
    return { currentStaffDiscordId: discordId };
  }
);
