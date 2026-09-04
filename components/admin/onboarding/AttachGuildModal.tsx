// components/admin/onboarding/AttachGuildModal.tsx
//
// Rattacher un serveur Discord à un espace, depuis l'espace.
//
// L'autre chemin (onglet « Liens Discord ») part du SERVEUR : il liste ce qui
// attend à la porte et demande « pour quel espace ? ». Celui-ci part de
// l'espace et demande « quel serveur ? » — c'est la question posée par
// l'onglet « Espaces » quand il affiche « aucun serveur Discord ».
//
// Deux façons de désigner le serveur, dans cet ordre d'évidence :
//   1. le choisir parmi ceux qui attendent (le bot y a été invité, la ligne
//      d'attente existe) — le cas courant, et celui où l'on ne peut pas se
//      tromper d'identifiant ;
//   2. saisir l'identifiant à la main — pour un serveur dont l'attente a été
//      purgée, ou que l'on rattache avant d'y inviter le bot.
//
// La modale porte aussi l'INVITATION du bot, parce que c'est le même moment :
// quand un espace n'a aucun serveur, la première question n'est pas « lequel
// rattacher ? » mais « le bot y est-il ? ». Inviter, rafraîchir, rattacher —
// les trois gestes s'enchaînent ici, sans quitter l'écran. Envoyer l'opérateur
// chercher l'URL d'invitation ailleurs, c'était le perdre entre deux étapes.
//
// Le bot prend le rattachement en compte au rafraîchissement de son cache
// (~5 min) : on le dit, sinon l'absence de réaction immédiate ressemble à un
// échec.

import { useCallback, useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';
import AlertBanner from '@/components/admin/AlertBanner';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useToast } from '@/components/Toast';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import nsAdminOnboarding from '@/lib/i18n/locales/admin-fr/adminOnboarding';

const GUILD_ID_RE = /^[0-9]{15,25}$/;

type PendingLink = {
  guild_id: string;
  guild_name: string | null;
  requested_at: string | null;
};

type AttachGuildModalProps = {
  open: boolean;
  onClose: () => void;
  /** Espace auquel rattacher — null quand la modale est fermée. */
  tenant: { id: string; name: string } | null;
  /** Appelé après un rattachement réussi (rechargement de la vue). */
  onAttached: () => void;
  /**
   * URL d'invitation GÉNÉRIQUE, en repli. Le lien porteur de l'espace est
   * chargé par la modale elle-même (`/tenants/:id/bot-invite`) : il ne peut
   * être fabriqué qu'une fois l'espace connu, donc pas au chargement de la
   * liste. `null` = `DISCORD_CLIENT_ID` absent — on le dit plutôt que
   * d'afficher un bouton qui ne mène nulle part.
   */
  botInviteUrl: string | null;
};

