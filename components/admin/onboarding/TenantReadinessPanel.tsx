// components/admin/onboarding/TenantReadinessPanel.tsx
//
// Onglet « Espaces » du hub d'onboarding : l'état de mise en service de
// chaque espace.
//
// La liste des tenants dit ce qu'ils SONT. Celle-ci dit ce qui leur MANQUE —
// et chaque manque est un lien vers l'écran qui le règle. C'est la différence
// entre un inventaire et un plan d'action : un espace créé il y a trois
// semaines peut n'avoir jamais rien fait, sans que rien ne le signale, jusqu'au
// jour d'un match.
//
// Les manques sont classés du plus bloquant au plus secondaire (l'API les
// renvoie déjà dans cet ordre) : un espace sans serveur Discord ne fait rien du
// tout, un espace sans compte d'envoi fait presque tout.

import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  tenantsKeys,
  useTenantsReadiness,
} from '@/features/admin/tenants/hooks/useTenants';
import Link from 'next/link';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import AttachGuildModal from '@/components/admin/onboarding/AttachGuildModal';
import MintApiKeyModal from '@/components/admin/onboarding/MintApiKeyModal';
import GrantAccessModal from '@/components/admin/onboarding/GrantAccessModal';
import ApiTokenRevealModal from '@/components/admin/ApiTokenRevealModal';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';
import AdminButton, {
  AdminButtonLink,
} from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminOnboarding.fr;

type TenantReadiness = {
  id: string;
  slug: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  plan: string;
  effectivePlan: string;
  planStatus: string;
  planExpiresAt: string | null;
  isTrial: boolean;
  daysRemaining: number | null;
  guildCount: number;
  guilds: Array<{
    guildId: string;
    guildName: string | null;
    isPrimary: boolean;
    configuredKeys: number;
  }>;
  configuredKeys: number;
  ownerCount: number;
  staffCount: number;
  hasBotSecrets: boolean;
  hasEmailSender: boolean;
  apiTokenCount: number;
  apiTokenSoonestExpiry: string | null;
  botEnabled: boolean;
  blockers: string[];
};

/**
 * Libellé et destination de chaque manque. La destination compte autant que le
 * libellé : signaler un manque sans dire où le régler laisse le lecteur
 * chercher.
 *
 * `action` remplace le lien quand le geste se fait ICI même — c'est le cas du
 * rattachement d'un serveur, qui partait auparavant vers l'onglet « Liens
 * Discord » où le serveur n'apparaissait que s'il attendait déjà.
 */
function blockerMeta(
  blocker: string,
  tenantId: string,
  t: Dict
): {
  label: string;
  href?: string | null;
  action?: 'attach_guild' | 'configure_channels' | 'grant_access';
} {
  switch (blocker) {
    case 'inactive':
      return { label: t.blockerInactive, href: `/admin/tenants/${tenantId}` };
    case 'aucun_serveur':
      return { label: t.blockerNoGuild, action: 'attach_guild' };
    case 'personne_rattache':
      return { label: t.blockerNoStaff, action: 'grant_access' };
    case 'bot_sans_secrets':
      // Les secrets se posent depuis la fiche de l'espace (onglet Discord),
      // qui porte déjà la rotation.
      return {
        label: t.blockerNoBotSecrets,
        href: `/admin/tenants/${tenantId}?tab=discord`,
      };
    case 'discord_non_configure':
      // Renseigné par l'appelant : l'écran de réglages est par SERVEUR, donc
      // la destination dépend du serveur principal de l'espace.
      return { label: t.blockerNoConfig, action: 'configure_channels' };
    case 'emails_non_configures':
      return {
        label: t.blockerNoEmail,
        href: '/admin/site-settings?tab=email-sender',
      };
    default:
      return { label: blocker, href: null };
  }
}

function Pill({
  ok,
  label,
}: {
  ok: boolean;
  label: string;
}): React.ReactElement {
  return (
    <Chip tone={ok ? 'ok' : 'neutral'}>
      <span aria-hidden>{ok ? '✓' : '·'}</span>
      {label}
    </Chip>
  );
}

