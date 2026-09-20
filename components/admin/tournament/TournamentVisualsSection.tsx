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
    <section className="bg-neutral-800/50 backdrop-blur border border-neutral-700/50 rounded-2xl p-6">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
        <svg
          className="w-5 h-5 text-neutral-400"
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
          <label className="block text-sm mb-1 text-neutral-300">
            {t.logoLabel}
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.logo_url}
            onChange={(e) => updateField('logo_url', e.target.value)}
            placeholder="https://…"
          />
        </div>
        <div>
          <label className="block text-sm mb-1 text-neutral-300">
            {t.bannerLabel}
          </label>
          <input
            type="text"
            className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.banner_url}
            onChange={(e) => updateField('banner_url', e.target.value)}
            placeholder="https://…"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="block text-sm mb-1 text-neutral-300">
          {t.rulesLabel}
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            className="flex-1 px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={form.rules_url}
            onChange={(e) => updateField('rules_url', e.target.value)}
            placeholder="https://…/reglement.pdf"
          />
          <label className="inline-flex items-center justify-center px-3 py-2 rounded-lg bg-neutral-700/60 hover:bg-neutral-700 border border-neutral-600 text-sm cursor-pointer whitespace-nowrap">
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
        <p className="text-xs text-neutral-500 mt-1">{t.rulesHelp}</p>
        {rulesError && (
          <p className="text-xs text-red-400 mt-1">{rulesError}</p>
        )}
        {form.rules_url && (
          <a
            href={form.rules_url}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-xs text-blue-400 hover:text-blue-300 mt-1"
          >
            {t.openCurrentRules}
          </a>
        )}
      </div>

      <div className="mt-4">
        <label className="block text-sm font-medium text-neutral-300 mb-1">
          {t.defaultStreamLabel}
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 rounded-lg bg-neutral-900/50 border border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={form.default_stream_url}
          onChange={(e) => updateField('default_stream_url', e.target.value)}
          placeholder="https://www.twitch.tv/…"
        />
        <p className="text-xs text-neutral-500 mt-1">{t.defaultStreamHelp}</p>
      </div>
    </section>
  );
}
