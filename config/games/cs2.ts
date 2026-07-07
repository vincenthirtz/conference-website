// config/games/cs2.ts

import type { GameDef, MatchFormat } from './index';
import type { VetoFlowStep } from '@/types/veto';

const CDN = '/images/games/cs2';

// CS2 competitive veto sequence (BO3) used by ESL/major rules:
// ban / ban / pick / pick / ban / ban / decider
const CS2_BO3: VetoFlowStep[] = [
  { action: 'ban', side: 'team1' },
  { action: 'ban', side: 'team2' },
  { action: 'pick', side: 'team1' },
  { action: 'pick', side: 'team2' },
  { action: 'ban', side: 'team1' },
  { action: 'ban', side: 'team2' },
  { action: 'decider', side: null },
];

// BO1: each team bans 3, decider is the last one
const CS2_BO1: VetoFlowStep[] = [
  { action: 'ban', side: 'team1' },
  { action: 'ban', side: 'team2' },
  { action: 'ban', side: 'team1' },
  { action: 'ban', side: 'team2' },
  { action: 'ban', side: 'team1' },
  { action: 'ban', side: 'team2' },
  { action: 'decider', side: null },
];

// BO5: each team bans 1, then picks 2 each, decider = last remaining
const CS2_BO5: VetoFlowStep[] = [
  { action: 'ban', side: 'team1' },
  { action: 'ban', side: 'team2' },
  { action: 'pick', side: 'team1' },
  { action: 'pick', side: 'team2' },
  { action: 'pick', side: 'team1' },
  { action: 'pick', side: 'team2' },
  { action: 'decider', side: null },
];

export const CS2: GameDef = {
  slug: 'cs2',
  label: 'Counter-Strike 2',
  hasMapVeto: true,
  matchFormats: ['bo1', 'bo3', 'bo5'] satisfies MatchFormat[],
  vetoFlows: {
    bo1: CS2_BO1,
    bo3: CS2_BO3,
    bo5: CS2_BO5,
  },
  mapPool: [
    { name: 'Mirage', type: 'active-duty', image: `${CDN}/mirage.jpg` },
    { name: 'Inferno', type: 'active-duty', image: `${CDN}/inferno.jpg` },
    { name: 'Nuke', type: 'active-duty', image: `${CDN}/nuke.jpg` },
    { name: 'Ancient', type: 'active-duty', image: `${CDN}/ancient.jpg` },
    { name: 'Anubis', type: 'active-duty', image: `${CDN}/anubis.jpg` },
    { name: 'Vertigo', type: 'active-duty', image: `${CDN}/vertigo.jpg` },
    { name: 'Dust II', type: 'active-duty', image: `${CDN}/dust2.jpg` },
    { name: 'Train', type: 'active-duty', image: `${CDN}/train.jpg` },
  ],
  registrationPresets: [
    {
      key: 'captain_steam',
      label: 'Profil Steam / SteamID',
      type: 'text',
      required: false,
      help: 'Lien du profil Steam ou SteamID du capitaine',
    },
    {
      key: 'faceit_level',
      label: 'Niveau FACEIT moyen',
      type: 'select',
      required: false,
      options: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    },
    {
      key: 'region',
      label: 'Région',
      type: 'select',
      required: false,
      options: ['EU', 'NA', 'APAC'],
    },
  ],
};
