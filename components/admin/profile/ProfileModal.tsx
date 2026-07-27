import Link from 'next/link';
import { ReactNode, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabaseClient } from '@/utils/supabase';
import { useToast } from '@/components/Toast';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useStaffSession } from '@/hooks/useStaffSession';
import { useAdminT } from '@/lib/i18n/useAdminT';
import Modal from '@/components/admin/Modal';
import ConfirmDialog from '@/components/admin/ConfirmDialog';
import Tabs, { tabButtonId, tabPanelId } from '@/components/admin/Tabs';
import BattlenetVerifyCard from '@/components/player/BattlenetVerifyCard';

import { logger } from '@/utils/logger';

type StaffProfile = {
  id: string;
  auth_user_id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
};

type ProfileModalProps = {
  open: boolean;
  onClose: () => void;
};

type TabId = 'profile' | 'security' | 'privacy';
type Accent = 'purple' | 'blue' | 'amber' | 'emerald' | 'red' | 'gray';

const TAB_ID_BASE = 'admin-profile';

// Accents alignés sur StatCard / le dashboard admin (anneau + dégradé).
const ACCENT_RING: Record<Accent, string> = {
  purple: 'ring-purple-500/30 from-purple-500/10',
  blue: 'ring-blue-500/30 from-blue-500/10',
  amber: 'ring-amber-500/30 from-amber-500/10',
  emerald: 'ring-emerald-500/30 from-emerald-500/10',
  red: 'ring-red-500/30 from-red-500/10',
  gray: 'ring-white/10 from-white/[0.06]',
};
const ACCENT_TEXT: Record<Accent, string> = {
  purple: 'text-purple-300',
  blue: 'text-blue-300',
  amber: 'text-amber-300',
  emerald: 'text-emerald-300',
  red: 'text-red-300',
  gray: 'text-neutral-300',
};

const inputClass =
  'w-full px-3 py-2.5 rounded-xl bg-neutral-950/50 border border-white/10 focus:outline-none focus:ring-2 focus:ring-purple-500/70 text-sm text-white placeholder:text-neutral-500 transition-shadow';
const labelClass = 'block text-sm font-medium text-neutral-200 mb-1.5';
const helpClass = 'text-xs text-neutral-400';
const primaryBtnClass =
  'px-6 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-semibold flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/60';
const spinnerClass =
  'w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin';

// Bannière d'erreur réutilisable (mutualise l'icône + le style rouge).
function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/50 bg-red-900/40 px-4 py-3 text-sm text-red-100">
      <svg
        className="w-5 h-5 text-red-400 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
          clipRule="evenodd"
        />
      </svg>
      {message}
    </div>
  );
}

// Carte de section — reprend le motif dashboard (anneau + dégradé d'accent).
function SectionCard({
  title,
  icon,
  accent = 'gray',
  children,
}: {
  title: string;
  icon: ReactNode;
  accent?: Accent;
  children: ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl bg-neutral-900/40 bg-gradient-to-br to-transparent ring-1 p-6 ${ACCENT_RING[accent]}`}
    >
      <h3 className="mb-4 flex items-center gap-2.5 text-base font-semibold text-white">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/10 ${ACCENT_TEXT[accent]}`}
        >
          {icon}
        </span>
        {title}
      </h3>
      {children}
    </section>
  );
}

// Tuile clé/valeur façon StatCard.
function InfoTile({
  label,
  children,
  className = '',
  mono = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  mono?: boolean;
}) {
  return (
    <div
      className={`rounded-xl bg-neutral-900/50 ring-1 ring-white/10 p-4 ${className}`}
    >
      <div className="mb-1 text-[10px] font-medium uppercase tracking-widest text-neutral-400">
        {label}
      </div>
      <div
        className={
          mono
            ? 'font-mono text-xs text-neutral-300 break-all'
            : 'text-sm font-medium text-white'
        }
      >
        {children}
      </div>
    </div>
  );
}

