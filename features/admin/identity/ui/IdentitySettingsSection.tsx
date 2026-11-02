// features/admin/identity/ui/IdentitySettingsSection.tsx — « Réglages » de la page owner
// « Comptes et connexion » : inscriptions, connexion par Discord, lien de connexion par e-mail,
// durée des sessions. Chaque interrupteur enregistre aussitôt ; couper Discord ou les inscriptions
// demande confirmation, parce que des personnes en sont privées.

import { useEffect, useState } from 'react';
import { useToast } from '@/components/Toast';
import Switch from '@/components/ui/Switch';
import { Button, Card, FicheSection } from '@/features/ruban';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { format, useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminIdentity from '@/lib/i18n/locales/admin-fr/adminIdentity';
import { adminErrorMessage } from '@/utils/admin/adminHttp';
import type { IdentitySettings, IdentitySettingsPatch } from '../client';
import { useSaveIdentitySettings } from '../hooks/useIdentity';

const SESSION_DAYS_MIN = 1;
const SESSION_DAYS_MAX = 90;

type Toggle = 'signupOpen' | 'discordSignIn' | 'magicLink';

export default function IdentitySettingsSection({
  settings,
  stored,
  discordOnly,
}: {
  settings: IdentitySettings;
  /** `false` : la migration n'est pas appliquée, rien ne s'enregistre. */
  stored: boolean;
  discordOnly: number;
}) {
  const t = useAdminT(nsAdminIdentity);
  const { addToast } = useToast();
  const { confirm, dialog } = useConfirmDialog();
  const save = useSaveIdentitySettings();
  const [days, setDays] = useState(String(settings.sessionDays));

  useEffect(() => {
    setDays(String(settings.sessionDays));
  }, [settings.sessionDays]);

  const apply = async (patch: IdentitySettingsPatch) => {
    try {
      await save.mutateAsync(patch);
      addToast(t.saved, 'success');
    } catch (err) {
      addToast(
        format(t.saveError, { error: adminErrorMessage(err, t.loadError) }),
        'error'
      );
    }
  };

  const toggle = async (key: Toggle, next: boolean) => {
    if (!next && key === 'discordSignIn') {
      const ok = await confirm({
        title: t.confirmDiscordOffTitle,
        subtitle: format(t.confirmDiscordOffBody, { discordOnly }),
        variant: 'danger',
        confirmLabel: t.confirmOff,
      });
      if (!ok) return;
    }
    if (!next && key === 'signupOpen') {
      const ok = await confirm({
        title: t.confirmSignupOffTitle,
        subtitle: t.confirmSignupOffBody,
        variant: 'danger',
        confirmLabel: t.confirmOff,
      });
      if (!ok) return;
    }
    await apply({ [key]: next });
  };

  const parsedDays = Number(days);
  const daysValid =
    Number.isInteger(parsedDays) &&
    parsedDays >= SESSION_DAYS_MIN &&
    parsedDays <= SESSION_DAYS_MAX;
  const locked = !stored || save.isPending;

  const rows: { key: Toggle; label: string; help: string }[] = [
    { key: 'signupOpen', label: t.signupOpen, help: t.signupOpenHelp },
    {
      key: 'discordSignIn',
      label: t.discordSignIn,
      help: format(t.discordSignInHelp, { discordOnly }),
    },
    { key: 'magicLink', label: t.magicLink, help: t.magicLinkHelp },
  ];

  return (
    <FicheSection
      title={t.settingsTitle}
      aside={
        settings.updatedAt ? (
          <span className="text-[12px] text-[var(--t3,#a39ba6)]">
            {format(t.settingsUpdated, {
              date: new Date(settings.updatedAt).toLocaleString('fr-FR', {
                dateStyle: 'short',
                timeStyle: 'short',
              }),
            })}
          </span>
        ) : undefined
      }
    >
      {!stored && (
        <p className="mb-3 rounded-[var(--r-ctrl,4px)] border border-[rgba(245,165,36,.38)] bg-[rgba(245,165,36,.08)] p-3 text-[13px] text-[#ffd9a3]">
          {t.settingsMissing}
        </p>
      )}
      <Card padding="sm">
        <ul className="divide-y divide-[var(--line,rgba(194,196,201,.12))]">
          {rows.map((row) => (
            <li
              key={row.key}
              className="flex items-start justify-between gap-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-[14px] text-[var(--t1,#f4edf7)]">
                  {row.label}
                </p>
                <p className="mt-0.5 text-[12.5px] text-[var(--t3,#a39ba6)]">
                  {row.help}
                </p>
              </div>
              <Switch
                checked={settings[row.key]}
                onChange={() => void toggle(row.key, !settings[row.key])}
                label={row.label}
                disabled={locked}
              />
            </li>
          ))}
          <li className="py-3">
            <label
              htmlFor="identity-session-days"
              className="text-[14px] text-[var(--t1,#f4edf7)]"
            >
              {t.sessionDays}
            </label>
            <p className="mt-0.5 text-[12.5px] text-[var(--t3,#a39ba6)]">
              {t.sessionDaysHelp}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                id="identity-session-days"
                type="number"
                inputMode="numeric"
                min={SESSION_DAYS_MIN}
                max={SESSION_DAYS_MAX}
                value={days}
                disabled={locked}
                onChange={(e) => setDays(e.target.value)}
                className="h-[38px] w-24 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] px-3 text-[13px] text-[var(--t1,#f4edf7)]"
              />
              <Button
                size="sm"
                disabled={
                  locked || !daysValid || parsedDays === settings.sessionDays
                }
                onClick={() => void apply({ sessionDays: parsedDays })}
              >
                {t.save}
              </Button>
            </div>
          </li>
        </ul>
      </Card>
      {dialog}
    </FicheSection>
  );
}
