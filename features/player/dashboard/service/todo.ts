// features/player/dashboard/service/todo.ts — le bandeau « à faire » (lot J6
// de docs/PLAN-espace-joueur.md), calculé serveur. AUCUNE nouvelle règle
// métier : chaque item est dérivé d'une donnée que le tableau de bord contient
// déjà. Pur (testé sans base : tests/unit/playerDashboardNavigation.test.ts).

import type { TeamPermission } from '@/utils/teamRoles';
import { DASHBOARD_ANCHORS } from '@/utils/player/dashboardAnchors';
import type { NextMatchSection, PendingScrim, TodoItem } from '../schemas';

/**
 * Au plus trois gestes en attente, dans un ordre FIXE : le plus périssable
 * d'abord. Le check-in se referme tout seul, les invitations expirent, les
 * messages attendent. Cet ordre est celui du code — donc stable d'un
 * chargement à l'autre, ce qui est la moitié de l'intérêt d'un tel bandeau.
 */
export function buildTodo(input: {
  userId: string;
  nextMatch: NextMatchSection;
  pendingScrims: PendingScrim[];
  unreadMessages: number;
  pendingInvitations: number;
  /**
   * Demandes d'adhésion reçues par l'équipe, en attente. Le service ne la
   * remplit que pour qui a `manage_join_requests` ; absent = 0.
   */
  pendingJoinRequests?: number;
  /**
   * Matchs dont le score attend MA confirmation (`report.state ===
   * 'awaiting_me'`), triés par date ; le service ne les calcule que pour qui
   * peut déclarer (capitaine / manager d'équipe). Absent = aucun.
   */
  scoresToConfirm?: string[];
  members: {
    user_id?: string | null;
    battle_tag_verified_at?: string | null;
  }[];
  canManage: boolean;
  permissions: TeamPermission[];
}): TodoItem[] {
  const items: TodoItem[] = [];
  const match = input.nextMatch?.match ?? null;
  const checkin = input.nextMatch?.checkin ?? null;
  const readiness = input.nextMatch?.readiness ?? null;

  // 1. Check-in ouvert et non fait : la seule échéance qui se referme seule.
  //    Seulement pour qui peut pointer : une joueuse simple verrait un « à
  //    faire » qu'elle ne peut pas faire (le check-in revient à la capitaine,
  //    au coach ou à la manager).
  if (
    match &&
    checkin &&
    // `!== false` : un bloc sans le champ (forme d'avant la règle) garde
    // l'ancien comportement plutôt que de taire un check-in à faire.
    checkin.canCheckIn !== false &&
    checkin.isOpen &&
    !checkin.alreadyCheckedIn
  ) {
    items.push({
      id: 'checkin',
      href: `/player/match/${match.id}`,
      count: null,
    });
  }

  // 2. Effectif sous le minimum du tournoi — ça ne se règle pas le jour même.
  if (readiness && readiness.shortfall > 0) {
    items.push({
      id: 'roster',
      href: '/player/manage-team',
      count: readiness.shortfall,
    });
  }

  // 3. Feuille de match : possible seulement une fois le check-in fait, et
  //    réservée à qui peut la valider.
  if (
    match &&
    checkin?.alreadyCheckedIn &&
    input.permissions.includes('validate_lineup')
  ) {
    items.push({
      id: 'lineup',
      href: `/player/match/${match.id}`,
      count: null,
    });
  }

  // 4. Score déclaré par l'adversaire, en attente de MA déclaration : sans
  //    elle, le résultat reste suspendu (et finit en arbitrage staff). Un seul
  //    match → son fil, où se fait la déclaration ; plusieurs → « Mes matchs ».
  const scores = input.scoresToConfirm ?? [];
  if (scores.length > 0) {
    items.push({
      id: 'score',
      href:
        scores.length === 1 ? `/player/match/${scores[0]}` : '/player/matches',
      count: scores.length,
    });
  }

  // 5. Invitation reçue : elle expire, et c'est un geste d'une seconde.
  //    `/player` seul était un clic mort — le bandeau vit SUR /player. L'ancre
  //    est celle posée autour d'InvitationsSection.
  if (input.pendingInvitations > 0) {
    items.push({
      id: 'invitation',
      href: `/player#${DASHBOARD_ANCHORS.invitations}`,
      count: input.pendingInvitations,
    });
  }

  // 6. Scrims en attente de MA réponse. Vers le bloc « scrims qui attendent ta
  //    réponse », pas vers `#scrim-plannings` (les grilles de dispo, un autre
  //    geste). Le tableau de bord déplie la section Scrims si elle est repliée.
  //    Seulement avec `manage_scrims` : c'est la condition d'affichage de la
  //    section Scrims (et de son ancre). Sans elle, le lien menait nulle part,
  //    et le geste — répondre — serait refusé.
  if (
    input.pendingScrims.length > 0 &&
    input.permissions.includes('manage_scrims')
  ) {
    items.push({
      id: 'scrims',
      href: `/player#${DASHBOARD_ANCHORS.pendingScrims}`,
      count: input.pendingScrims.length,
    });
  }

  // 7. Demandes d'adhésion à traiter — celles que compte déjà la cloche. Vers
  //    la gestion d'équipe, où vit le panneau des demandes. Seulement avec
  //    `manage_join_requests` : sans elle, le geste serait refusé.
  const joinRequests = input.pendingJoinRequests ?? 0;
  if (joinRequests > 0 && input.permissions.includes('manage_join_requests')) {
    items.push({
      id: 'joinRequests',
      href: '/player/manage-team',
      count: joinRequests,
    });
  }

  // 8. Messages d'équipe non lus.
  if (input.unreadMessages > 0) {
    items.push({
      id: 'messages',
      href: '/player/messages',
      count: input.unreadMessages,
    });
  }

  // 9. Mon BattleTag n'est pas vérifié — le plus patient des rappels.
  const me = input.members.find((m) => m.user_id === input.userId);
  if (me && !me.battle_tag_verified_at) {
    items.push({ id: 'battletag', href: '/player/profile', count: null });
  }

  return items.slice(0, 3);
}