export default function TenantReadinessPanel() {
  const t = useAdminT(nsAdminOnboarding);
  const qc = useQueryClient();
  // Même lecture que le panneau « Clés API » : une requête pour les deux.
  const readiness = useTenantsReadiness<{
    tenants: TenantReadiness[];
    botInviteUrl: string | null;
  }>();
  const rows: TenantReadiness[] | null = readiness.error
    ? []
    : (readiness.data?.tenants ?? null);
  const botInviteUrl = readiness.data?.botInviteUrl ?? null;
  const error = readiness.error
    ? readiness.error.message || t.readinessLoadError
    : null;
  const [onlyBlocked, setOnlyBlocked] = useState(false);
  // Espace en cours de rattachement — porte aussi l'ouverture de la modale.
  const [attachTo, setAttachTo] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Espace pour lequel on émet une clé — porte aussi l'ouverture de la modale.
  const [mintFor, setMintFor] = useState<{
    id: string;
    name: string;
  } | null>(null);
  // Clair fraîchement émis, montré UNE fois puis oublié.
  const [revealed, setRevealed] = useState<string | null>(null);
  // Espace dont on ouvre l'accès à quelqu'un.
  const [grantFor, setGrantFor] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const load = useCallback(
    () => qc.invalidateQueries({ queryKey: tenantsKeys.readiness }),
    [qc]
  );

  const shown = useMemo(
    () => (rows ?? []).filter((r) => !onlyBlocked || r.blockers.length > 0),
    [rows, onlyBlocked]
  );

  const blockedCount = (rows ?? []).filter((r) => r.blockers.length > 0).length;

  if (rows === null) {
    return <p className="text-sm text-neutral-400">{t.readinessLoading}</p>;
  }

  return (
    <div>
      <AlertBanner message={error} variant="error" className="mb-4" />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-400">
          {blockedCount === 0
            ? t.readinessAllReady
            : format(t.readinessBlockedCount, { count: blockedCount })}
        </p>
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={onlyBlocked}
            onChange={(e) => setOnlyBlocked(e.target.checked)}
            className="rounded-[var(--r-ctrl,4px)] border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]"
          />
          {t.readinessOnlyBlocked}
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          {t.readinessEmpty}
        </p>
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => {
            // Un essai qui se termine dans la semaine mérite d'être vu avant
            // qu'il se termine, pas après.
            const trialSoon =
              r.isTrial &&
              r.daysRemaining !== null &&
              r.daysRemaining <= 7 &&
              r.daysRemaining >= 0;

            return (
              <li
                key={r.id}
                className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-4"
                data-testid="tenant-readiness-row"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/admin/tenants/${r.id}`}
                        className="text-base font-semibold text-white hover:text-violet-300"
                      >
                        {r.name}
                      </Link>
                      <code className="rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] px-1.5 py-0.5 text-xs text-neutral-400">
                        {r.slug}
                      </code>
                      {r.isTrial && (
                        <Chip tone="brand">
                          {r.daysRemaining !== null
                            ? format(t.readinessTrialDays, {
                                days: Math.max(0, r.daysRemaining),
                              })
                            : t.readinessTrial}
                        </Chip>
                      )}
                      {trialSoon && (
                        <Chip tone="warn">{t.readinessTrialEndingSoon}</Chip>
                      )}
                    </div>

                    {r.guilds.length > 0 && (
                      <ul className="mt-2 flex flex-wrap gap-2">
                        {r.guilds.map((g) => (
                          <li key={g.guildId}>
                            {/* L'écran de réglages est PAR serveur : on y va
                                directement, plutôt que de passer par la fiche
                                de l'espace puis de rechercher le serveur. */}
                            <AdminButtonLink
                              variant="ghost"
                              size="xs"
                              href={`/admin/tenants/${r.id}/discord-config/${g.guildId}`}
                              data-testid="readiness-configure-guild"
                            >
                              <span className="font-medium">
                                {g.guildName ?? g.guildId}
                              </span>
                              {g.isPrimary && (
                                <span className="text-[10px] uppercase tracking-wide text-neutral-500">
                                  {t.guildPrimaryTag}
                                </span>
                              )}
                              <span
                                className={
                                  g.configuredKeys > 0
                                    ? 'text-emerald-300'
                                    : 'text-amber-300'
                                }
                              >
                                {format(t.configureChannelsCount, {
                                  count: g.configuredKeys,
                                })}
                              </span>
                              <span aria-hidden>→</span>
                            </AdminButtonLink>
                          </li>
                        ))}
                      </ul>
                    )}

                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Pill ok={r.botEnabled} label={t.criterionBot} />
                      <Pill
                        ok={r.guildCount > 0}
                        label={format(t.criterionGuilds, {
                          count: r.guildCount,
                        })}
                      />
                      {/* Un serveur rattaché ne veut pas dire un bot qui
                          répond : sans secrets il ne s'authentifie pas. La
                          pastille n'a de sens qu'avec un serveur. */}
                      {r.guildCount > 0 && (
                        <Pill
                          ok={r.hasBotSecrets}
                          label={t.criterionBotSecrets}
                        />
                      )}
                      <Pill
                        ok={r.configuredKeys > 0}
                        label={format(t.criterionConfig, {
                          count: r.configuredKeys,
                        })}
                      />
                      <Pill
                        ok={r.ownerCount > 0}
                        label={format(t.criterionOwners, {
                          count: r.ownerCount,
                        })}
                      />
                      <Pill ok={r.hasEmailSender} label={t.criterionEmail} />
                      <Pill
                        ok={r.apiTokenCount > 0}
                        label={format(t.criterionApiKeys, {
                          count: r.apiTokenCount,
                        })}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-2">
                    <Chip tone={r.blockers.length === 0 ? 'ok' : 'warn'}>
                      {r.blockers.length === 0
                        ? t.readinessReady
                        : format(t.readinessBlockers, {
                            count: r.blockers.length,
                          })}
                    </Chip>
                    {/* Toujours accessible, pas seulement quand le serveur
                        manque : un espace peut légitimement en piloter un
                        second (serveur de staff, édition suivante). */}
                    <AdminButton
                      variant="ghost"
                      size="xs"
                      onClick={() => setAttachTo({ id: r.id, name: r.name })}
                      data-testid="readiness-attach-guild-cta"
                    >
                      {r.guilds.length === 0
                        ? t.attachGuildInviteCta
                        : t.attachGuildCta}
                    </AdminButton>
                    {/* Émettre depuis la LIGNE de l'espace : la cible est
                        nommée dans la modale et dans l'URL appelée. C'est tout
                        l'objet du geste — /admin/api-tokens émet pour l'espace
                        actif du sélecteur, qu'il n'affiche nulle part. */}
                    <AdminButton
                      variant="ghost"
                      size="xs"
                      onClick={() => setMintFor({ id: r.id, name: r.name })}
                      data-testid="readiness-mint-key-cta"
                    >
                      {t.mintKeyCta}
                    </AdminButton>
                    <AdminButton
                      variant="ghost"
                      size="xs"
                      onClick={() => setGrantFor({ id: r.id, name: r.name })}
                      data-testid="readiness-grant-access-cta"
                    >
                      {t.grantAccessCta}
                    </AdminButton>
                  </div>
                </div>

                {r.blockers.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {r.blockers.map((b) => {
                      const meta = blockerMeta(b, r.id, t);
                      return (
                        <li key={b}>
                          {meta.action === 'configure_channels' ? (
                            <AdminButtonLink
                              variant="ghost"
                              size="xs"
                              href={`/admin/tenants/${r.id}/discord-config/${
                                (r.guilds[0] ?? { guildId: '' }).guildId
                              }`}
                            >
                              {meta.label} →
                            </AdminButtonLink>
                          ) : meta.action === 'grant_access' ? (
                            <AdminButton
                              variant="ghost"
                              size="xs"
                              type="button"
                              onClick={() =>
                                setGrantFor({ id: r.id, name: r.name })
                              }
                              data-testid="readiness-grant-access"
                            >
                              {meta.label} →
                            </AdminButton>
                          ) : meta.action === 'attach_guild' ? (
                            <AdminButton
                              variant="ghost"
                              size="xs"
                              type="button"
                              onClick={() =>
                                setAttachTo({ id: r.id, name: r.name })
                              }
                              data-testid="readiness-attach-guild"
                            >
                              {meta.label} →
                            </AdminButton>
                          ) : meta.href ? (
                            <AdminButtonLink
                              variant="ghost"
                              size="xs"
                              href={meta.href}
                            >
                              {meta.label} →
                            </AdminButtonLink>
                          ) : (
                            <Chip tone="warn">{meta.label}</Chip>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AttachGuildModal
        open={attachTo !== null}
        botInviteUrl={botInviteUrl}
        tenant={attachTo}
        onClose={() => setAttachTo(null)}
        onAttached={() => {
          setAttachTo(null);
          // Le rattachement change l'état affiché : on recharge plutôt que de
          // le deviner côté client.
          void load();
        }}
      />

      {mintFor && (
        <MintApiKeyModal
          tenantId={mintFor.id}
          tenantName={mintFor.name}
          onClose={() => setMintFor(null)}
          onMinted={(token) => {
            setMintFor(null);
            // Le clair traverse l'état le temps d'une modale, puis disparaît :
            // il n'existe nulle part ailleurs.
            setRevealed(token);
            void load();
          }}
        />
      )}

      {grantFor && (
        <GrantAccessModal
          tenantId={grantFor.id}
          tenantName={grantFor.name}
          onClose={() => setGrantFor(null)}
          onDone={() => {
            // La modale reste ouverte pour annoncer CE QUI s'est passé
            // (rattachée vs invitée) ; seule la liste se rafraîchit.
            void load();
          }}
        />
      )}

      {revealed && (
        <ApiTokenRevealModal
          token={revealed}
          onClose={() => setRevealed(null)}
        />
      )}
    </div>
  );
}
