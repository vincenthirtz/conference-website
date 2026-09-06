// utils/botEventNames.ts
//
// Liste runtime des évènements bot — CONSTANTE PURE, sans dépendance serveur.
//
// Extraite de `utils/botEvents.ts` parce que ce module-là importe `crypto`
// (Node) et `supabaseAdmin` : le journal Discord de `/admin/logs`, qui ne veut
// que la liste des noms pour son filtre, embarquait de ce fait ~490 ko de
// polyfills Node (crypto-browserify / stream-browserify / vm-browserify /
// buffer) dans le bundle client. `utils/botEvents.ts` ré-exporte la constante
// et le type : côté serveur, rien ne change.

export const BOT_EVENT_NAMES = [
  'match.starting',
  'match.scheduled',
  // Déplacement d'un match DÉJÀ daté. Distinct de `match.scheduled` : une
  // équipe qui apprend « ton match est le X » et une équipe qui apprend « ton
  // match a bougé du X au Y » n'ont pas besoin de la même phrase, ni de la
  // même urgence.
  'match.rescheduled',
  'match.unscheduled',
  'match.disputed',
  'match.dispute.resolved',
  'match.finished',
  'news.published',
  // Post composé dans l'admin (Communication › Réseaux) et poussé vers le salon
  // d'annonces. Le sens INVERSE de news-forwarder.js, qui lui remonte le salon
  // vers le site. Poster via cet event et non via un webhook Discord est ce qui
  // évite le doublon : le forwarder ignore les messages du bot, pas ceux d'un
  // webhook, dont l'identifiant d'auteur est différent.
  'social.post',
  // Recopie d'un post d'un de nos comptes (Bluesky) dans un salon Discord.
  // Distinct de `social.post` : celui-ci part de l'admin vers les réseaux,
  // celui-là revient d'un réseau vers Discord. Le salon est DANS le payload —
  // un miroir vise un salon choisi par qui le configure, et il pourra y en
  // avoir plusieurs, alors qu'un salon d'annonces est unique par tenant.
  'social.mirror',
  'team.created',
  'team.dissolved',
  // Gestion des salons d'équipe DEPUIS L'ADMIN. Le cron autonome qui faisait ça
  // tout seul a été supprimé : il a détruit les salons d'une équipe vivante,
  // puis recréé des salons dont personne ne voulait. Chaque geste est désormais
  // demandé par quelqu'un, depuis /admin/discord/team-channels.
  //
  // `snapshot.request` est une LECTURE : le bot regarde le guild et repose sa
  // photo sur le site. Les autres sont des écritures, une par geste — pas de
  // « réconcilie », qui est justement le mot qui a coûté des salons.
  'team.channels.snapshot.request',
  'team.channels.provision',
  'team.channels.repair',
  'team.channel.deleted',
  // Le rôle a la même règle que les salons : jamais supprimé tout seul, mais
  // supprimable depuis l'admin. Sans ça, un rôle créé par erreur reste à vie —
  // c'est arrivé à deux équipes.
  'team.role.deleted',
  'team.channel.access.granted',
  'team.channel.access.revoked',
  'team.role.granted',
  'team.role.revoked',
  'team.message',
  'team.member.added',
  'team.member.removed',
  'team.captain.changed',
  'staff.role.changed',
  // Demande de scrim adressée à une équipe : DM au capitaine concerné. Un
  // event PAR destinataire (comme checkin.nudge), pour qu'un échec d'envoi
  // n'entraîne pas le renvoi des autres au retry.
  'scrim.request',
  // Traçage dans le salon d'actions du bot : les DM sont partis, puis la
  // décision est tombée. `resolved` est émis par le CŒUR partagé, donc une
  // réponse donnée sur le site apparaît au même titre qu'une réponse Discord.
  'scrim.request.dispatched',
  'scrim.request.resolved',
  'scrim.created',
  'scrim.scheduled',
  'scrim.starting',
  'scrim.finished',
  'scrim.cancelled',
  'scrim.deleted',
  'scrim.planning.opened',
  'scrim.planning.validated',
  'scrim.planning.reminder',
  // R6 — une équipe annonce des créneaux ; on alerte celles dont les créneaux
  // se recoupent. Sans ça, l'annonce attend qu'on vienne la lire.
  'scrim.search.matched',
  'cast.assigned',
  'cast.unassigned',
  'cast.briefing.rescheduled',
  'checkin.opened',
  'team.forfeit',
  // Lot 1 acquisition : une joueuse s'est signalée « sans équipe » depuis le
  // site. Sert à alerter les capitaines dont le roster est incomplet — sans
  // ça, l'inscription attend que quelqu'un vienne la lire.
  'free_player.registered',
  'registration.new',
  'registration.blacklisted',
  'registration.entity_blacklisted',
  'helloasso.payment.received',
  'captain.support.opened',
  'tournament.finalized',
  'dispute.sla_breached',
  'checkin.nudge',
  'broadcast.state_changed',
  'task.created',
  'task.moved',
  'task.assigned',
  'task.board_changed',
  'task.due_soon',
  'task.digest',
  // N7 — récap hebdomadaire d'une équipe. Émis par cron, au plus une fois par
  // équipe et par semaine, et UNIQUEMENT si la semaine a quelque chose à
  // raconter (cf. utils/teams/weeklyRecap.ts).
  'team.weekly.recap',
] as const;

export type BotEventName = (typeof BOT_EVENT_NAMES)[number];
