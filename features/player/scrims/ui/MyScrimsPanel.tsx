// features/player/scrims/ui/MyScrimsPanel.tsx — « Nos scrims » (R8) :
// à rapporter (la seule section qui appelle une action), à venir, récents.
// Présentationnel : données et geste reçus du conteneur.

import type { ReactNode } from 'react';
import { Button, Card, Chip } from '@/features/ruban';
import type { PlayerScrim } from '../schemas';
import ScrimReportForm, { type ScrimReportTexts } from './ScrimReportForm';

export type MyScrimsTexts = ScrimReportTexts & {
  title: string;
  toReportLabel: string;
  upcomingLabel: string;
  recentLabel: string;
  unknownOpponent: string;
  noScore: string;
  unranked: string;
  reportCta: string;
  correctCta: string;
  awaitingOpponent: string;
  disputed: string;
};

const SECTION_LABEL =
  'text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--t3,#a39ba6)]';

function scoreLine(scrim: PlayerScrim): string | null {
  if (scrim.team1Score == null || scrim.team2Score == null) return null;
  const mine = scrim.isTeam1 ? scrim.team1Score : scrim.team2Score;
  const theirs = scrim.isTeam1 ? scrim.team2Score : scrim.team1Score;
  return `${mine} – ${theirs}`;
}

function SimpleList({
  label,
  rows,
}: {
  label: string;
  rows: { id: string; left: ReactNode; right: ReactNode }[];
}) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4">
      <p className={SECTION_LABEL}>{label}</p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span className="text-[var(--t1,#f4edf7)]">{r.left}</span>
            <span className="text-xs text-[var(--t3,#a39ba6)]">{r.right}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MyScrimsPanel({
  t,
  toReport,
  upcoming,
  recent,
  readOnly,
  openReportId,
  onToggleReport,
  onReport,
  fmtDate,
}: {
  t: MyScrimsTexts;
  toReport: PlayerScrim[];
  upcoming: PlayerScrim[];
  recent: PlayerScrim[];
  /** Inspection staff : aucun geste. */
  readOnly: boolean;
  openReportId: string | null;
  onToggleReport: (scrimId: string) => void;
  onReport: (
    scrim: PlayerScrim,
    score: { mine: number; theirs: number }
  ) => Promise<void>;
  fmtDate: (iso: string | null) => string;
}) {
  const opponent = (s: PlayerScrim) => s.opponentName ?? t.unknownOpponent;

  return (
    <Card as="section" data-testid="my-scrims-card">
      <h3 className="text-lg font-semibold">{t.title}</h3>

      {toReport.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className={SECTION_LABEL}>{t.toReportLabel}</p>
          {toReport.map((scrim) => (
            <Card
              key={scrim.id}
              padding="sm"
              className="!bg-[var(--s2,#1d1520)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{opponent(scrim)}</p>
                  <p className="text-xs text-[var(--t3,#a39ba6)]">
                    {fmtDate(scrim.scheduledDate)}
                    {!scrim.ranked && ` · ${t.unranked}`}
                  </p>
                  {scrim.status === 'disputed' && (
                    <p className="mt-1">
                      <Chip tone="err">
                        {scrim.disputeReason || t.disputed}
                      </Chip>
                    </p>
                  )}
                  {scrim.myReport && scrim.status !== 'disputed' && (
                    <p className="mt-1">
                      <Chip tone="ok">{t.awaitingOpponent}</Chip>
                    </p>
                  )}
                </div>
                {!readOnly && (
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-expanded={openReportId === scrim.id}
                    onClick={() => onToggleReport(scrim.id)}
                  >
                    {scrim.myReport ? t.correctCta : t.reportCta}
                  </Button>
                )}
              </div>
              {!readOnly && openReportId === scrim.id && (
                <ScrimReportForm
                  scrimId={scrim.id}
                  t={t}
                  onSubmit={(score) => onReport(scrim, score)}
                />
              )}
            </Card>
          ))}
        </div>
      )}

      <SimpleList
        label={t.upcomingLabel}
        rows={upcoming.map((s) => ({
          id: s.id,
          left: opponent(s),
          right: fmtDate(s.scheduledDate),
        }))}
      />
      <SimpleList
        label={t.recentLabel}
        rows={recent.map((s) => ({
          id: s.id,
          left: opponent(s),
          right: scoreLine(s) ?? t.noScore,
        }))}
      />
    </Card>
  );
}
