// components/admin/profile/StaffMfaPanel.tsx
//
// Double authentification TOTP du staff (Supabase MFA) : enrôlement (QR code
// + vérification), saisie du code pour élever la session en `aal2`, et
// désactivation. Utilisé par l'onglet Sécurité du profil et par la page
// /admin/mfa (redirection des gardes quand l'obligation est active).
//
// Tout passe par `supabaseClient.auth.mfa` : la session élevée est réécrite
// dans les cookies par le client navigateur, et c'est son jeton que les gardes
// serveur relisent (utils/staffMfa.ts). Aucune route maison, aucun secret
// stocké chez nous.

import { useCallback, useEffect, useState } from 'react';
import { supabaseClient } from '@/utils/supabaseBrowser';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import { logger } from '@/utils/logger';
import nsAdminProfile from '@/lib/i18n/locales/admin-fr/adminProfile';

type PanelState =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'enrolling'; factorId: string; qr: string; secret: string }
  | { kind: 'challenge'; factorId: string }
  | { kind: 'active'; factorId: string };

const inputClass =
  'w-40 px-3 py-2.5 rounded-[var(--r-ctrl,4px)] bg-[var(--s2,#1d1520)] border border-[var(--line2,rgba(194,196,201,.2))] focus:outline-none focus:border-[var(--or,#b467d1)] text-base tracking-[0.3em] font-mono text-[var(--t1,#f4edf7)]';
const helpClass = 'text-sm text-[var(--t2,#c7bfca)]';

/** Garde les seuls chiffres, 6 au plus (les applis affichent « 123 456 »). */
function cleanCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

