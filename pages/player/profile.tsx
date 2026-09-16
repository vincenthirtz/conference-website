// pages/player/profile.tsx
// Espace joueur — page dediee "Mon profil" (resume + edition + RGPD).
// La logique metier est reprise telle quelle de l'ancien ProfileCard.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabaseBrowser';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { AdminFetchError, useAdminFetch } from '@/hooks/useAdminFetch';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import DiscoveryCard from '@/components/player/DiscoveryCard';
import BattlenetVerifyCard from '@/components/player/BattlenetVerifyCard';
import TcgPhotoCard from '@/components/player/TcgPhotoCard';
import HeroPreferencesCard from '@/components/player/HeroPreferencesCard';
import TwitchLinkCard from '@/components/player/TwitchLinkCard';
import PlayerAvatar from '@/components/player/PlayerAvatar';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../../utils/logger';
import nsPlayerProfile from '@/lib/i18n/locales/fr/playerProfile';
import nsOverwatchRank from '@/lib/i18n/locales/fr/overwatchRank';
import nsSpecialty from '@/lib/i18n/locales/fr/specialty';
import { TWITCH_HANDLE_MAX } from '@/utils/social/profileHandles';
import type { PlayerTwitchOrigin } from '@/utils/rating/readPlayerProfile';

/** Réponse de `GET /api/player/update-profile`. */
type TwitchSourceResponse = {
  twitch: string | null;
  twitchOrigin: PlayerTwitchOrigin | null;
};

/** Réponse de `PATCH /api/player/update-profile` (champs lus ici). */
type UpdateProfileResponse = { success: boolean; rosterSynced?: boolean };

