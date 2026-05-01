// Config import/export + result summary helpers for the tournament simulator.

import type { FormatType } from '@/types/admin';
import type {
  SimStage,
  SimTeam,
  ScheduleConfig,
  EscalationConfig,
} from '@/utils/simulator';
import type { OccurrenceConfig } from './simulatorFakeData';

export type SimConfig = {
  formatType: FormatType;
  teamCount: number;
  playersPerTeam: number;
  bestOf: number;
  mapPoolSize: number;
  swissRounds: number;
  grandFinalReset: boolean;
  stageCount: number;
  schedule: ScheduleConfig;
  escalation: EscalationConfig;
  occurrence: OccurrenceConfig;
};

export type OccurrenceData = {
  index: number;
  label: string;
  startDate: string;
  stages: SimStage[];
  teams: SimTeam[];
};

export const FORMAT_LABELS: Record<FormatType, string> = {
  single_elim: 'Single Elimination',
  double_elim: 'Double Elimination',
  swiss: 'Swiss System',
  round_robin: 'Round Robin',
  showmatch: 'Showmatch',
};

export function exportConfigAsJSON(config: SimConfig): void {
  const json = JSON.stringify(config, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tournament-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importConfigFromFile(file: File): Promise<SimConfig> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (
          !parsed.formatType ||
          !parsed.schedule ||
          typeof parsed.teamCount !== 'number'
        ) {
          reject(new Error('Fichier de configuration invalide'));
          return;
        }
        resolve(parsed as SimConfig);
      } catch {
        reject(new Error('JSON invalide'));
      }
    };
    reader.onerror = () => reject(new Error('Erreur de lecture du fichier'));
    reader.readAsText(file);
  });
}

export function generateResultsSummary(
  stages: SimStage[],
  teams: SimTeam[],
  config: SimConfig
): string {
  const allMatches = stages.flatMap((s) => s.matches);
  const finished = allMatches.filter((m) => m.status === 'finished').length;

  const wins = new Map<string, number>();
  const losses = new Map<string, number>();
  for (const m of allMatches) {
    if (m.status !== 'finished' || !m.winner_team_id) continue;
    wins.set(m.winner_team_id, (wins.get(m.winner_team_id) ?? 0) + 1);
    const loserId = m.team1_id === m.winner_team_id ? m.team2_id : m.team1_id;
    if (loserId) losses.set(loserId, (losses.get(loserId) ?? 0) + 1);
  }

  const standings = teams
    .map((t) => ({
      name: t.name,
      seed: t.seed,
      w: wins.get(t.id) ?? 0,
      l: losses.get(t.id) ?? 0,
    }))
    .sort((a, b) => b.w - a.w || a.l - b.l);

  let text = `=== SIMULATEUR DE TOURNOI ===\n`;
  text += `Format: ${FORMAT_LABELS[config.formatType]} | ${teams.length} equipes | BO${config.bestOf}\n`;
  text += `Matchs: ${finished}/${allMatches.length} termines\n\n`;
  text += `--- CLASSEMENT ---\n`;
  standings.forEach((s, i) => {
    text += `${String(i + 1).padStart(2)}. ${s.name.padEnd(20)} ${s.w}V ${s.l}D (seed #${s.seed})\n`;
  });

  text += `\n--- RESULTATS ---\n`;
  for (const stage of stages) {
    text += `\n[${stage.name}]\n`;
    for (const m of stage.matches) {
      if (m.status !== 'finished') continue;
      const t1 = m.team1?.short_name ?? 'TBD';
      const t2 = m.team2?.short_name ?? 'TBD';
      const winner = m.winner_team_id === m.team1_id ? t1 : t2;
      text += `  ${m.round_name} #${m.position_in_round}: ${t1} ${m.team1_score}-${m.team2_score} ${t2} (${winner})\n`;
    }
  }

  return text;
}
