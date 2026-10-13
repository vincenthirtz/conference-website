// features/admin/caster/model.ts — forme de réponse lue par l'UI du site
// (panneau de vote MVP, client). Type seul, sans import de service : le site
// le reçoit par la synchro inversée sans tirer le métier ni le repository
// derrière (`service.ts` le réexporte pour ses appelants).

export type CasterRecentMatch = {
  id: string;
  roundName: string | null;
  team1Name: string | null;
  team2Name: string | null;
  completedAt: string | null;
};
