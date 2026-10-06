// pages/api/player/matches/[matchId]/evidence.ts — module features/player/matches (capture jointe au match).

export { default } from '@/features/player/matches/routes/evidence';

// L'image voyage en base64 dans le JSON (plafond 4 Mo, cf.
// PLAYER_EVIDENCE_MAX_BYTES) : la limite par défaut de Next (1 Mo) la
// refuserait avant la validation. Next lit `config` dans le fichier de page.
export const config = { api: { bodyParser: { sizeLimit: '6mb' } } };
