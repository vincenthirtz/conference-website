// Fake data + small helpers for the tournament simulator. Extracted from
// pages/admin/tournament-simulator.tsx so the page file stays focused on UI
// state and orchestration.

import type { SimTeam, SimMap } from '@/utils/simulator';

export type OccurrenceConfig = {
  enabled: boolean;
  count: number; // number of occurrences
  frequency: 'weekly' | 'biweekly' | 'monthly';
};

export const FREQUENCY_LABELS: Record<OccurrenceConfig['frequency'], string> = {
  weekly: 'Hebdomadaire',
  biweekly: 'Bi-mensuel',
  monthly: 'Mensuel',
};

export const FREQUENCY_DAYS: Record<OccurrenceConfig['frequency'], number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

/** Format a date for display in match cards. */
export function formatMatchDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const time = d.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} ${time}`;
}

const FAKE_TEAM_NAMES = [
  'Phoenix Rising',
  'Shadow Wolves',
  'Iron Titans',
  'Crimson Storm',
  'Arctic Foxes',
  'Thunder Hawks',
  'Neon Vipers',
  'Golden Eagles',
  'Dark Knights',
  'Silver Sharks',
  'Blazing Comets',
  'Frost Giants',
  'Storm Riders',
  'Night Owls',
  'Solar Flare',
  'Lunar Eclipse',
  'Cyber Dragoons',
  'Omega Squad',
  'Emerald Lions',
  'Sapphire Wings',
  'Ruby Sentinels',
  'Onyx Panthers',
  'Platinum Wolves',
  'Diamond Edge',
  'Cobalt Fury',
  'Obsidian Blade',
  'Amber Wasps',
  'Jade Serpents',
  'Scarlet Reapers',
  'Titanium Guard',
  'Vortex Titans',
  'Zenith Force',
];

const FAKE_PLAYER_FIRST = [
  'Lucas',
  'Hugo',
  'Théo',
  'Nathan',
  'Léo',
  'Arthur',
  'Raphaël',
  'Louis',
  'Jade',
  'Emma',
  'Léa',
  'Chloé',
  'Alice',
  'Lina',
  'Sarah',
  'Inès',
  'Karim',
  'Yuki',
  'Chen',
  'Erik',
  'Sven',
  'Pavel',
  'Marco',
  'Dani',
];

const FAKE_PLAYER_LAST = [
  'Martin',
  'Bernard',
  'Dubois',
  'Thomas',
  'Robert',
  'Richard',
  'Petit',
  'Durand',
  'Moreau',
  'Laurent',
  'Simon',
  'Michel',
  'Garcia',
  'Müller',
  'Kim',
  'Park',
  'Santos',
  'Jensen',
  'Novak',
  'Fischer',
];

export const FAKE_MAPS = [
  'Hanamura',
  "King's Row",
  'Numbani',
  'Dorado',
  'Temple of Anubis',
  'Volskaya',
  'Nepal',
  'Lijiang Tower',
  'Ilios',
  'Oasis',
  'Busan',
  'Junkertown',
  'Rialto',
  'Havana',
  'Route 66',
  'Eichenwalde',
  'Hollywood',
  'Watchpoint: Gibraltar',
  'Blizzard World',
  'Midtown',
];

let _idCounter = 0;
/** Stable-enough sequential id for in-memory simulator entities. */
export function fakeId(): string {
  return `sim-${++_idCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Reset the id sequence so re-generating a tournament starts fresh. */
export function resetFakeIdCounter(): void {
  _idCounter = 0;
}

export function generateTeams(
  count: number,
  playersPerTeam: number
): SimTeam[] {
  const shuffled = [...FAKE_TEAM_NAMES].sort(() => Math.random() - 0.5);
  return Array.from({ length: count }, (_, i) => ({
    id: fakeId(),
    name: shuffled[i % shuffled.length],
    short_name: shuffled[i % shuffled.length]
      .split(' ')
      .map((w) => w[0])
      .join('')
      .slice(0, 3)
      .toUpperCase(),
    logo_url: null,
    seed: i + 1,
    // Higher seeds get higher default strength (seed 1 ≈ 75, last seed ≈ 35)
    strength: Math.round(75 - (i / Math.max(count - 1, 1)) * 40),
    players: Array.from({ length: playersPerTeam }, () => {
      const first =
        FAKE_PLAYER_FIRST[Math.floor(Math.random() * FAKE_PLAYER_FIRST.length)];
      const last =
        FAKE_PLAYER_LAST[Math.floor(Math.random() * FAKE_PLAYER_LAST.length)];
      return {
        name: `${first} ${last}`,
        battleTag: `${first}#${Math.floor(1000 + Math.random() * 9000)}`,
      };
    }),
  }));
}

export function pickMaps(count: number, pool: string[]): SimMap[] {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const modes = ['Contrôle', 'Escorte', 'Hybride', 'Assaut', 'Push'];
  return shuffled.slice(0, count).map((name) => ({
    name,
    mode: modes[Math.floor(Math.random() * modes.length)],
  }));
}
