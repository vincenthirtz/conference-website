// components/player/DiscordLinkCard.tsx
//
// Carte « Mon compte Discord » du profil joueuse : voir à quel compte Discord
// on est rattachée, le délier, et le RATTACHER AILLEURS quand il s'est fixé au
// mauvais compte du site.
//
// POURQUOI CETTE CARTE EXISTE. Beaucoup de joueuses se sont inscrites deux fois
// le même jour : un compte e-mail — celui qui figure au roster — et un compte
// Discord OAuth. Le role-sync du bot raisonne sur `team_members.user_id` : le
// compte du roster n'a pas de Discord, le compte Discord n'est dans aucun
// roster, donc le rôle d'équipe est RETIRÉ toutes les 30 minutes. Le 18/09,
// deux joueuses l'ont perdu quatre fois dans la soirée ; le staff le redonnait
// à la main, le bot le reprenait.
//
// Jusqu'ici la seule issue était une correction en base par le staff :
// `user_discord_links.discord_user_id` est UNIQUE, donc rattacher son Discord
// au bon compte butait sur un refus définitif, sans rien proposer. Cette carte
// ouvre cette porte — et c'est la joueuse elle-même qui la franchit.
//
// POURQUOI C'EST SÛR. L'identifiant Discord ne vient jamais d'une saisie mais
// de l'identité OAuth de la session : reprendre le lien exige de prouver, à
// l'instant, qu'on contrôle ce compte Discord. Celle qui le prouve est
// légitime à décider où il pointe. La reprise reste un second geste, explicite,
// après un premier refus qui NOMME le compte détenteur (adresse masquée) —
// assez pour reconnaître son propre second compte, pas assez pour apprendre
// celle de quelqu'un d'autre.
//
// MÊME PATRON QUE `TwitchLinkCard` : la carte porte son état, lit son statut,
// et ne rend rien tant qu'elle n'a pas pu lire.

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import { supabaseClient } from '@/utils/supabaseBrowser';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useToast } from '@/components/Toast';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useT, format } from '@/lib/i18n/useT';
import { logger } from '../../utils/logger';
import nsPlayerDiscordLink from '@/lib/i18n/locales/fr/playerDiscordLink';

type LinkStatus = {
  linked: boolean;
  discordUserId: string | null;
  discordUsername: string | null;
  linkedAt: string | null;
};

/** Le refus « déjà pris », avec de quoi proposer la reprise. */
type HeldByOther = {
  heldByEmail: string | null;
};

