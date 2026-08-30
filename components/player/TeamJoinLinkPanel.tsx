// components/player/TeamJoinLinkPanel.tsx
//
// Bloc « lien d'invitation » de l'espace équipe.
//
// L'invitation par email juste au-dessus vise UNE personne dont on connaît
// l'adresse. Ce bloc-ci fabrique le lien qu'on colle dans un salon Discord :
// qui l'ouvre s'inscrit lui-même au roster. Un seul lien vivant par équipe —
// le régénérer révoque le précédent, ce qui est aussi la façon la plus simple
// de couper un lien qui a trop circulé.
//
// Le jeton n'est montré QU'UNE FOIS, à la génération : il n'est stocké que
// hashé (cf. utils/teams/inviteLinks.ts), donc l'API elle-même ne peut plus le
// reconstituer ensuite. D'où l'encart insistant après création.
//
// Le composant fait ses propres appels ; `scopeUrl` lui transmet le scope de
// l'écran (`?teamId=` du manager multi-équipes, `?as=` de l'inspection staff)
// sans qu'il ait à connaître ces contrats.

import { useCallback, useEffect, useState } from 'react';
import CopyButton from '@/components/player/CopyButton';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import nsTeamJoinLink from '@/lib/i18n/locales/fr/teamJoinLink';

type JoinLink = {
  id: string;
  role: string;
  expires_at: string;
  max_uses: number | null;
  uses_count: number;
  remaining_uses: number | null;
  usable: boolean;
  unusable_reason: string | null;
};

type Props = {
  /** Applique le scope de l'écran (`?teamId=`, `?as=`) à une URL d'API. */
  scopeUrl: (url: string) => string;
  /** Seule la capitaine peut créer un lien qui donne un rôle de gestion. */
  isCaptain: boolean;
  /** Inspection staff en lecture seule : on montre l'état, pas les boutons. */
  readOnly?: boolean;
};

const ENDPOINT = '/api/teams/invite-links';

export default function TeamJoinLinkPanel({
  scopeUrl,
  isCaptain,
  readOnly = false,
}: Props) {
  const t = useT(nsTeamJoinLink);
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { confirm, dialog } = useConfirmDialog();

  const [link, setLink] = useState<JoinLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'create' | 'revoke' | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Présent uniquement juste après une génération : l'URL en clair.
  const [freshUrl, setFreshUrl] = useState<string | null>(null);

  const [role, setRole] = useState('player');
  const [maxUses, setMaxUses] = useState<string>('');
  const [ttlDays, setTtlDays] = useState('7');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminFetchJson<{ link: JoinLink | null }>(
        scopeUrl(ENDPOINT)
      );
      setLink(data.link ?? null);
    } catch {
      // Un lien illisible ne doit pas casser l'écran équipe : on laisse le bloc
      // dans son état « aucun lien », l'action de génération reste possible.
      setLink(null);
    } finally {
      setLoading(false);
    }
  }, [adminFetchJson, scopeUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(async () => {
    setBusy('create');
    setError(null);
    try {
      const data = await adminFetchJson<{ link: JoinLink; url: string }>(
        scopeUrl(ENDPOINT),
        {
          method: 'POST',
          body: JSON.stringify({
            role,
            max_uses: maxUses ? Number(maxUses) : null,
            ttl_days: Number(ttlDays) || 7,
          }),
        }
      );
      setLink(data.link);
      setFreshUrl(data.url);
    } catch (err) {
      setError((err as Error)?.message || t.panelError);
    } finally {
      setBusy(null);
    }
  }, [adminFetchJson, scopeUrl, role, maxUses, ttlDays, t]);

  const revoke = useCallback(async () => {
    const ok = await confirm({
      title: t.panelConfirmRevoke,
      variant: 'warning',
      confirmLabel: t.panelRevoke,
    });
    if (!ok) return;
    setBusy('revoke');
    setError(null);
    try {
      await adminFetchJson(scopeUrl(ENDPOINT), { method: 'DELETE' });
      setLink(null);
      setFreshUrl(null);
    } catch (err) {
      setError((err as Error)?.message || t.panelError);
    } finally {
      setBusy(null);
    }
  }, [adminFetchJson, scopeUrl, confirm, t]);

  const roleLabel = (value: string) =>
    ({
      manager: t.roleManager,
      coach: t.roleCoach,
      substitute: t.roleSubstitute,
    })[value] ?? t.rolePlayer;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl mb-6">
      <h2 className="text-lg font-semibold">{t.panelTitle}</h2>
      <p className="mt-1 text-sm text-gray-400">{t.panelIntro}</p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">{t.loading}</p>
      ) : (
        <>
          {link ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/30 px-4 py-3">
              <p className="text-sm text-gray-200">
                {format(t.panelActive, {
                  role: roleLabel(link.role),
                  date: new Date(link.expires_at).toLocaleDateString('fr-FR'),
                })}
              </p>
              <p className="mt-1 text-xs text-gray-500">
                {link.max_uses == null
                  ? format(t.panelUsesUnlimited, {
                      used: String(link.uses_count),
                    })
                  : format(t.panelUses, {
                      used: String(link.uses_count),
                      max: String(link.max_uses),
                    })}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-gray-500">{t.panelNone}</p>
          )}

          {/* Le jeton en clair, montré une seule fois. */}
          {freshUrl && (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
              <p className="text-xs text-emerald-100/80">{t.panelTokenOnce}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <code className="min-w-0 flex-1 break-all rounded-lg bg-black/50 px-3 py-2 text-[11px] text-gray-300">
                  {freshUrl}
                </code>
                <CopyButton value={freshUrl} label={t.panelCopy} />
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          {!readOnly && (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="join-link-role"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300"
                  >
                    {t.panelRoleLabel}
                  </label>
                  <select
                    id="join-link-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white focus:border-purple-400/70 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
                  >
                    <option value="player">{t.rolePlayer}</option>
                    <option value="substitute">{t.roleSubstitute}</option>
                    <option value="coach">{t.roleCoach}</option>
                    {/* Rôle à privilèges : la capitaine seule (l'API refuse
                        sinon — 403 ROLE_ESCALATION). */}
                    {isCaptain && (
                      <option value="manager">{t.roleManager}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="join-link-max-uses"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300"
                  >
                    {t.panelMaxUsesLabel}
                  </label>
                  <select
                    id="join-link-max-uses"
                    value={maxUses}
                    onChange={(e) => setMaxUses(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white focus:border-purple-400/70 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
                  >
                    <option value="">{t.panelMaxUsesUnlimited}</option>
                    {[1, 2, 3, 5, 10].map((n) => (
                      <option key={n} value={String(n)}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="join-link-ttl"
                    className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-300"
                  >
                    {t.panelTtlLabel}
                  </label>
                  <select
                    id="join-link-ttl"
                    value={ttlDays}
                    onChange={(e) => setTtlDays(e.target.value)}
                    className="w-full rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-sm text-white focus:border-purple-400/70 focus:outline-none focus:ring-2 focus:ring-purple-400/60"
                  >
                    {[1, 7, 14, 30].map((n) => (
                      <option key={n} value={String(n)}>
                        {format(t.panelTtlDays, { count: String(n) })}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={generate}
                  disabled={busy !== null}
                  className="rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-semibold transition hover:bg-purple-500 disabled:opacity-50"
                >
                  {link ? t.panelRegenerate : t.panelGenerate}
                </button>
                {link && (
                  <button
                    type="button"
                    onClick={revoke}
                    disabled={busy !== null}
                    className="rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:bg-white/10 disabled:opacity-50"
                  >
                    {t.panelRevoke}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
      {dialog}
    </div>
  );
}
