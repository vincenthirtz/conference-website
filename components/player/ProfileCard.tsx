import { useState } from 'react';
import { useRouter } from 'next/router';
import type { User } from '@supabase/supabase-js';
import { supabaseClient } from '@/utils/supabase';
import { useAdminFetch } from '@/hooks/useAdminFetch';

import { logger } from '../../utils/logger';
type Props = {
  user: User;
  displayName: string;
  onProfileUpdate?: () => void;
};

export default function ProfileCard({
  user,
  displayName,
  onProfileUpdate,
}: Props) {
  const router = useRouter();
  const { adminFetch, adminFetchJson } = useAdminFetch();

  // Profile edit state
  const [editingProfile, setEditingProfile] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(displayName);
  const [editBattleTag, setEditBattleTag] = useState(
    user.user_metadata?.battle_tag || ''
  );
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

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileError(null);
    setProfileSuccess(null);
    try {
      await adminFetchJson('/api/player/update-profile', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: editDisplayName,
          battle_tag: editBattleTag,
        }),
      });

      await supabaseClient.auth.refreshSession();
      setProfileSuccess('Profil mis a jour.');
      setEditingProfile(false);
      onProfileUpdate?.();
    } catch (err: unknown) {
      setProfileError((err as Error)?.message || 'Erreur');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === user.email) return;

    setEmailChanging(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        email: newEmail,
      });
      if (error) throw error;

      setEmailSuccess(
        'Un email de confirmation a été envoyé à ta nouvelle adresse. Clique sur le lien pour confirmer le changement.'
      );
      setNewEmail('');
    } catch (err: unknown) {
      logger.error('[player] email change error:', err);
      setEmailError(
        (err as Error)?.message || "Erreur lors du changement d'email."
      );
    } finally {
      setEmailChanging(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setPasswordError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Les mots de passe ne correspondent pas.');
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

      setPasswordSuccess('Ton mot de passe a été modifié avec succès.');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      logger.error('[player] password change error:', err);
      setPasswordError(
        (err as Error)?.message || 'Erreur lors du changement de mot de passe.'
      );
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
        throw new Error(body?.error || 'Erreur lors de l\u2019export.');
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
      setDataError((err as Error)?.message || 'Erreur lors de l\u2019export.');
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
      setDataError((err as Error)?.message || 'Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
      setDeleteConfirm(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Mon profil</h2>
        {!editingProfile && (
          <button
            onClick={() => {
              setEditDisplayName(displayName);
              setEditBattleTag(user.user_metadata?.battle_tag || '');
              setEditingProfile(true);
              setProfileSuccess(null);
              setProfileError(null);
            }}
            className="text-xs text-purple-300 hover:text-purple-200"
          >
            Modifier
          </button>
        )}
      </div>

      {profileSuccess && (
        <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
          {profileSuccess}
        </div>
      )}
      {profileError && (
        <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
          {profileError}
        </div>
      )}

      {editingProfile ? (
        <div className="space-y-3 text-sm">
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Nom affiche
            </label>
            <input
              type="text"
              value={editDisplayName}
              onChange={(e) => setEditDisplayName(e.target.value)}
              maxLength={50}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
              placeholder="Ton pseudo"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              BattleTag
            </label>
            <input
              type="text"
              value={editBattleTag}
              onChange={(e) => setEditBattleTag(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm font-mono placeholder:text-gray-500"
              placeholder="Pseudo#1234"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleProfileSave}
              disabled={profileSaving}
              className="flex-1 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-sm font-medium transition"
            >
              {profileSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button
              onClick={() => setEditingProfile(false)}
              disabled={profileSaving}
              className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm transition"
            >
              Annuler
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Email</span>
            <span>{user.email}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Nom affiche</span>
            <span>{displayName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Role</span>
            <span className="capitalize">
              {user.user_metadata?.role || 'player'}
            </span>
          </div>
          {user.user_metadata?.battle_tag && (
            <div className="flex justify-between">
              <span className="text-gray-400">BattleTag</span>
              <span className="font-mono">{user.user_metadata.battle_tag}</span>
            </div>
          )}
        </div>
      )}

      {/* Changer d'email */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <h3 className="text-sm font-medium mb-3">Changer d&apos;email</h3>

        {emailSuccess && (
          <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {emailSuccess}
          </div>
        )}
        {emailError && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {emailError}
          </div>
        )}

        <form onSubmit={handleEmailChange} className="space-y-3">
          <input
            type="email"
            placeholder="Nouvel email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
            required
          />
          <button
            type="submit"
            disabled={emailChanging || !newEmail || newEmail === user.email}
            className="w-full px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            {emailChanging ? 'Envoi en cours...' : 'Changer mon email'}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">
          Un email de confirmation sera envoyé à la nouvelle adresse.
        </p>
      </div>

      {/* Changer de mot de passe */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <h3 className="text-sm font-medium mb-3">Changer de mot de passe</h3>

        {passwordSuccess && (
          <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
            {passwordSuccess}
          </div>
        )}
        {passwordError && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {passwordError}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="space-y-3">
          <input
            type="password"
            placeholder="Nouveau mot de passe"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
            minLength={8}
            required
          />
          <input
            type="password"
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500/50 focus:outline-none text-sm placeholder:text-gray-500"
            minLength={8}
            required
          />
          <button
            type="submit"
            disabled={passwordChanging || !newPassword || !confirmPassword}
            className="w-full px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
          >
            {passwordChanging ? 'Modification...' : 'Changer mon mot de passe'}
          </button>
        </form>
        <p className="text-xs text-gray-500 mt-2">Minimum 8 caractères.</p>
      </div>

      {/* Mes données — export & suppression */}
      <div className="mt-6 pt-4 border-t border-white/10">
        <h3 className="text-sm font-medium mb-3">Mes données</h3>

        {dataError && (
          <div className="mb-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {dataError}
          </div>
        )}

        {!exportConfirm ? (
          <button
            onClick={() => setExportConfirm(true)}
            disabled={exporting}
            className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 hover:border-purple-500/50 hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed text-sm transition mb-3"
          >
            {exporting ? 'Export en cours...' : 'Télécharger mes données'}
          </button>
        ) : (
          <div className="rounded-lg border border-purple-500/40 bg-purple-500/10 p-3 space-y-3 mb-3">
            <p className="text-xs text-purple-200">
              Un fichier <strong>mes-donnees.json</strong> contenant toutes tes
              informations personnelles (compte, équipes, demandes) sera
              téléchargé.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setExportConfirm(false);
                  handleExportData();
                }}
                disabled={exporting}
                className="flex-1 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {exporting
                  ? 'Export en cours...'
                  : 'Confirmer le téléchargement'}
              </button>
              <button
                onClick={() => setExportConfirm(false)}
                className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm transition"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 mb-4">
          Récupère toutes tes informations personnelles au format JSON (droit
          d&apos;accès RGPD).
        </p>

        {!deleteConfirm ? (
          <button
            onClick={() => setDeleteConfirm(true)}
            className="w-full px-3 py-2 rounded-lg border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-300 text-sm transition"
          >
            Supprimer mon compte
          </button>
        ) : (
          <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 space-y-3">
            <p className="text-xs text-red-200">
              Cette action est <strong>irréversible</strong>. Toutes tes
              données, ton appartenance à une équipe et tes demandes seront
              définitivement supprimées.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium transition"
              >
                {deleting ? 'Suppression...' : 'Confirmer la suppression'}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm transition"
              >
                Annuler
              </button>
            </div>
          </div>
        )}

        <p className="text-xs text-gray-500 mt-2">
          Droit à l&apos;oubli RGPD — ton compte et toutes tes données seront
          supprimés définitivement.
        </p>
      </div>
    </div>
  );
}