export default function StaffMfaPanel({
  onVerified,
}: {
  /** Appelé quand la session vient de passer en `aal2`. */
  onVerified?: () => void;
}) {
  const t = useAdminT(nsAdminProfile);
  const { addToast } = useToast();
  const [state, setState] = useState<PanelState>({ kind: 'loading' });
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [factors, aal] = await Promise.all([
      supabaseClient.auth.mfa.listFactors(),
      supabaseClient.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factors.error) throw factors.error;
    const verified = (factors.data?.totp ?? []).find(
      (f) => f.status === 'verified'
    );
    if (!verified) {
      setState({ kind: 'none' });
    } else if (aal.data?.currentLevel === 'aal2') {
      setState({ kind: 'active', factorId: verified.id });
    } else {
      setState({ kind: 'challenge', factorId: verified.id });
    }
  }, []);

  useEffect(() => {
    load().catch((err: unknown) => {
      logger.error('StaffMfaPanel: load error', err);
      setError(t.errorMfaGeneric);
      setState({ kind: 'none' });
    });
  }, [load, t]);

  const startEnroll = async () => {
    setBusy(true);
    setError(null);
    try {
      // Un enrôlement abandonné laisse un facteur `unverified` : on le retire,
      // sinon il encombre la liste (et GoTrue en plafonne le nombre).
      const { data: list } = await supabaseClient.auth.mfa.listFactors();
      for (const f of list?.all ?? []) {
        if (f.factor_type === 'totp' && f.status === 'unverified') {
          await supabaseClient.auth.mfa.unenroll({ factorId: f.id });
        }
      }
      const { data, error: enrollError } = await supabaseClient.auth.mfa.enroll(
        {
          factorType: 'totp',
          friendlyName: `staff-${Date.now()}`,
        }
      );
      if (enrollError || !data) throw enrollError ?? new Error('enroll');
      setCode('');
      setState({
        kind: 'enrolling',
        factorId: data.id,
        qr: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch (err: unknown) {
      logger.error('StaffMfaPanel: enroll error', err);
      setError((err as Error)?.message || t.errorMfaGeneric);
    } finally {
      setBusy(false);
    }
  };

  const cancelEnroll = async (factorId: string) => {
    setBusy(true);
    try {
      await supabaseClient.auth.mfa.unenroll({ factorId });
    } catch (err: unknown) {
      logger.error('StaffMfaPanel: cancel enroll error', err);
    } finally {
      setBusy(false);
      setError(null);
      setState({ kind: 'none' });
    }
  };

  const verify = async (factorId: string, enrolling: boolean) => {
    if (code.length !== 6) {
      setError(t.errorMfaCode);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: verifyError } =
        await supabaseClient.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) {
        setError(t.errorMfaCode);
        return;
      }
      setCode('');
      setState({ kind: 'active', factorId });
      addToast(enrolling ? t.toastMfaEnabled : t.toastMfaVerified, 'success');
      onVerified?.();
    } catch (err: unknown) {
      logger.error('StaffMfaPanel: verify error', err);
      setError(t.errorMfaGeneric);
    } finally {
      setBusy(false);
    }
  };

  const disable = async (factorId: string) => {
    setBusy(true);
    setError(null);
    try {
      const { error: unenrollError } = await supabaseClient.auth.mfa.unenroll({
        factorId,
      });
      if (unenrollError) throw unenrollError;
      addToast(t.toastMfaDisabled, 'success');
      await load();
    } catch (err: unknown) {
      logger.error('StaffMfaPanel: unenroll error', err);
      setError((err as Error)?.message || t.errorMfaGeneric);
    } finally {
      setBusy(false);
    }
  };

  const codeForm = (factorId: string, enrolling: boolean) => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void verify(factorId, enrolling);
      }}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium text-[var(--t2,#c7bfca)]">
          {t.mfaCodeLabel}
        </span>
        <input
          className={inputClass}
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={7}
          value={code}
          onChange={(e) => setCode(cleanCode(e.target.value))}
          placeholder="000000"
          required
        />
      </label>
      <AdminButton
        type="submit"
        variant="primary"
        disabled={busy || code.length !== 6}
      >
        {busy ? t.mfaVerifying : enrolling ? t.mfaVerifyBtn : t.mfaChallengeBtn}
      </AdminButton>
    </form>
  );

  const enrolled = state.kind === 'active' || state.kind === 'challenge';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone={enrolled ? 'ok' : 'warn'}>
          {enrolled ? t.mfaStatusOn : t.mfaStatusOff}
        </Chip>
      </div>
      <p className={helpClass}>{t.mfaIntro}</p>

      {error && (
        <p
          role="alert"
          className="rounded-[var(--r-ctrl,4px)] border border-[rgba(255,107,107,.45)] bg-[rgba(255,107,107,.08)] px-4 py-3 text-sm text-[#ffc2c2]"
        >
          {error}
        </p>
      )}

      {state.kind === 'loading' && (
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}

      {state.kind === 'none' && (
        <>
          <p className={helpClass}>{t.mfaInvite}</p>
          <AdminButton variant="primary" onClick={startEnroll} disabled={busy}>
            {t.mfaEnableBtn}
          </AdminButton>
        </>
      )}

      {state.kind === 'enrolling' && (
        <div className="space-y-4">
          <p className={helpClass}>{t.mfaScanQr}</p>
          {/* biome-ignore lint/performance/noImgElement: QR SVG en data URI fourni par Supabase, hors next/image */}
          <img
            src={state.qr}
            alt={t.mfaQrAlt}
            width={180}
            height={180}
            className="rounded-[var(--r-ctrl,4px)] bg-white p-2"
          />
          <div>
            <span className="block text-xs text-[var(--t3,#a39ba6)]">
              {t.mfaSecretLabel}
            </span>
            <code className="break-all font-mono text-sm text-[var(--t1,#f4edf7)]">
              {state.secret}
            </code>
          </div>
          {codeForm(state.factorId, true)}
          <AdminButton
            variant="ghost"
            size="sm"
            onClick={() => cancelEnroll(state.factorId)}
            disabled={busy}
          >
            {t.mfaCancelBtn}
          </AdminButton>
        </div>
      )}

      {state.kind === 'challenge' && (
        <div className="space-y-3">
          <p className={helpClass}>{t.mfaChallengeIntro}</p>
          {codeForm(state.factorId, false)}
        </div>
      )}

      {state.kind === 'active' && (
        <div className="space-y-3">
          <p className={helpClass}>{t.mfaSessionVerified}</p>
          <AdminButton
            variant="danger"
            size="sm"
            onClick={() => disable(state.factorId)}
            disabled={busy}
          >
            {t.mfaDisableBtn}
          </AdminButton>
          <p className="text-xs text-[var(--t3,#a39ba6)]">{t.mfaDisableHelp}</p>
        </div>
      )}
    </div>
  );
}
