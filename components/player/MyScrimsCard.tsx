// components/player/MyScrimsCard.tsx — conteneur de « Nos scrims » (R8) :
// lecture et report sur le cache joueuse (features/player/scrims), panneau
// présentationnel dans features/player/scrims/ui/MyScrimsPanel.
//
// Le report suit le modèle des matchs : chaque camp saisit le score, deux
// reports concordants closent le scrim (miroir noté pour un scrim `ranked` :
// Glicko et saison), deux reports divergents le mettent en litige.

import { useState } from 'react';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import { useToast } from '@/components/Toast';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsMyScrims from '@/lib/i18n/locales/fr/myScrims';
import {
  useMyScrims,
  useReportScrim,
} from '@/features/player/scrims/hooks/useScrimsQueries';
import MyScrimsPanel from '@/features/player/scrims/ui/MyScrimsPanel';
import type { PlayerScrim } from '@/features/player/scrims/schemas';

export default function MyScrimsCard() {
  const t = useT(nsMyScrims);
  const locale = useLocale();
  const { readOnly } = usePlayerArea();
  const { addToast } = useToast();
  const { data } = useMyScrims();
  const report = useReportScrim();
  const [openReport, setOpenReport] = useState<string | null>(null);

  // Échec de lecture : la carte se tait, comme avant.
  if (!data) return null;
  const { toReport, upcoming, recent } = data;
  if (toReport.length === 0 && upcoming.length === 0 && recent.length === 0) {
    return null;
  }

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString(locale, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : t.noDate;

  const onReport = async (
    scrim: PlayerScrim,
    { mine, theirs }: { mine: number; theirs: number }
  ) => {
    const body = scrim.isTeam1
      ? { team1Score: mine, team2Score: theirs }
      : { team1Score: theirs, team2Score: mine };
    const result = await report.mutateAsync({ scrimId: scrim.id, body });
    addToast(
      result.outcome === 'completed'
        ? t.reportCompleted
        : result.outcome === 'disputed'
          ? t.reportDisputed
          : t.reportAwaiting,
      result.outcome === 'disputed' ? 'error' : 'success'
    );
    setOpenReport(null);
  };

  return (
    <MyScrimsPanel
      t={t}
      toReport={toReport}
      upcoming={upcoming}
      recent={recent}
      readOnly={readOnly}
      openReportId={openReport}
      onToggleReport={(id) => setOpenReport((cur) => (cur === id ? null : id))}
      onReport={onReport}
      fmtDate={fmtDate}
    />
  );
}
