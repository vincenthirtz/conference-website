// features/admin/free-players/schemas.ts — formes d'entrée et de sortie de la
// vue staff des joueuses libres. Source unique client + serveur (lot L6).

import { z } from 'zod';
import type { FreePlayerRole } from '@/utils/freePlayers';

export const RemoveFreePlayerQuery = z.object({
  id: z.string({ error: 'id manquant.' }).min(1, { error: 'id manquant.' }),
});

/** Une fiche telle que le staff la voit — coordonnées comprises. */
export type FreePlayerAdminItem = {
  id: string;
  source: 'web' | 'discord';
  name: string | null;
  roles: FreePlayerRole[];
  level: string | null;
  availability: string | null;
  note: string | null;
  contactEmail: string | null;
  contactDiscord: string | null;
  discordUsername: string | null;
  markedAt: string | null;
  expiresAt: string | null;
};

export type FreePlayerAdminList = { items: FreePlayerAdminItem[] };

export type RemoveFreePlayerResult = {
  success: true;
  /** Vrai = le bot la repoussera tant que le rôle Discord est porté. */
  willReturn: boolean;
};