export default function AttachGuildModal({
  open,
  onClose,
  tenant,
  onAttached,
  botInviteUrl,
}: AttachGuildModalProps) {
  const t = useAdminT(nsAdminOnboarding);
  const { adminFetchJson } = useAdminFetch();
  const { mutateJson } = useIdempotentMutation();
  const { addToast } = useToast();

  const [pending, setPending] = useState<PendingLink[]>([]);
  const [choice, setChoice] = useState('');
  const [manualId, setManualId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  // Lien d'invitation PORTEUR DE L'ESPACE. En mode `direct`, Discord renvoie
  // l'installateur chez nous et le rattachement se fait tout seul ; en mode
  // `manual`, c'est l'ancien lien générique et il reste une étape à faire ici.
  // On part du repli générique tant que la réponse n'est pas là : mieux vaut
  // un lien qui marche à moitié qu'un bouton absent.
  const [inviteUrl, setInviteUrl] = useState<string | null>(botInviteUrl);
  const [inviteMode, setInviteMode] = useState<'direct' | 'manual'>('manual');

  const loadPending = useCallback(async () => {
    setRefreshing(true);
    try {
      const data = await adminFetchJson<{ links: PendingLink[] }>(
        '/api/admin/pending-guild-links'
      );
      setPending(data.links ?? []);
    } catch {
      // L'attente est une commodité : si elle ne charge pas, la saisie
      // manuelle reste disponible et le formulaire fonctionne.
      setPending([]);
    } finally {
      setRefreshing(false);
    }
  }, [adminFetchJson]);

  // Repart d'un formulaire vierge à chaque ouverture, et recharge l'attente :
  // elle a pu bouger depuis le dernier affichage.
  useEffect(() => {
    if (!open) return;
    setChoice('');
    setManualId('');
    setError(null);
    setSaving(false);
    void loadPending();
  }, [open, loadPending]);

  // Le lien porte un state signé à durée de vie courte : on le demande à
  // l'ouverture, jamais d'avance, et pour CET espace.
  useEffect(() => {
    if (!open || !tenant) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await adminFetchJson<{
          url: string | null;
          mode: 'direct' | 'manual';
        }>(`/api/admin/tenants/${tenant.id}/bot-invite`);
        if (cancelled) return;
        setInviteUrl(data.url ?? botInviteUrl);
        setInviteMode(data.mode ?? 'manual');
      } catch {
        // Repli sur le lien générique : l'invitation reste possible, seul le
        // rattachement automatique est perdu.
        if (!cancelled) {
          setInviteUrl(botInviteUrl);
          setInviteMode('manual');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, tenant, adminFetchJson, botInviteUrl]);

  const guildId = choice || manualId.trim();

  const submit = useCallback(async () => {
    if (!tenant) return;
    if (!GUILD_ID_RE.test(guildId)) {
      setError(t.attachGuildInvalid);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await mutateJson(`/api/admin/tenants/${tenant.id}/guilds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guild_id: guildId }),
      });
      addToast(format(t.attachGuildDone, { name: tenant.name }), 'success');
      onAttached();
    } catch (err) {
      setError(err instanceof Error ? err.message : t.attachGuildError);
    } finally {
      setSaving(false);
    }
  }, [tenant, guildId, mutateJson, addToast, onAttached, t]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t.attachGuildTitle}
      subtitle={
        tenant
          ? format(t.attachGuildSubtitle, { name: tenant.name })
          : undefined
      }
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-neutral-600 px-4 py-2 text-sm text-neutral-200"
          >
            {t.attachGuildCancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving || !GUILD_ID_RE.test(guildId)}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            data-testid="attach-guild-submit"
          >
            {saving ? t.attachGuildSaving : t.attachGuildSubmit}
          </button>
        </div>
      }
    >
      <AlertBanner message={error} variant="error" className="mb-4" />

      {/* Étape 0 : le bot est-il sur le serveur ? Tant qu'il n'y est pas, il
          n'y a rien à rattacher — et c'est l'oubli le plus courant. */}
      <div className="mb-4 rounded-xl border border-violet-500/30 bg-violet-500/5 p-3">
        <p className="text-sm font-medium text-violet-100">
          {t.attachGuildInviteHeading}
        </p>
        <p className="mt-1 text-xs text-neutral-300">
          {inviteMode === 'direct'
            ? t.attachGuildInviteHelpDirect
            : t.attachGuildInviteHelp}
        </p>
        {inviteUrl ? (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
              data-testid="attach-guild-invite"
            >
              {t.attachGuildInviteCta}
            </a>
            {/* En mode direct, il n'y a rien à rafraîchir : le retour de
                Discord rattache tout seul. Laisser le bouton entretiendrait
                l'idée qu'il reste une étape. */}
            {inviteMode === 'manual' && (
              <button
                type="button"
                onClick={() => void loadPending()}
                disabled={refreshing}
                className="text-xs text-violet-300 underline hover:text-violet-200 disabled:opacity-50"
                data-testid="attach-guild-refresh"
              >
                {refreshing ? t.attachGuildRefreshing : t.attachGuildRefresh}
              </button>
            )}
          </div>
        ) : (
          <p className="mt-2 text-xs text-amber-200">
            {t.attachGuildInviteUnavailable}
          </p>
        )}
      </div>

      {pending.length > 0 ? (
        <label className="block">
          <span className="text-sm text-neutral-300">
            {t.attachGuildPendingLabel}
          </span>
          <select
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              if (e.target.value) setManualId('');
            }}
            className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
            data-testid="attach-guild-pending"
          >
            <option value="">{t.attachGuildPendingNone}</option>
            {pending.map((p) => (
              <option key={p.guild_id} value={p.guild_id}>
                {p.guild_name ?? p.guild_id} — {p.guild_id}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="text-sm text-neutral-400">{t.attachGuildNoPending}</p>
      )}

      <label className="mt-4 block">
        <span className="text-sm text-neutral-300">
          {t.attachGuildManualLabel}
        </span>
        <input
          type="text"
          value={manualId}
          onChange={(e) => {
            setManualId(e.target.value);
            if (e.target.value) setChoice('');
          }}
          inputMode="numeric"
          placeholder="123456789012345678"
          className="mt-1 w-full rounded-lg border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-white"
          data-testid="attach-guild-manual"
        />
        <span className="mt-1 block text-xs text-neutral-500">
          {t.attachGuildManualHelp}
        </span>
      </label>

      <p className="mt-4 rounded-lg border border-neutral-700/60 bg-neutral-900/40 px-3 py-2 text-xs text-neutral-400">
        {t.attachGuildBotDelay}
      </p>
    </Modal>
  );
}
