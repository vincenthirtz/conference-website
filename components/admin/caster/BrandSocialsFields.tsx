// components/admin/caster/BrandSocialsFields.tsx
//
// Bloc repliable « Marque & réseaux » partagé par les éditeurs de scènes —
// port du brandSocialsBlock/readBrandSocials de l'app desktop (brandSocials.js) :
// hashtag optionnel (la scène end n'en porte pas) + 6 réseaux. Extrait de
// MatchSceneEditor (lot 1), rendu identique.

import { useAdminT } from '@/lib/i18n/useAdminT';
import type { CasterSocials } from '@/types/caster';
import {
  detailsClass,
  inputClass,
  labelClass,
  summaryClass,
} from './fieldClasses';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  socials: CasterSocials;
  onSocialsChange: (socials: CasterSocials) => void;
  /** Champ hashtag optionnel — omis pour les scènes sans hashtag (end). */
  hashtag?: { value: string; onChange: (value: string) => void };
};

export default function BrandSocialsFields({
  socials,
  onSocialsChange,
  hashtag,
}: Props) {
  const t = useAdminT(nsAdminCasterScenes);

  const socialsFields: Array<{
    key: keyof CasterSocials;
    label: string;
    placeholder: string;
  }> = [
    {
      key: 'site',
      label: t.socialSiteLabel,
      placeholder: t.socialSitePlaceholder,
    },
    {
      key: 'discord',
      label: t.socialDiscordLabel,
      placeholder: t.socialDiscordPlaceholder,
    },
    {
      key: 'twitch',
      label: t.socialTwitchLabel,
      placeholder: t.socialTwitchPlaceholder,
    },
    {
      key: 'youtube',
      label: t.socialYoutubeLabel,
      placeholder: t.socialYoutubePlaceholder,
    },
    {
      key: 'instagram',
      label: t.socialInstagramLabel,
      placeholder: t.socialInstagramPlaceholder,
    },
    {
      key: 'tiktok',
      label: t.socialTiktokLabel,
      placeholder: t.socialTiktokPlaceholder,
    },
  ];

  return (
    <details className={detailsClass}>
      <summary className={summaryClass}>{t.brandSummary}</summary>
      <div className="space-y-3 pt-2 pb-1">
        {hashtag && (
          <label className="block">
            <span className={labelClass}>{t.hashtagLabel}</span>
            <input
              type="text"
              value={hashtag.value}
              onChange={(e) => hashtag.onChange(e.target.value)}
              placeholder={t.hashtagPlaceholder}
              className={inputClass}
            />
          </label>
        )}
        {socialsFields.map((f) => (
          <label key={f.key} className="block">
            <span className={labelClass}>{f.label}</span>
            <input
              type="text"
              value={socials[f.key]}
              onChange={(e) =>
                onSocialsChange({ ...socials, [f.key]: e.target.value })
              }
              placeholder={f.placeholder}
              className={inputClass}
            />
          </label>
        ))}
      </div>
    </details>
  );
}
