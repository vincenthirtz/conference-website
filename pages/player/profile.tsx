// pages/player/profile.tsx
// Espace joueur — page dediee "Mon profil" (resume + edition + RGPD).
// La logique metier est reprise telle quelle de l'ancien ProfileCard.

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useT } from '@/lib/i18n/useT';
import { useLang } from '@/lib/i18n/LanguageProvider';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

import { logger } from '../../utils/logger';

function PlayerProfile() {
  const router = useRouter();
  const t = useT('playerProfile');
  const { lang } = useLang();
  const { user, loading: authLoading } = usePlayerSession({
    redirectTo: '/login?next=/player/profile',
  });
  const { adminFetch, adminFetchJson } = useAdminFetch();

  const displayName =
    user?.user_metadata?.display_name ||
    user?.user_metadata?.full_name ||
    user?.email?.split('@')[0] ||
    t.defaultName;

  // Profile edit state
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBattleTag, setEditBattleTag] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [editingInitialized, setEditingInitialized] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Password change state
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

  // Lazily seed the edit fields once the session resolves.
  if (user && !editingInitialized) {
    setEditDisplayName(displayName);
    setEditBattleTag((user.user_metadata?.battle_tag as string) || '');
    setEditAvatarUrl((user.user_metadata?.avatar_url as string) || '');
    setEditingInitialized(true);
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      await adminFetchJson('/api/player/update-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: editDisplayName,
          battle_tag: editBattleTag,
          avatar_url: editAvatarUrl,
        }),
      });

      await supabaseClient.auth.refreshSession();
      setProfileSuccess(t.profileUpdated);
    } catch (err: unknown) {
      setProfileError((err as Error)?.message || t.genericError);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === user?.email) return;

    setEmailChanging(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        email: newEmail,
      });
      if (error) throw error;

      setEmailSuccess(t.emailConfirmSent);
      setNewEmail('');
    } catch (err: unknown) {
      logger.error('[player] email change error:', err);
      setEmailError((err as Error)?.message || t.emailChangeError);
    } finally {
      setEmailChanging(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
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
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;

      setPasswordSuccess(t.passwordChanged);
      setNewPassword('');
      setConfirmPassword('');
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
  const roleLabel = role === 'captain' ? t.roleCaptain : t.rolePlayer;
  const battleTag = (user.user_metadata?.battle_tag as string) || '—';
  const avatarUrl = (user.user_metadata?.avatar_url as string) || '';
  const initials = displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p: string) => p.charAt(0).toUpperCase())
    .join('');
  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB')
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
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt={t.avatarAlt}
                    className="w-16 h-16 rounded-xl border-2 border-purple-500/40 shadow-lg object-cover"
                  />
                ) : (
                  <span className="flex w-16 h-16 items-center justify-center rounded-xl border-2 border-purple-500/40 bg-purple-600/20 text-xl font-bold text-purple-100 shadow-lg">
                    {initials || 'J'}
                  </span>
                )}
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
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  {t.email}
                </div>
                <div className="font-medium text-sm truncate">{user.email}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  {t.battleTag}
                </div>
                <div className="font-mono text-sm truncate">{battleTag}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                  {t.createdOn}
                </div>
                <div className="font-medium text-sm">{createdAt}</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 col-span-2 md:col-span-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">
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
            {profileError && (
              <div
                id="player-profile-error"
                role="alert"
                className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                {profileError}
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
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
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
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm font-mono placeholder:text-gray-500"
                  placeholder={t.battleTagPlaceholder}
                />
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
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
                  placeholder={t.avatarPlaceholder}
                />
                <p className="text-xs text-gray-500 mt-1">{t.avatarHelp}</p>
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
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={emailChanging || !newEmail || newEmail === user.email}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {emailChanging ? t.sending : t.changeEmailBtn}
              </button>
            </form>
            <p className="text-xs text-gray-500 mt-3">{t.emailHelp}</p>
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
                  htmlFor="player-new-password"
                  className="block text-xs text-gray-400 mb-1"
                >
                  {t.newPasswordLabel}
                </label>
                <input
                  id="player-new-password"
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? 'player-password-error' : undefined
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
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
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={
                    passwordError ? 'player-password-error' : undefined
                  }
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
                  minLength={8}
                  required
                />
              </div>
              <button
                type="submit"
                disabled={passwordChanging || !newPassword || !confirmPassword}
                className="px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {passwordChanging ? t.updatingPassword : t.changePasswordBtn}
              </button>
            </form>
            <p className="text-xs text-gray-500 mt-3">{t.passwordHelp}</p>
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

            <p className="text-xs text-gray-500 mb-5">{t.dataHelp}</p>

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
                  {t.deleteWarningStart}{' '}
                  <strong>{t.deleteWarningBold}</strong>
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

            <p className="text-xs text-gray-500 mt-3">{t.deleteHelp}</p>
          </section>
        </div>
      </main>
    </div>
  );
}

const playerProfileSeo: SeoProps = {
  title: 'Mon profil',
  description:
    "Gère ton compte joueur OW Women's Cup : profil, email, mot de passe et données personnelles.",
  noindex: true,
};

PlayerProfile.seo = playerProfileSeo;

export default PlayerProfile;
