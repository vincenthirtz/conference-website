import { useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabaseClient } from '@/utils/supabase';

type Props = {
  user: User;
  displayName: string;
};

export default function ProfileCard({ user, displayName }: Props) {
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

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === user.email) return;

    setEmailChanging(true);
    setEmailError(null);
    setEmailSuccess(null);

    try {
      const { error } = await supabaseClient.auth.updateUser({ email: newEmail });
      if (error) throw error;

      setEmailSuccess(
        'Un email de confirmation a été envoyé à ta nouvelle adresse. Clique sur le lien pour confirmer le changement.'
      );
      setNewEmail('');
    } catch (err: any) {
      console.error('[player] email change error:', err);
      setEmailError(err?.message || "Erreur lors du changement d'email.");
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
    } catch (err: any) {
      console.error('[player] password change error:', err);
      setPasswordError(
        err?.message || 'Erreur lors du changement de mot de passe.'
      );
    } finally {
      setPasswordChanging(false);
    }
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-6">
      <h2 className="text-lg font-semibold mb-4">Mon profil</h2>
      <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-400">Email</span>
          <span>{user.email}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Nom affiché</span>
          <span>{displayName}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-400">Rôle</span>
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
    </div>
  );
}