function PlayerProfile() {
  const router = useRouter();
  const t = useT(nsPlayerProfile);
  const tRank = useT(nsOverwatchRank);
  const tSpec = useT(nsSpecialty);
  const locale = useLocale();
  const { user, loading: authLoading } = usePlayerSession({
    redirectTo: '/login?next=/player/profile',
  });
  const { adminFetch, adminFetchJson } = useAdminFetch({ loginPath: '/login' });

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    t.defaultName;

  // Profile edit state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBattleTag, setEditBattleTag] = useState('');
  const [editSkillRating, setEditSkillRating] = useState('');
  const [editSpecialty, setEditSpecialty] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editTwitch, setEditTwitch] = useState('');
  // Chaîne Twitch PUBLIÉE et son origine, lues côté serveur (GET
  // /api/player/update-profile). POURQUOI : la fiche publique retombe sur la
  // valeur saisie par la capitaine sur le roster ; initialiser le champ depuis
  // les seules métadonnées du compte le laissait VIDE pendant que la fiche
  // affichait un bouton Twitch — la joueuse ne pouvait ni le voir ni le retirer.
  // `twitchInitial` sert aussi de référence : on n'envoie `twitch` que si elle
  // l'a changé, pour ne jamais transformer en silence la saisie de la
  // capitaine en déclaration de la joueuse.
  const [twitchInitial, setTwitchInitial] = useState('');
  const [twitchOrigin, setTwitchOrigin] = useState<PlayerTwitchOrigin | null>(
    null
  );
  const [twitchSourceError, setTwitchSourceError] = useState(false);
  const [twitchRemoving, setTwitchRemoving] = useState(false);
  const [profileWarning, setProfileWarning] = useState<string | null>(null);
  const [editingInitialized, setEditingInitialized] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [emailCurrentPassword, setEmailCurrentPassword] = useState('');
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password change state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Data management state
  const [exporting, setExporting] = useState(false);
  const [exportConfirm, setExportConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  // Seed the edit fields once the session resolves. Kept in an effect (rather
  // than a setState-during-render guarded by a flag) so React never re-renders
  // mid-commit; the `editingInitialized` flag still ensures it runs only once.
  useEffect(() => {
    if (user && !editingInitialized) {
      setEditDisplayName(displayName);
      setEditBattleTag((user.user_metadata?.battle_tag as string) || '');
      setEditSkillRating(
        user.user_metadata?.skill_rating != null
          ? String(user.user_metadata.skill_rating)
          : ''
      );
      setEditSpecialty((user.user_metadata?.specialty as string) || '');
      // Valeur provisoire, remplacée par la valeur effective dès que la
      // lecture serveur répond (effet ci-dessous).
      const declaredTwitch = (user.user_metadata?.twitch as string) || '';
      setEditTwitch(declaredTwitch);
      setTwitchInitial(declaredTwitch);
      setTwitchOrigin(declaredTwitch.trim() ? 'self' : null);
      setEditAvatarUrl((user.user_metadata?.avatar_url as string) || '');
      setEditingInitialized(true);
    }
  }, [user, editingInitialized, displayName]);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    adminFetchJson<TwitchSourceResponse>('/api/player/update-profile')
      .then((body) => {
        if (cancelled) return;
        const value = body.twitch ?? '';
        setEditTwitch(value);
        setTwitchInitial(value);
        setTwitchOrigin(body.twitchOrigin ?? null);
        setTwitchSourceError(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        logger.error('[player] twitch source read error:', err);
        setTwitchSourceError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, adminFetchJson]);

  /** Message à montrer pour une erreur d'enregistrement du profil. */
  const profileErrorMessage = (err: unknown): string => {
    if (
      err instanceof AdminFetchError &&
      (err.payload as { code?: unknown } | null)?.code ===
        'AVATAR_HOST_UNSUPPORTED'
    ) {
      return t.avatarHostUnsupported;
    }
    return (err as Error)?.message || t.genericError;
  };

  // Arrivee depuis la liaison Discord : ce flux ne demande jamais de BattleTag
  // (pages/auth/discord-member.tsx ne pose que `role`), et sans lui la fiche de
  // roster nait vide. On amene donc ici, champ en avant, plutot que de laisser
  // la personne le decouvrir plus tard sous forme de « BattleTag manquant ».
  const needsBattleTagSetup =
    router.query.setup === 'battletag' &&
    !((user?.user_metadata?.battle_tag as string) || '').trim();

  useEffect(() => {
    if (!needsBattleTagSetup || !editingInitialized) return;
    const field = document.getElementById('player-battle-tag');
    field?.scrollIntoView({ block: 'center' });
    (field as HTMLInputElement | null)?.focus();
  }, [needsBattleTagSetup, editingInitialized]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    setProfileWarning(null);
    const nextTwitch = editTwitch.trim();
    const twitchChanged = nextTwitch !== twitchInitial.trim();
    try {
      const body = await adminFetchJson<UpdateProfileResponse>(
        '/api/player/update-profile',
        {
          method: 'PATCH',
          body: JSON.stringify({
            display_name: editDisplayName,
            battle_tag: editBattleTag,
            // Chaîne vide = effacer : c'est ainsi qu'on retire un niveau qu'on
            // ne veut plus afficher.
            skill_rating: editSkillRating.trim() || null,
            // Chaîne vide = effacer le poste ; une valeur inconnue serait
            // refusée par l'API plutôt que ramenée à null en douce.
            specialty: editSpecialty || null,
            // Twitch : seulement si elle l'a CHANGÉ. Vider le champ est une
            // demande de retrait du lien publié, roster compris.
            ...(twitchChanged
              ? nextTwitch
                ? { twitch: nextTwitch }
                : { twitch: null, clear_twitch: true }
              : {}),
            avatar_url: editAvatarUrl,
          }),
        }
      );

      if (twitchChanged) {
        setTwitchInitial(nextTwitch);
        setTwitchOrigin(nextTwitch ? 'self' : null);
      }
      await supabaseClient.auth.refreshSession();
      setProfileSuccess(t.profileUpdated);
      if (body?.rosterSynced === false) setProfileWarning(t.rosterSyncWarning);
    } catch (err: unknown) {
      setProfileError(profileErrorMessage(err));
    } finally {
      setProfileSaving(false);
    }
  };

  // Retire le lien Twitch PUBLIÉ, y compris celui saisi par la capitaine :
  // `clear_twitch` efface aussi la fiche de roster, là où un simple champ vide
  // la protège.
  const handleTwitchRemove = async () => {
    setTwitchRemoving(true);
    setProfileError(null);
    setProfileSuccess(null);
    setProfileWarning(null);
    try {
      const body = await adminFetchJson<UpdateProfileResponse>(
        '/api/player/update-profile',
        {
          method: 'PATCH',
          body: JSON.stringify({ clear_twitch: true }),
        }
      );
      setEditTwitch('');
      setTwitchInitial('');
      setTwitchOrigin(null);
      await supabaseClient.auth.refreshSession();
      setProfileSuccess(t.twitchRemoved);
      if (body?.rosterSynced === false) setProfileWarning(t.rosterSyncWarning);
    } catch (err: unknown) {
      setProfileError(profileErrorMessage(err));
    } finally {
      setTwitchRemoving(false);
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === user?.email) return;
    if (!emailCurrentPassword) {
      setEmailError(t.currentPasswordRequired);
      return;
    }

    setEmailChanging(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      // Re-authenticate before any sensitive change: a hijacked session
      // (JWT in localStorage) must not be able to take over the account by
      // silently swapping the email. We require the current password.
      const { error: reauthError } =
        await supabaseClient.auth.signInWithPassword({
          email: user?.email ?? '',
          password: emailCurrentPassword,
        });
      if (reauthError) {
        setEmailError(t.wrongCurrentPassword);
        return;
      }

      const { error } = await supabaseClient.auth.updateUser({
        email: newEmail,
      });
      if (error) throw error;

      setEmailSuccess(t.emailConfirmSent);
      setNewEmail('');
      setEmailCurrentPassword('');
    } catch (err: unknown) {
      logger.error('[player] email change error:', err);
      setEmailError((err as Error)?.message || t.emailChangeError);
    } finally {
      setEmailChanging(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setPasswordError(t.currentPasswordRequired);
      return;
    }
    if (!newPassword || newPassword.length < 8) {
      setPasswordError(t.passwordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(t.passwordMismatch);
      return;
    }

    setPasswordChanging(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      // Re-authenticate with the current password before changing it. Without
      // this gate, a hijacked session could lock the owner out by silently
      // rotating the password.
      const { error: reauthError } =
        await supabaseClient.auth.signInWithPassword({
          email: user?.email ?? '',
          password: currentPassword,
        });
      if (reauthError) {
        setPasswordError(t.wrongCurrentPassword);
        return;
      }

      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');

      // Revoke every other live session for this user so a hijacked token can
      // no longer be used after the legitimate owner rotates the password.
      try {
        await supabaseClient.auth.signOut({ scope: 'global' });
      } catch (signOutErr) {
        logger.error('[player] global sign-out after pwd change:', signOutErr);
      }

      setPasswordSuccess(t.signedOutAfterPasswordChange);
      // Send the user back to login to re-authenticate with the new password.
      router.replace('/login?next=/player/profile');
    } catch (err: unknown) {
      logger.error('[player] password change error:', err);
      setPasswordError((err as Error)?.message || t.passwordChangeError);
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setDataError(null);
    try {
      const resp = await adminFetch('/api/player/data-export');

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || t.exportError);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      logger.error('[player] export error:', err);
      setDataError((err as Error)?.message || t.exportError);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDataError(null);
    try {
      await adminFetchJson('/api/player/delete-account', { method: 'DELETE' });
      await supabaseClient.auth.signOut();
      router.replace('/');
    } catch (err: unknown) {
      logger.error('[player] delete account error:', err);
      setDataError((err as Error)?.message || t.deleteError);
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-3xl mx-auto px-4 py-10 pt-24">
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
        <main className="max-w-md mx-auto px-4 py-10 pt-32 text-center">
          <h1 className="text-3xl font-bold text-gradient">
            {t.signedOutTitle}
          </h1>
          <p className="mt-4 text-gray-300">{t.signedOutText}</p>
          <Link
            href="/login?next=/player/profile"
            className="mt-8 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-pink-500 to-purple-500 px-6 py-3 text-sm font-bold text-white shadow-lg shadow-purple-500/20 transition hover:brightness-110"
          >
            {t.signIn}
          </Link>
        </main>
      </div>
    );
  }

  const role = (user.user_metadata?.role as string | undefined) || 'player';
  // Mapping complet des rôles : un manager/coach/remplaçant ne doit pas retomber
  // silencieusement sur « Joueuse ».
  const roleLabels: Record<string, string> = {
    captain: t.roleCaptain,
    player: t.rolePlayer,
    manager: t.roleManager,
    coach: t.roleCoach,
    substitute: t.roleSubstitute,
    supporter: t.roleSupporter,
  };
  const roleLabel = roleLabels[role] ?? t.rolePlayer;
  const battleTag = (user.user_metadata?.battle_tag as string) || '—';
  const avatarUrl = (user.user_metadata?.avatar_url as string) || '';
  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleString(locale)
    : '—';

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-[#050509] to-black text-white">
      <main className="max-w-3xl mx-auto px-4 py-10 pt-24 pb-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 text-sm text-gray-400">
            <Link href="/player" className="hover:text-white transition">
              &larr; {t.backToDashboard}
            </Link>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-gradient mt-2">
            {t.pageTitle}
          </h1>
          <p className="text-sm text-gray-400 mt-2">{t.pageSubtitle}</p>
        </div>

        <div className="space-y-6">
          {/* Résumé du compte */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
              <div className="flex items-center gap-4">
                {/* PlayerAvatar plutôt qu'un `<img>` nu : optimisé quand l'hôte
                    est déclaré, et repli sur l'initiale si l'image échoue au
                    lieu d'une pastille cassée. Décoratif : le nom est écrit
                    juste à côté. */}
                <PlayerAvatar
                  avatarUrl={avatarUrl || null}
                  teamName={null}
                  teamSlug={null}
                  teamLogoUrl={null}
                  label={displayName}
                  size={64}
                  className="h-16 w-16 border-2 border-purple-500/40 shadow-lg"
                  initialsClassName="text-xl"
                />
                <div>
                  <h2 className="text-2xl font-bold">{displayName}</h2>
                  <span className="inline-block mt-1 px-3 py-1 rounded-full text-sm font-semibold bg-purple-600/20 text-purple-200 border border-purple-500/30">
                    {roleLabel}
                  </span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  {t.email}
                </div>
                <div className="font-medium text-sm truncate">{user.email}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  {t.battleTag}
                </div>
                <div className="font-mono text-sm truncate">{battleTag}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  {t.createdOn}
                </div>
                <div className="font-medium text-sm">{createdAt}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 col-span-2 md:col-span-3">
                <div className="text-xs text-gray-400 uppercase tracking-wider mb-1">
                  {t.userId}
                </div>
                <div className="font-mono text-xs text-gray-300 break-all">
                  {user.id}
                </div>
              </div>
            </div>
          </section>

          {/* Modifier mon profil */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h2 className="text-lg font-semibold mb-4">{t.editProfile}</h2>

            {profileSuccess && (
              <div
                id="player-profile-success"
                aria-live="polite"
                className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
              >
                {profileSuccess}
              </div>
            )}
            {profileWarning && (
              <div
                id="player-profile-warning"
                role="status"
                className="mb-4 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs text-amber-100"
              >
                {profileWarning}
              </div>
            )}
            {profileError && (
              <div
                id="player-profile-error"
                role="alert"
                className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                {profileError}
              </div>
            )}

            {needsBattleTagSetup && (
              <div className="mb-4 rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3">
                <p className="text-sm font-semibold text-amber-100">
                  {t.setupBattleTagTitle}
                </p>
                <p className="mt-1 text-xs text-amber-100/80">
                  {t.setupBattleTagBody}
                </p>
              </div>
            )}

            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <label
                  htmlFor="player-display-name"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.displayNameLabel}
                </label>
                <input
                  id="player-display-name"
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  maxLength={50}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  placeholder={t.displayNamePlaceholder}
                />
              </div>
              <div>
                <label
                  htmlFor="player-battle-tag"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.battleTag}
                </label>
                <input
                  id="player-battle-tag"
                  type="text"
                  value={editBattleTag}
                  onChange={(e) => setEditBattleTag(e.target.value)}
                  className={`w-full px-3 py-2 rounded-lg bg-white/5 border focus:outline-none text-sm font-mono placeholder:text-gray-400 ${
                    needsBattleTagSetup
                      ? 'border-amber-400/60 ring-2 ring-amber-400/30 focus:border-amber-300'
                      : 'border-white/10 focus:border-purple-500/50'
                  }`}
                  placeholder={t.battleTagPlaceholder}
                />
              </div>
              <div>
                <label
                  htmlFor="player-specialty"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {tSpec.fieldLabel}
                </label>
                <select
                  id="player-specialty"
                  value={editSpecialty}
                  onChange={(e) => setEditSpecialty(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm"
                >
                  <option value="">{tSpec.none}</option>
                  <option value="tank">{tSpec.tank}</option>
                  <option value="dps">{tSpec.dps}</option>
                  <option value="support">{tSpec.support}</option>
                  <option value="flex">{tSpec.flex}</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">{tSpec.fieldHint}</p>
              </div>
              <div>
                <label
                  htmlFor="player-skill-rating"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {tRank.fieldLabel}
                </label>
                <input
                  id="player-skill-rating"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={5000}
                  step={50}
                  value={editSkillRating}
                  onChange={(e) => setEditSkillRating(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  placeholder={tRank.fieldPlaceholder}
                />
                <p className="text-xs text-gray-400 mt-1">{tRank.fieldHint}</p>
              </div>
              <div>
                <label
                  htmlFor="player-twitch"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.twitchLabel}
                </label>
                <input
                  id="player-twitch"
                  type="text"
                  value={editTwitch}
                  onChange={(e) => setEditTwitch(e.target.value)}
                  maxLength={TWITCH_HANDLE_MAX}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  placeholder={t.twitchPlaceholder}
                  aria-describedby={
                    twitchOrigin === 'roster' && twitchInitial.trim()
                      ? 'player-twitch-origin player-twitch-help'
                      : 'player-twitch-help'
                  }
                />
                {twitchOrigin === 'roster' && twitchInitial.trim() ? (
                  <p
                    id="player-twitch-origin"
                    className="mt-1 text-xs text-amber-200"
                  >
                    {t.twitchFromRoster}
                  </p>
                ) : null}
                {twitchSourceError ? (
                  <p role="alert" className="mt-1 text-xs text-red-300">
                    {t.twitchSourceError}
                  </p>
                ) : null}
                {twitchInitial.trim() ? (
                  <button
                    type="button"
                    onClick={handleTwitchRemove}
                    disabled={twitchRemoving || profileSaving}
                    className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-200 transition hover:bg-red-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {twitchRemoving ? t.twitchRemoving : t.twitchRemove}
                  </button>
                ) : null}
                <p
                  id="player-twitch-help"
                  className="text-xs text-gray-400 mt-1"
                >
                  {t.twitchHelp}
                </p>
              </div>
              <div>
                <label
                  htmlFor="player-avatar-url"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.avatarLabel}
                </label>
                <input
                  id="player-avatar-url"
                  type="url"
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  placeholder={t.avatarPlaceholder}
                />
                <p className="text-xs text-gray-400 mt-1">{t.avatarHelp}</p>
              </div>
              <button
                type="submit"
                disabled={profileSaving}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {profileSaving ? t.saving : t.save}
              </button>
            </form>
          </section>

          {/* Découverte / Réseau joueurs — opt-in global, invisible par défaut */}
          <DiscoveryCard />

          {/* Vérifier mon BattleTag (Battle.net OAuth) — la carte gère elle-même
              l'état (statut, toast de retour) et ne rend rien si la feature est
              dormante. Même composant que l'onboarding post-création d'équipe. */}
          <BattlenetVerifyCard variant="section" />

          {/* Mon compte Twitch — placée AVANT les deux cartes TCG parce qu'elle
              en est la condition d'accès : sans ce lien prouvé par OAuth, une
              carte réclamée pendant un direct n'a aucun destinataire. Ne rend
              rien si la fonctionnalité est dormante. */}
          <TwitchLinkCard />

          {/* Mes héros — placée AVANT la carte à collectionner parce qu'elle en
              est le repli : le héros préféré ne sert que si aucune photo n'est
              déposée. Lire l'ordre de haut en bas, c'est lire cette règle. */}
          <HeroPreferencesCard />

          {/* Ma carte à collectionner (TCG) — la carte porte son propre état et
              ne rend RIEN tant qu'elle n'a pas pu lire celui-ci : mieux vaut
              une section absente qu'un « aucune photo » affiché à tort à une
              joueuse qui en a déposé une. */}
          <TcgPhotoCard />

          {/* Changer mon email */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h2 className="text-lg font-semibold mb-4">{t.changeEmail}</h2>

            {emailSuccess && (
              <div
                id="player-email-success"
                aria-live="polite"
                className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
              >
                {emailSuccess}
              </div>
            )}
            {emailError && (
              <div
                id="player-email-error"
                role="alert"
                className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                {emailError}
              </div>
            )}

            <form onSubmit={handleEmailChange} className="space-y-4">
              <div>
                <label
                  htmlFor="player-email-current-password"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.currentPasswordLabel}
                </label>
                <input
                  id="player-email-current-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t.currentPasswordPlaceholder}
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={
                    emailError ? 'player-email-error' : undefined
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="player-new-email"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.newEmailLabel}
                </label>
                <input
                  id="player-new-email"
                  type="email"
                  placeholder={t.newEmailPlaceholder}
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={
                    emailError ? 'player-email-error' : undefined
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={
                  emailChanging ||
                  !newEmail ||
                  newEmail === user.email ||
                  !emailCurrentPassword
                }
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {emailChanging ? t.sending : t.changeEmailBtn}
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-3">{t.emailHelp}</p>
          </section>

          {/* Changer mon mot de passe */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h2 className="text-lg font-semibold mb-4">{t.changePassword}</h2>

            {passwordSuccess && (
              <div
                id="player-password-success"
                aria-live="polite"
                className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200"
              >
                {passwordSuccess}
              </div>
            )}
            {passwordError && (
              <div
                id="player-password-error"
                role="alert"
                className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                {passwordError}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label
                  htmlFor="player-current-password"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.currentPasswordLabel}
                </label>
                <input
                  id="player-current-password"
                  type="password"
                  autoComplete="current-password"
                  placeholder={t.currentPasswordPlaceholder}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? 'player-password-error' : undefined
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="player-new-password"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.newPasswordLabel}
                </label>
                <input
                  id="player-new-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? 'player-password-error' : undefined
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label
                  htmlFor="player-confirm-password"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.confirmPasswordLabel}
                </label>
                <input
                  id="player-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? 'player-password-error' : undefined
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-400"
                  minLength={8}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={
                  passwordChanging ||
                  !currentPassword ||
                  !newPassword ||
                  !confirmPassword
                }
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {passwordChanging ? t.updatingPassword : t.changePasswordBtn}
              </button>
            </form>
            <p className="text-xs text-gray-400 mt-3">{t.passwordHelp}</p>
            <p className="text-xs text-gray-400 mt-1">{t.reauthHelp}</p>
          </section>

          {/* Mes données — export & suppression */}
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
            <h2 className="text-lg font-semibold mb-4">{t.myData}</h2>

            {dataError && (
              <div
                id="player-data-error"
                role="alert"
                className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                {dataError}
              </div>
            )}

            {!exportConfirm ? (
              <button
                onClick={() => setExportConfirm(true)}
                disabled={exporting}
                className="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition mb-3"
              >
                {exporting ? t.exporting : t.downloadData}
              </button>
            ) : (
              <div className="rounded-xl border border-purple-500/40 bg-purple-500/10 p-4 space-y-3 mb-3">
                <p className="text-xs text-purple-200">
                  {t.aFile} <strong>mes-donnees.json</strong>{' '}
                  {t.exportConfirmText}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setExportConfirm(false);
                      handleExportData();
                    }}
                    disabled={exporting}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
                  >
                    {exporting ? t.exporting : t.confirmDownload}
                  </button>
                  <button
                    onClick={() => setExportConfirm(false)}
                    className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm transition"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 mb-5">{t.dataHelp}</p>

            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="w-full px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm font-medium transition"
              >
                {t.deleteAccount}
              </button>
            ) : (
              <div className="rounded-xl border border-red-500/40 bg-red-900/30 p-4 space-y-3">
                <p className="text-sm text-red-200">
                  {t.deleteWarningStart} <strong>{t.deleteWarningBold}</strong>
                  {t.deleteWarningEnd}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
                  >
                    {deleting ? t.deleting : t.confirmDelete}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    disabled={deleting}
                    className="px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-sm transition"
                  >
                    {t.cancel}
                  </button>
                </div>
              </div>
            )}

            <p className="text-xs text-gray-400 mt-3">{t.deleteHelp}</p>
          </section>
        </div>
      </main>
    </div>
  );
}

const playerProfileSeo: SeoProps = {
  title: {
    fr: 'Mon profil',
    en: 'My profile',
  },
  description: {
    fr: "Gère ton compte joueur OW Women's Cup : profil, email, mot de passe et données personnelles.",
    en: "Manage your OW Women's Cup player account: profile, email, password and personal data.",
  },
  noindex: true,
};

PlayerProfile.seo = playerProfileSeo;

export default PlayerProfile;
