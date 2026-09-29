// components/admin/tournament/TournamentVisualsSection.tsx
//
// Panneau « Visuels » de l'édition d'un tournoi : logo, bannière, règlement
// PDF, et la chaîne de diffusion par défaut.
//
// EXTRAIT DE `pages/admin/tournament/[id]/edit.tsx` — cet écran fait partie des
// god-components gelés par `tests/unit/adminFileSizeGuard.test.ts`, dont la
// règle est « tout lot qui touche un de ces fichiers en extrait au moins un
// panneau ». Ce panneau se tenait tout seul : quatre champs, un seul handler
// d'upload, aucune dépendance au reste du formulaire.
//
// L'upload du PDF vit ICI (état + handler) plutôt que dans l'écran parent :
// c'est le seul endroit qui s'en sert, et le laisser au-dessus obligeait à
// faire descendre trois variables d'état à travers les props.

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTournamentEdit from '@/lib/i18n/locales/admin-fr/adminTournamentEdit';
import {
  rubanCardPadded,
  rubanFaint,
  rubanFormInput,
  rubanFormLabel,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';

/** Les seuls champs du formulaire que ce panneau touche. */
export type TournamentVisualsForm = {
  logo_url: string;
  banner_url: string;
  rules_url: string;
  default_stream_url: string;
};

type Props = {
  form: TournamentVisualsForm;
  updateField: (field: keyof TournamentVisualsForm, value: string) => void;
};

export default function TournamentVisualsSection({ form, updateField }: Props) {
  const t = useAdminT(nsAdminTournamentEdit);
  const { addToast } = useToast();
  const { mutate: uploadRules } = useIdempotentMutation();
  const [uploadingRules, setUploadingRules] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);

  async function handleRulesPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setRulesError(null);

    if (file.type !== 'application/pdf') {
      setRulesError(t.errorPdfOnly);
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setRulesError(t.errorPdfTooLarge);
      return;
    }

    setUploadingRules(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error('read failed'));
        reader.readAsDataURL(file);
      });

      const res = await uploadRules('/api/admin/upload', {
        method: 'POST',
        body: JSON.stringify({
          data: dataUrl,
          mimeType: 'application/pdf',
          filename: file.name,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || t.errorRulesUpload);
      }
      updateField('rules_url', json.url || '');
      addToast(t.toastRulesUploaded, 'success');
    } catch (err: unknown) {
      setRulesError((err as Error)?.message ?? t.errorUploadFailed);
    } finally {
      setUploadingRules(false);
    }
  }

  return (
    <section className={rubanCardPadded}>
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg
          className={`h-5 w-5 ${rubanMuted}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        {t.sectionVisuals}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className={rubanFormLabel}>{t.logoLabel}</label>
          <input
            type="text"
            className={rubanFormInput}
            value={form.logo_url}
            onChange={(e) => updateField('logo_url', e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className={rubanFormLabel}>{t.bannerLabel}</label>
          <input
            type="text"
            className={rubanFormInput}
            value={form.banner_url}
            onChange={(e) => updateField('banner_url', e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className={rubanFormLabel}>{t.rulesLabel}</label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            className={`flex-1 ${rubanFormInput}`}
            value={form.rules_url}
            onChange={(e) => updateField('rules_url', e.target.value)}
            placeholder="https://…/reglement.pdf"
          />
          <label className="inline-flex h-[38px] cursor-pointer items-center justify-center whitespace-nowrap rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] px-[14px] font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.02em] text-[var(--t2,#c7bfca)] transition-colors hover:border-[var(--t4,#807984)] hover:text-[var(--t1,#f4edf7)]">
            {uploadingRules ? t.uploading : t.uploadPdf}
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              disabled={uploadingRules}
              onChange={handleRulesPdfChange}
            />
          </label>
        </div>
        <p className={`mt-1 text-xs ${rubanFaint}`}>{t.rulesHelp}</p>
        {rulesError && (
          <p className="mt-1 text-xs text-[var(--err,#ff6b6b)]">{rulesError}</p>
        )}
        {form.rules_url && (
          <a
            href={form.rules_url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs text-[var(--or-300,#dea3f6)] hover:text-[var(--or-200,#eec4ff)]"
          >
            {t.openCurrentRules}
          </a>
        )}
      </div>

      <div className="mt-4">
        <label className={rubanFormLabel}>{t.defaultStreamLabel}</label>
        <input
          type="text"
          className={rubanFormInput}
          value={form.default_stream_url}
          onChange={(e) => updateField('default_stream_url', e.target.value)}
          placeholder="https://www.twitch.tv/…"
        />
        <p className={`mt-1 text-xs ${rubanFaint}`}>{t.defaultStreamHelp}</p>
      </div>
    </section>
  );
}