function ProfileModal({ open, onClose }: ProfileModalProps) {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('profile');
  const [form, setForm] = useState({
    displayName: '',
    avatarUrl: '',
  });

  // Email change state
  const [newEmail, setNewEmail] = useState('');
  const [emailChanging, setEmailChanging] = useState(false);
  const [emailErrorMsg, setEmailErrorMsg] = useState<string | null>(null);

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChanging, setPasswordChanging] = useState(false);
  const [passwordErrorMsg, setPasswordErrorMsg] = useState<string | null>(null);

  // Data management state
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const { addToast } = useToast();
  const { adminFetch, adminFetchJson } = useAdminFetch();
  const { staffName, staffRole } = useStaffSession();
  const router = useRouter();
  const t = useAdminT('adminProfile');

  // Ne charge les données du profil qu'à l'ouverture de la modale (le fetch se
  // (re)déclenche à chaque passage `open` false -> true).
  useEffect(() => {
    if (!open) return;

    setActiveTab('profile');

    const fetchProfile = async () => {
      setLoading(true);
      setErrorMsg(null);

      try {
        const json = await adminFetchJson<StaffProfile>('/api/admin/me');

        setProfile(json);
        setForm({
          displayName: json.display_name || '',
          avatarUrl: json.avatar_url || '',
        });
      } catch (err: unknown) {
        logger.error('ProfileModal: profile fetch error', err);
        setErrorMsg((err as Error)?.message || t.errorUnexpected);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
    // adminFetchJson/t ont une identité stable → l'effet ne (re)déclenche
    // qu'au passage `open` false -> true (comportement inchangé).
  }, [open, adminFetchJson, t]);

  const updateField = (k: 'displayName' | 'avatarUrl', v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  const handleEmailChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail || newEmail === profile?.email) return;

    setEmailChanging(true);
    setEmailErrorMsg(null);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        email: newEmail,
      });

      if (error) {
        throw error;
      }

      addToast(t.toastEmailSent, 'success');
      setNewEmail('');
    } catch (err: unknown) {
      logger.error('ProfileModal: email change error', err);
      setEmailErrorMsg((err as Error)?.message || t.errorEmailChange);
    } finally {
      setEmailChanging(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 8) {
      setPasswordErrorMsg(t.errorPasswordTooShort);
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordErrorMsg(t.errorPasswordMismatch);
      return;
    }

    setPasswordChanging(true);
    setPasswordErrorMsg(null);

    try {
      const { error } = await supabaseClient.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        throw error;
      }

      addToast(t.toastPasswordChanged, 'success');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      logger.error('ProfileModal: password change error', err);
      setPasswordErrorMsg((err as Error)?.message || t.errorPasswordChange);
    } finally {
      setPasswordChanging(false);
    }
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrorMsg(null);

    try {
      const json = await adminFetchJson<StaffProfile>('/api/admin/me', {
        method: 'PATCH',
        body: JSON.stringify({
          displayName: form.displayName,
          avatarUrl: form.avatarUrl,
        }),
      });

      setProfile(json);
      setForm({
        displayName: json.display_name || '',
        avatarUrl: json.avatar_url || '',
      });
      addToast(t.toastProfileUpdated, 'success');
    } catch (err: unknown) {
      logger.error('ProfileModal: profile update error', err);
      setErrorMsg((err as Error)?.message || t.errorUnexpected);
    } finally {
      setSaving(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setDataError(null);
    try {
      const resp = await adminFetch('/api/player/data-export');

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || t.errorExport);
      }

      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'mes-donnees.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      logger.error('ProfileModal: export error', err);
      setDataError((err as Error)?.message || t.errorExport);
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    setDataError(null);
    try {
      const resp = await adminFetch('/api/player/delete-account', {
        method: 'DELETE',
      });

      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        throw new Error(body?.error || t.errorDelete);
      }

      await supabaseClient.auth.signOut();
      router.replace('/');
    } catch (err: unknown) {
      logger.error('ProfileModal: delete account error', err);
      setDataError((err as Error)?.message || t.errorDelete);
    } finally {
      setDeleting(false);
    }
  };

  const displayName =
    profile?.display_name ?? staffName ?? t.defaultDisplayName;
  const email = profile?.email ?? '—';
  const roleLabel = formatRoleLabel(profile?.role ?? staffRole ?? '');
  const staffId = profile?.id ?? '—';
  const authUserId = profile?.auth_user_id ?? '—';
  const createdAt = profile?.created_at
    ? new Date(profile.created_at).toLocaleString()
    : '—';

  const tabItems = [
    {
      id: 'profile',
      label: (
        <span className="inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          {t.tabProfile}
        </span>
      ),
    },
    {
      id: 'security',
      label: (
        <span className="inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          {t.tabSecurity}
        </span>
      ),
    },
    {
      id: 'privacy',
      label: (
        <span className="inline-flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          {t.tabPrivacy}
        </span>
      ),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="2xl"
      title={t.heading}
      subtitle={t.subtitle}
      panelChromeClassName="bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 border border-white/10 rounded-2xl shadow-2xl"
    >
      <div className="space-y-6">
        {errorMsg && <ErrorBanner message={errorMsg} />}

        {/* Hero identité — carte d'accent violet, toujours visible */}
        <section className="relative overflow-hidden rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/15 via-neutral-900/30 to-neutral-900/30 p-6">
          <div
            className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-purple-500/20 blur-3xl"
            aria-hidden="true"
          />
          <div className="relative flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4 min-w-0">
              {profile?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profile.avatar_url}
                  alt={t.avatarAlt}
                  className="w-16 h-16 rounded-2xl border border-white/10 shadow-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl border border-white/10 bg-gradient-to-br from-purple-500/40 to-purple-700/40 shadow-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl font-bold text-white">
                    {displayName.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-2xl font-bold text-white truncate">
                  {displayName}
                </h2>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide bg-purple-500/20 text-purple-200 border border-purple-400/30">
                    {roleLabel}
                  </span>
                  <span className="text-sm text-neutral-300 truncate">
                    {email}
                  </span>
                </div>
              </div>
            </div>
            <Link
              href="/admin/logout"
              className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-200 transition-colors hover:bg-red-500/20"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              {t.logout}
            </Link>
          </div>
        </section>

        {/* Onglets — composant partagé (soulignement violet dashboard) */}
        <Tabs
          tabs={tabItems}
          active={activeTab}
          onChange={(id) => setActiveTab(id as TabId)}
          ariaLabel={t.heading}
          idBase={TAB_ID_BASE}
        />

        {loading && (
          <div className="flex items-center justify-center py-10">
            <div className="w-8 h-8 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          </div>
        )}

        {/* ─── Profil ─── */}
        {!loading && activeTab === 'profile' && (
          <div
            role="tabpanel"
            id={tabPanelId(TAB_ID_BASE, 'profile')}
            aria-labelledby={tabButtonId(TAB_ID_BASE, 'profile')}
            className="space-y-6"
          >
            <SectionCard
              accent="purple"
              title={t.editHeading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              }
            >
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div>
                  <label className={labelClass}>{t.displayNameLabel}</label>
                  <input
                    className={inputClass}
                    value={form.displayName}
                    onChange={(e) => updateField('displayName', e.target.value)}
                    placeholder={t.displayNamePlaceholder}
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.avatarUrlLabel}</label>
                  <input
                    className={inputClass}
                    value={form.avatarUrl}
                    onChange={(e) => updateField('avatarUrl', e.target.value)}
                    placeholder="https://…"
                  />
                  <p className={`${helpClass} mt-1.5`}>{t.avatarHelp}</p>
                </div>
                <button type="submit" disabled={saving} className={primaryBtnClass}>
                  {saving ? (
                    <>
                      <div className={spinnerClass} />
                      {t.saving}
                    </>
                  ) : (
                    t.save
                  )}
                </button>
              </form>
            </SectionCard>

            <SectionCard
              accent="gray"
              title={t.roleLabel}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              }
            >
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <InfoTile label={t.emailLabel}>
                  <span className="block truncate">{email}</span>
                </InfoTile>
                <InfoTile label={t.roleLabel}>{roleLabel}</InfoTile>
                <InfoTile label={t.createdAtLabel}>{createdAt}</InfoTile>
                <InfoTile
                  label={t.staffIdLabel}
                  mono
                  className="col-span-2 md:col-span-3"
                >
                  {staffId}
                </InfoTile>
              </dl>
            </SectionCard>

            {/* Vérification Battle.net — même composant que l'espace joueuse,
                rendu SANS son encadré (`chrome="bare"`) pour adopter le chrome
                admin. Un membre du staff peut être joueuse (et doit alors
                pouvoir prouver son BattleTag) ou pas du tout : dans ce second
                cas le retour est un succès neutre, pas un avertissement.
                `loginPath` renvoie au login staff, pas au login joueuse. */}
            <SectionCard
              accent="blue"
              title={t.battlenetHeading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              }
            >
              <BattlenetVerifyCard
                chrome="bare"
                loginPath="/admin/login"
                returnTo="/admin?profile=1"
              />
            </SectionCard>
          </div>
        )}

        {/* ─── Sécurité ─── */}
        {!loading && activeTab === 'security' && (
          <div
            role="tabpanel"
            id={tabPanelId(TAB_ID_BASE, 'security')}
            aria-labelledby={tabButtonId(TAB_ID_BASE, 'security')}
            className="space-y-6"
          >
            <SectionCard
              accent="blue"
              title={t.emailHeading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
            >
              {emailErrorMsg && <ErrorBanner message={emailErrorMsg} />}
              <form onSubmit={handleEmailChange} className="space-y-4">
                <div>
                  <label className={labelClass}>{t.newEmailLabel}</label>
                  <input
                    type="email"
                    className={inputClass}
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="nouveau@email.com"
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailChanging || !newEmail || newEmail === profile?.email}
                  className={primaryBtnClass}
                >
                  {emailChanging ? (
                    <>
                      <div className={spinnerClass} />
                      {t.emailSending}
                    </>
                  ) : (
                    t.emailSubmit
                  )}
                </button>
              </form>
              <p className={`${helpClass} mt-3`}>{t.emailConfirmNote}</p>
            </SectionCard>

            <SectionCard
              accent="amber"
              title={t.passwordHeading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              }
            >
              {passwordErrorMsg && <ErrorBanner message={passwordErrorMsg} />}
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div>
                  <label className={labelClass}>{t.newPasswordLabel}</label>
                  <input
                    type="password"
                    className={inputClass}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                </div>
                <div>
                  <label className={labelClass}>{t.confirmPasswordLabel}</label>
                  <input
                    type="password"
                    className={inputClass}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    minLength={8}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={passwordChanging || !newPassword || !confirmPassword}
                  className={primaryBtnClass}
                >
                  {passwordChanging ? (
                    <>
                      <div className={spinnerClass} />
                      {t.passwordChanging}
                    </>
                  ) : (
                    t.passwordSubmit
                  )}
                </button>
              </form>
              <p className={`${helpClass} mt-3`}>{t.passwordHelp}</p>
            </SectionCard>
          </div>
        )}

        {/* ─── Confidentialité ─── */}
        {!loading && activeTab === 'privacy' && (
          <div
            role="tabpanel"
            id={tabPanelId(TAB_ID_BASE, 'privacy')}
            aria-labelledby={tabButtonId(TAB_ID_BASE, 'privacy')}
            className="space-y-6"
          >
            <SectionCard
              accent="emerald"
              title={t.dataHeading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              }
            >
              {dataError && <ErrorBanner message={dataError} />}

              <button
                onClick={handleExportData}
                disabled={exporting}
                className="w-full px-4 py-2.5 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-neutral-100 transition-colors flex items-center justify-center gap-2 mb-2"
              >
                {exporting ? (
                  <>
                    <div className={spinnerClass} />
                    {t.exporting}
                  </>
                ) : (
                  t.exportBtn
                )}
              </button>
              <p className={`${helpClass} mb-6`}>{t.exportHelp}</p>

              <div className="border-t border-white/10 pt-5">
                <button
                  onClick={() => {
                    setDataError(null);
                    setDeleteConfirm(true);
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 hover:bg-red-500/20 text-red-200 text-sm font-medium transition-colors"
                >
                  {t.deleteBtn}
                </button>
                <p className={`${helpClass} mt-3`}>{t.deleteHelp}</p>
              </div>
            </SectionCard>

            <SectionCard
              accent="gray"
              title={t.systemHeading}
              icon={
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              }
            >
              <InfoTile label={t.userIdLabel} mono>
                {authUserId}
              </InfoTile>
            </SectionCard>
          </div>
        )}

        {deleteConfirm && (
          <ConfirmDialog
            title={t.deleteDialogTitle}
            subtitle={t.deleteDialogSubtitle}
            variant="danger"
            loading={deleting}
            confirmLabel={t.deleteConfirmLabel}
            confirmingLabel={t.deleteConfirmingLabel}
            cancelLabel={t.cancelLabel}
            errorMsg={dataError}
            onCancel={() => {
              if (deleting) return;
              setDeleteConfirm(false);
              setDataError(null);
            }}
            onConfirm={handleDeleteAccount}
          >
            <p className="text-sm text-red-200">
              {t.deleteDialogBodyBefore}
              <strong>{t.deleteDialogBodyStrong}</strong>
              {t.deleteDialogBodyAfter}
            </p>
          </ConfirmDialog>
        )}
      </div>
    </Modal>
  );
}

export default ProfileModal;

function formatRoleLabel(role: string) {
  switch (role) {
    case 'owner':
      return 'Owner';
    case 'admin':
      return 'Admin';
    case 'manager':
      return 'Manager';
    case 'caster':
      return 'Caster';
    default:
      return role;
  }
}
