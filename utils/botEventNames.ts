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
  // Le miroir du précédent : une ÉQUIPE cherche une joueuse. Annoncé dans un
  // salon distinct (#recherche-joueuse), parce que les deux publics ne sont pas
  // les mêmes — une joueuse sans équipe ne suit pas le salon où les capitaines
  // repèrent les nouvelles inscrites.
  'team_opening.published',
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
  // TCG — une joueuse vient de gagner un paquet.
  //
  // UN ÉVÉNEMENT PAR GAGNANTE, comme `scrim.request` et `checkin.nudge` : un
  // DM refusé (DM fermés) ne doit pas faire rejouer l'envoi aux quatre autres,
  // et le paquet est de toute façon individuel.
  //
  // ÉMIS UNIQUEMENT À LA PREMIÈRE ATTRIBUTION. L'écriture du paquet est un
  // `ON CONFLICT DO NOTHING` dont le `RETURNING` ne rend que l'inséré — donc
  // un rejeu (reprise de cron, correction de score) ne renotifie personne,
  // sans relire avant d'écrire. C'est la relecture préalable qui avait produit
  // quatre publications Discord en double le 2026-09-12.
  'tcg.pack_granted',

  // TCG : une carte réclamée EN DIRECT sur Twitch (points de chaîne).
  //
  // MÊME DISCIPLINE QUE `tcg.pack_granted` : un événement par destinataire, et
  // ÉMIS UNIQUEMENT SUR UNE ATTRIBUTION RÉELLE. `grantTwitchDrop` rend
  // `{ outcome: granted | replayed | unsupported | error, packId }` ; seul
  // `granted` notifie. Depuis le 2026-09-15 la charge porte aussi, en ajout
  // rétrocompatible, `pack: { id } | null` — le paquet `drop` créé avec les
  // pièces, ou `null` s'il a été refusé. Un rejeu
  // de livraison EventSub — Twitch retente volontiers — ne doit renotifier
  // personne, et l'unicité vient du schéma (UNIQUE sur `source_ref` = le
  // direct), jamais d'une relecture préalable.
  //
  // PAS DE NOTIFICATION PUSH POUR CET ÉVÉNEMENT, à dessein : il n'est PAS dans
  // `WEB_PUSH_EVENT_TYPES`. La branche par défaut du dispatcher préviendrait
  // tout le staff du tenant et les pole admins — pour un gain qui ne regarde
  // qu'une personne. Et celle-ci vient précisément de dépenser ses points
  // devant son écran : elle n'a pas besoin qu'on l'avertisse d'un geste qu'elle
  // vient de faire. Le DM Discord suffit, et l'overlay le montre à l'antenne.
  'tcg.drop_granted',

  // TCG : un gain de SÉRIE de check-ins ou de PALMARÈS de tournoi
  // (`reason: 'checkin_streak' | 'tournament_placement'`). Un seul événement
  // pour les deux : même forme (pièces + paquets rattachés à un tournoi), seule
  // la phrase change.
  //
  // MÊME DISCIPLINE QUE `tcg.pack_granted` : un événement par destinataire,
  // émis sur les seules lignes que l'insertion a rendues (`announceTcgRewards`),
  // donc jamais sur un rejeu. `packs` = paquets RÉELLEMENT créés (0 si refusés).
  //
  // Hors `WEB_PUSH_EVENT_TYPES` pour la même raison que le drop : la branche
  // par défaut du dispatcher préviendrait tout le staff du tenant pour un gain
  // qui ne regarde qu'une joueuse.
  'tcg.reward_granted',

  // TCG : une joueuse vient de COMPLÉTER UNE SÉRIE (`utils/tcg/collectionSets.ts`)
  // et la récompense vient d'être écrite. Charge :
  // `{ userId, discordUserId, discordUsername, setKey, setLabel, coins, ctaUrl }`.
  //
  // Un événement distinct de `tcg.reward_granted` plutôt qu'une `reason` de
  // plus : une série n'a ni tournoi, ni rang, ni paquet, mais un libellé et une
  // clé à elle — la forger dans le contrat de l'autre aurait rempli quatre
  // champs de `null`.
  //
  // MÊME DISCIPLINE : un événement par joueuse, émis sur la seule ligne que
  // l'insertion a rendue (`grantCollectionSets.checkCollectionSets`), donc
  // jamais sur un rejeu ni sur la vérification paresseuse qui retombe sur une
  // récompense déjà versée. `setLabel` ne nomme JAMAIS une joueuse (un DM se lit
  // par-dessus l'épaule) : l'équipe, l'édition ou le mode de jeu seulement.
  //
  // Hors `WEB_PUSH_EVENT_TYPES` pour la même raison que les autres gains TCG :
  // la branche par défaut du dispatcher préviendrait tout le staff du tenant.
  'tcg.set_completed',

  // TCG — ÉCHANGES de cartes entre joueuses (`utils/tcg/trades.ts`).
  //
  // `tcg.trade_proposed` : à la DESTINATAIRE, une fois, à la création.
  //   `{ tradeId, recipientUserId, recipientDiscordUserId, proposerDisplayName,
  //      offeredCount, requestedCount, expiresAt, ctaUrl }`
  // `tcg.trade_resolved` : à la PROPOSANTE, quand sa proposition se clôt.
  //   `{ tradeId, proposerUserId, proposerDiscordUserId,
  //      outcome: 'accepted' | 'declined' | 'expired' | 'cancelled',
  //      counterpartDisplayName, ctaUrl }`
  //   `cancelled` seulement quand le SYSTÈME annule (carte offerte plus
  //   disponible, échanges désactivés par la destinataire) — jamais quand la
  //   proposante annule elle-même.
  //
  // MÊME DISCIPLINE que les autres annonces TCG : un événement par
  // destinataire, émis sur la seule transition réellement écrite (écriture
  // conditionnelle `status = 'pending'`, ou retour de la fonction SQL), donc
  // jamais sur un rejeu — double clic, retry réseau, deux déclencheurs
  // d'expiration. Aucune image ni aucun sujet de carte dans la charge.
  //
  // Hors `WEB_PUSH_EVENT_TYPES` : la branche par défaut du dispatcher
  // préviendrait tout le staff du tenant d'un échange entre deux joueuses.
  'tcg.trade_proposed',
  'tcg.trade_resolved',
] as const;

export type BotEventName = (typeof BOT_EVENT_NAMES)[number];
