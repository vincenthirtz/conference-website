// features/player/team/ui/TeamOpennessPanel.tsx — recrutement et scrims.
// L'état se lit pour TOUTE membre (savoir que son équipe recrute est une
// information) ; seul l'interrupteur demande la permission.

import Switch from '@/components/ui/Switch';
import { Card } from '@/features/ruban';
import type { ManageTeamTexts } from '../hooks/useManageTeamScreen';

type Toggle = {
  on: boolean;
  editable: boolean;
  busy: boolean;
  onToggle: () => void;
};

export default function TeamOpennessPanel({
  t,
  recruitment,
  scrims,
}: {
  t: ManageTeamTexts;
  recruitment: Toggle;
  scrims: Toggle;
}) {
  return (
    <>
      <Card as="section">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">{t.recruitment}</h2>
            <p className="text-sm text-gray-400 mt-1">
              {recruitment.on ? t.recruitmentOpenDesc : t.recruitmentClosedDesc}
            </p>
          </div>
          {recruitment.editable && (
            <Switch
              checked={recruitment.on}
              onChange={recruitment.onToggle}
              disabled={recruitment.busy}
              label={t.recruitment}
              size="md"
            />
          )}
        </div>
      </Card>

      <Card as="section">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">{t.scrimOpenLabel}</h2>
            <p className="text-sm text-gray-400 mt-1">{t.scrimOpenHelp}</p>
          </div>
          {scrims.editable && (
            <Switch
              checked={scrims.on}
              onChange={scrims.onToggle}
              disabled={scrims.busy}
              label={t.scrimOpenLabel}
              size="md"
            />
          )}
        </div>
      </Card>
    </>
  );
}
