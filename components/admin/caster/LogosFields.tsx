// components/admin/caster/LogosFields.tsx
//
// Bloc repliable « Logos des équipes » partagé match/results — port du
// logosBlock/readLogos desktop (teamFields.js). Extrait de MatchSceneEditor
// (lot 1), rendu identique.

import { useAdminT } from '@/lib/i18n/useAdminT';
import {
  detailsClass,
  inputClass,
  labelClass,
  summaryClass,
} from './fieldClasses';
import nsAdminCasterScenes from '@/lib/i18n/locales/admin-fr/adminCasterScenes';

type Props = {
  team1Logo: string;
  team2Logo: string;
  onChange: (patch: { team1Logo?: string; team2Logo?: string }) => void;
};

export default function LogosFields({ team1Logo, team2Logo, onChange }: Props) {
  const t = useAdminT(nsAdminCasterScenes);
  return (
    <details className={detailsClass}>
      <summary className={summaryClass}>{t.logosSummary}</summary>
      <div className="space-y-3 pt-2 pb-1">
        <label className="block">
          <span className={labelClass}>{t.team1LogoLabel}</span>
          <input
            type="text"
            value={team1Logo}
            onChange={(e) => onChange({ team1Logo: e.target.value })}
            placeholder={t.logo1Placeholder}
            className={inputClass}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{t.team2LogoLabel}</span>
          <input
            type="text"
            value={team2Logo}
            onChange={(e) => onChange({ team2Logo: e.target.value })}
            placeholder={t.logo2Placeholder}
            className={inputClass}
          />
        </label>
      </div>
    </details>
  );
}