export default function DiscordLinkCard({ id }: { id?: string }) {
  const t = useT(nsPlayerDiscordLink);
  const router = useRouter();
  const { adminFetchJson } = useAdminFetch();
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();

  const [status, setStatus] = useState<LinkStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [heldByOther, setHeldByOther] = useState<HeldByOther | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await adminFetchJson<LinkStatus>('/api/auth/discord-link'));
    } catch (err) {
      logger.error('[player/discord-link] status error:', err);
      setStatus(null);
    }
  }, [adminFetchJson]);

  useEffect(() => {
    void load();
  }, [load]);

  const onUnlink = async () => {
    const ok = await confirm({
      title: t.unlinkConfirmTitle,
      subtitle: t.unlinkConfirmBody,
      confirmLabel: t.unlink,
    });
    if (!ok) return;

    setBusy(true);
    try {
      await adminFetchJson('/api/auth/discord-link', { method: 'DELETE' });
      addToast(t.toastUnlinked, 'success');
      setHeldByOther(null);
      await load();
    } catch (err) {
      logger.error('[player/discord-link] unlink error:', err);
      addToast((err as Error)?.message || t.toastError, 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Rattache le Discord de la SESSION à ce compte. `transfer` n'est vrai qu'au
   * second passage, après que le premier a nommé le compte détenteur : on ne
   * reprend jamais un lien par surprise.
   */
  const onLink = async (transfer: boolean) => {
    setBusy(true);
    try {
      const res = await adminFetchJson<{ transferred?: boolean }>(
        '/api/auth/link-discord',
        { method: 'POST', body: JSON.stringify({ transfer }) }
      );
      addToast(
        res?.transferred ? t.toastTransferred : t.toastLinked,
        'success'
      );
      setHeldByOther(null);
      await load();
    } catch (err) {
      const payload = (err as { payload?: Record<string, unknown> })?.payload;
      if (payload?.code === 'HELD_BY_OTHER') {
        setHeldByOther({
          heldByEmail: (payload.heldByEmail as string) ?? null,
        });
        return;
      }
      logger.error('[player/discord-link] link error:', err);
      addToast((err as Error)?.message || t.toastError, 'error');
    } finally {
      setBusy(false);
    }
  };

  /**
   * Attacher l'identité Discord au compte COURANT, puis poser le lien.
   *
   * `linkIdentity` et non `signInWithOAuth` : le second CHANGERAIT de compte —
   * il connecterait au compte Discord, c'est-à-dire précisément celui dont on
   * essaie de sortir. Le premier ajoute Discord au compte déjà connecté, qui
   * est celui du roster.
   *
   * Demande que « Manual linking » soit activé côté Supabase ; sinon l'appel
   * est refusé et on le DIT, plutôt que de renvoyer vers une page blanche.
   */
  const onAttachIdentity = async () => {
    setBusy(true);
    try {
      const { error } = await supabaseClient.auth.linkIdentity({
        provider: 'discord',
        options: {
          redirectTo: `${window.location.origin}${router.pathname}`,
        },
      });
      if (error) throw error;
      // Redirection Discord en cours : rien à afficher ici.
    } catch (err) {
      logger.error('[player/discord-link] linkIdentity error:', err);
      addToast(t.errorIdentityLinking, 'error');
      setBusy(false);
    }
  };

  // État illisible : on ne rend rien plutôt qu'un bouton qui finirait en 401.
  if (!status) return null;

  return (
    <section
      id={id}
      aria-labelledby={id ? `${id}-title` : undefined}
      className="scroll-mt-24 rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-xl"
    >
      <h2
        id={id ? `${id}-title` : undefined}
        className="mb-4 text-lg font-semibold text-white"
      >
        {t.title}
      </h2>

      {status.linked ? (
        <>
          <p className="text-sm text-gray-200">
            {format(t.linkedAs, { username: status.discordUsername ?? '—' })}
          </p>
          <p className="mt-1 max-w-prose text-xs text-gray-400">
            {t.linkedNote}
          </p>
          <button
            type="button"
            onClick={onUnlink}
            disabled={busy}
            className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
          >
            {t.unlink}
          </button>
        </>
      ) : (
        <>
          <p className="max-w-prose text-sm text-gray-200">{t.notLinked}</p>
          <p className="mt-1 max-w-prose text-xs text-gray-400">{t.whyNote}</p>

          {/* Le compte Discord de la session peut déjà être rattaché ici, sans
              que le lien ait été posé (inscription par Discord puis par
              e-mail). Le bouton tente donc d'abord SANS reprise. */}
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onLink(false)}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-[#5865F2] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#4752c4] disabled:opacity-50"
            >
              {t.linkCta}
            </button>
            <button
              type="button"
              onClick={onAttachIdentity}
              disabled={busy}
              className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
            >
              {t.attachIdentityCta}
            </button>
          </div>
        </>
      )}

      {heldByOther && (
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-500/10 p-4">
          <p className="text-sm text-amber-100">
            {format(t.heldByOther, {
              email: heldByOther.heldByEmail ?? t.anotherAccount,
            })}
          </p>
          <p className="mt-1 max-w-prose text-xs text-amber-200/80">
            {t.heldByOtherNote}
          </p>
          <button
            type="button"
            onClick={() => onLink(true)}
            disabled={busy}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-amber-400 disabled:opacity-50"
          >
            {t.transferCta}
          </button>
        </div>
      )}

      {dialog}
    </section>
  );
}
