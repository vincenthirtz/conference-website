// utils/player/personalDataTables.ts
//
// LE REGISTRE RGPD : pour chaque table qui contient des données d'une joueuse,
// la colonne qui la désigne et ce qu'il advient de ses lignes quand elle
// supprime son compte.
//
// POURQUOI UN REGISTRE. L'export (droit d'accès) et la suppression (droit à
// l'oubli) listaient chacun leurs tables à la main, et les deux listes ne
// couvraient que `staff`, `team_members` et `demandes`, alors que l'interface
// promettait « toutes tes données ». Le trou le plus grave : la photo TCG d'une
// personne réelle, dans un bucket PUBLIC, sans clé étrangère vers `auth.users`
// — une joueuse qui supprimait son compte pour fuir un harcèlement laissait sa
// photo en ligne et n'avait plus de compte pour la retirer. Les deux routes
// lisent désormais CE fichier : elles ne peuvent plus diverger, et le test
// `tests/unit/personalDataTables.test.ts` fait échouer la CI dès qu'une table du
// schéma désigne une utilisatrice sans figurer ici ni dans les exclusions.
//
// LES QUATRE POLITIQUES :
//   - `delete`    : les lignes sont supprimées par la route, AVANT `deleteUser` ;
//   - `anonymise` : les lignes restent, dépersonnalisées (`set`) ;
//   - `cascade`   : la base s'en charge via la clé étrangère vers `auth.users`
//                   (CASCADE supprime, SET NULL rompt le lien) — rien à faire,
//                   mais listée pour l'export ;
//   - `keep`      : conservée telle quelle, raison écrite dans `why`.
//
// LA RÈGLE QUI DÉPARTAGE `delete` ET `keep` : on ne supprime jamais une ligne
// qui fait aussi partie de l'histoire d'une AUTRE joueuse (un match, un échange
// de cartes, un classement). On la garde sans ce qui l'identifie.
//
// ⚠️ TOUT NOM DE COLONNE ICI EST EXÉCUTÉ EN PRODUCTION. Un nom inventé fait
// échouer la suppression (PostgREST 42703) — et la route refuse alors d'effacer
// le compte, pour que la joueuse puisse réessayer. Le test vérifie chaque nom
// contre `database/schema-snapshot.json` ; tenir le snapshot à jour.
//
// Module PUR (aucun import Supabase) : le test de dérive le lit sans mock.
// L'exécution vit dans `utils/player/erasePersonalData.ts` et
// `utils/player/exportPersonalData.ts`.

export type PersonalDataPolicy =
  | { kind: 'delete' }
  | {
      kind: 'anonymise';
      /** Colonnes réécrites sur chacune de ses lignes. */
      set: Readonly<Record<string, string | null>>;
    }
  | {
      kind: 'cascade';
      /** Comportement de la FK, par colonne de `columns`. */
      onDelete: Readonly<Record<string, 'CASCADE' | 'SET NULL'>>;
    }
  | { kind: 'keep' };

export type PersonalDataExport =
  | {
      /** Colonnes lues. Jamais `*` : un secret ajouté plus tard n'y entrerait pas. */
      columns: readonly string[];
      /** Relations PostgREST embarquées (`alias:table(cols)`), lisibilité seulement. */
      embeds?: readonly string[];
      /** Ce que l'export omet volontairement, dit à la joueuse. */
      note?: string;
    }
  | {
      /** La table n'est pas exportée : pourquoi (ce ne sont pas SES données). */
      omit: string;
    };

export type PersonalDataTable = {
  table: string;
  /** Colonnes dont la valeur est l'id `auth.users` de la joueuse. */
  columns: readonly string[];
  policy: PersonalDataPolicy;
  /** La raison de la politique, en une phrase — copiée dans l'export. */
  why: string;
  /** Colonne contenant un chemin du bucket TCG : fichier retiré AVANT les lignes. */
  files?: { column: string };
  /**
   * Mise à jour appliquée AVANT la politique, restreinte par `whereEq`. Sert aux
   * lignes conservées dont l'état « en cours » n'a plus de sens sans elle.
   * `stampNow` : colonne horodatée à l'instant de la suppression.
   */
  neutralise?: {
    whereEq: Readonly<Record<string, string>>;
    set: Readonly<Record<string, string | null>>;
    stampNow?: string;
  };
  /**
   * Après anonymisation, supprime celles de SES lignes qu'aucune ligne de
   * `referencedBy` ne référence plus (clé `key`). Best-effort : l'anonymisation,
   * déjà écrite, suffit à la protéger.
   */
  purgeUnreferenced?: {
    key: string;
    referencedBy: { table: string; column: string };
  };
  export: PersonalDataExport;
};

/** Valeur affichée à la place du nom d'une joueuse qui a supprimé son compte. */
export const REMOVED_PLAYER_NAME = 'Joueuse retirée';

/**
 * L'ORDRE EST L'ORDRE D'EXÉCUTION de la suppression.
 *   1. les échanges en attente sont clos AVANT que ses paquets disparaissent
 *      (sinon une partenaire pourrait accepter un échange dont les cartes
 *      n'existent plus) ;
 *   2. le TCG, puis le reste ;
 *   3. `staff` en dernier des suppressions : c'est la ligne qui porte ses
 *      droits, on la retire quand tout le reste est fait.
 * Les fichiers (`files`) sont retirés avant TOUTES les lignes, cf.
 * `erasePersonalData`.
 */
export const PERSONAL_DATA_TABLES: readonly PersonalDataTable[] = [
  /* ---------------------------------------------------------------- TCG --- */
  {
    table: 'tcg_trades',
    columns: ['proposer_id', 'recipient_id'],
    policy: { kind: 'keep' },
    why: 'Un échange de cartes est aussi l’histoire de sa partenaire. Les deux colonnes sont NOT NULL et soumises à un CHECK (proposer_id <> recipient_id) : elles ne peuvent pas être vidées. Il ne reste qu’un identifiant qui ne renvoie plus à aucun compte. Les propositions en attente sont closes.',
    // `trading_disabled` est la raison prévue par le CHECK pour « la
    // proposante ou la destinataire a désactivé les échanges » : c'est
    // exactement ce qui se passe, et aucune migration n'est nécessaire.
    neutralise: {
      whereEq: { status: 'pending' },
      set: { status: 'cancelled', resolution_reason: 'trading_disabled' },
      stampNow: 'resolved_at',
    },
    export: {
      columns: [
        'id',
        'tenant_id',
        'proposer_id',
        'recipient_id',
        'status',
        'resolution_reason',
        'created_at',
        'expires_at',
        'resolved_at',
      ],
      embeds: [
        'items:tcg_trade_items(side, ordinal, subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, card_mascot_slug, rarity, is_foil)',
      ],
    },
  },
  {
    table: 'tcg_trade_items',
    columns: ['card_user_id'],
    policy: { kind: 'keep' },
    why: 'Sa carte comme SUJET d’échanges entre d’autres joueuses : ces lignes sont leur histoire. Aucune image ni aucun nom n’y est stocké ; la face se relit sur sa fiche de classement anonymisée.',
    export: {
      omit: 'Échanges entre d’autres joueuses où sa carte apparaît : ce sont leurs données.',
    },
  },
  {
    table: 'tcg_player_cards',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Sa photo et son consentement de carte n’appartiennent qu’à elle. Le fichier quitte le bucket public, puis la ligne ; les cartes déjà distribuées retombent sur une face sans photo (elles ne recopient jamais l’image).',
    files: { column: 'photo_path' },
    export: {
      columns: [
        'tenant_id',
        'opted_in_at',
        'revoked_at',
        'photo_path',
        'photo_status',
        'photo_reviewed_at',
        'photo_rejected_reason',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'tcg_fanart_cards',
    columns: ['submitted_by'],
    policy: {
      kind: 'anonymise',
      set: {
        // `revoked` : les lecteurs publics filtrent sur `approved`, donc une
        // carte déjà tirée retombe sur une face neutre (retrait rétroactif prévu
        // par tcg_fanart_cards.sql). Titre et crédit sont SON texte et sa
        // signature : ils partent aussi. Les CHECK exigent 2 à 80 caractères
        // pour `title` et `artist_name`, d'où des libellés plutôt que NULL.
        status: 'revoked',
        title: 'Œuvre retirée',
        artist_name: 'Artiste retirée',
        artist_url: null,
        review_notes: null,
      },
    },
    why: 'Ses fan arts sont retirés et leur fichier supprimé. Une œuvre déjà tirée dans des paquets ne peut pas être effacée (tcg_pack_cards la référence en ON DELETE RESTRICT, ce sont les collections d’autres joueuses) : elle reste, sans image, sans titre ni crédit. Celles que personne ne possède sont supprimées.',
    files: { column: 'image_path' },
    purgeUnreferenced: {
      key: 'id',
      referencedBy: { table: 'tcg_pack_cards', column: 'card_fanart_id' },
    },
    export: {
      columns: [
        'id',
        'tenant_id',
        'title',
        'artist_name',
        'artist_url',
        'image_path',
        'status',
        'rarity',
        'licence_accepted_at',
        'reviewed_at',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'tcg_showcases',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Sa vitrine de profil n’appartient qu’à elle.',
    export: {
      columns: [
        'tenant_id',
        'enabled',
        'subject_keys',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'tcg_trade_settings',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Son réglage d’échanges n’appartient qu’à elle ; sans ligne, elle n’apparaît plus comme partenaire possible.',
    export: { columns: ['tenant_id', 'accepts_proposals', 'updated_at'] },
  },
  {
    table: 'tcg_wallet_entries',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Le registre de ses pièces n’appartient qu’à elle : la monnaie n’est jamais transférée entre joueuses.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'amount',
        'source_kind',
        'source_ref',
        'note',
        'created_at',
      ],
    },
  },
  {
    table: 'tcg_wallets',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Le solde de ses pièces n’appartient qu’à elle.',
    export: { columns: ['tenant_id', 'balance', 'created_at', 'updated_at'] },
  },
  {
    table: 'tcg_packs',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Ses paquets et les cartes qu’ils contiennent (tcg_pack_cards, ON DELETE CASCADE) forment SA collection. Les échanges passés gardent leur trace : tcg_trades.*_pack_id passe à NULL (ON DELETE SET NULL) et tcg_trade_items n’a pas de clé étrangère vers les paquets.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'source_kind',
        'source_match_id',
        'granted_at',
        'opened_at',
      ],
      embeds: [
        'cards:tcg_pack_cards(position, subject_kind, card_user_id, card_team_id, card_map_slug, card_fanart_id, rarity, is_foil, recycled_at)',
      ],
    },
  },
  {
    table: 'tcg_pack_cards',
    columns: ['card_user_id'],
    policy: { kind: 'keep' },
    why: 'Sa carte dans les collections d’AUTRES joueuses : les supprimer viderait leurs collections. La carte ne contient ni photo ni nom ; elle s’affiche sans photo, sous le nom anonymisé de sa fiche de classement.',
    export: {
      omit: 'Exemplaires de sa carte possédés par d’autres joueuses : ce sont leurs collections. Ses propres cartes figurent sous tcg_packs.',
    },
  },

  /* ------------------------------------------------------- Pronostics --- */
  {
    table: 'match_predictions',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Ses pronostics n’appartiennent qu’à elle ; aucun résultat de match n’en dépend.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'match_id',
        'predicted_winner_team_id',
        'result',
        'settled_at',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'match_prediction_settings',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Son choix d’apparaître au classement des pronostics n’appartient qu’à elle.',
    export: { columns: ['tenant_id', 'show_in_leaderboard', 'updated_at'] },
  },

  /* --------------------------------------------------------- Agenda --- */
  {
    table: 'player_calendar_tokens',
    columns: ['auth_user_id'],
    policy: { kind: 'delete' },
    why: 'Un jeton de calendrier est PORTEUR : laissé en base, le lien ICS continuerait de fonctionner après la suppression du compte.',
    export: {
      columns: ['id', 'tenant_id', 'created_at', 'last_used_at', 'revoked_at'],
      note: 'Chaque ligne est un jeton de calendrier émis pour toi. Sa valeur est volontairement omise : c’est un secret qui donne accès à ton agenda.',
    },
  },

  /* ------------------------------------------------------ Classement --- */
  {
    table: 'player_ratings',
    columns: ['user_id'],
    policy: {
      kind: 'anonymise',
      set: {
        display_name: REMOVED_PLAYER_NAME,
        battle_tag: null,
        avatar_url: null,
      },
    },
    why: 'Supprimer la ligne trouerait les classements et les historiques des autres équipes. Les trois colonnes d’identité recopiées (nom, BattleTag, avatar) sont effacées ; restent des chiffres.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'display_name',
        'battle_tag',
        'avatar_url',
        'rating',
        'rd',
        'volatility',
        'games_played',
        'wins',
        'losses',
        'draws',
        'peak_rating',
        'last_match_at',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'match_participants',
    columns: ['user_id'],
    // `battle_tag` DOIT partir : la reconstruction complète des classements
    // (utils/rating/applyMatchRating.ts) relit ce champ pour réécrire
    // `player_ratings.battle_tag`. Le garder annulerait l'anonymisation
    // ci-dessus au prochain recalcul.
    policy: { kind: 'anonymise', set: { battle_tag: null } },
    why: 'La composition figée d’un match sert au calcul du classement des deux équipes : la ligne reste, sans son BattleTag.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'match_id',
        'tournament_id',
        'team_id',
        'battle_tag',
        'role',
        'is_substitute',
        'created_at',
      ],
    },
  },
  {
    table: 'player_rating_history',
    columns: ['user_id'],
    policy: { kind: 'keep' },
    why: 'Des deltas de classement par match, sans aucune donnée d’identité : l’identité affichée est relue sur la fiche de classement, anonymisée. Les classements mensuels et de saison des autres joueuses en dépendent.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'match_id',
        'tournament_id',
        'rating_before',
        'rating_after',
        'rd_before',
        'rd_after',
        'volatility_before',
        'volatility_after',
        'opponent_avg_rating',
        'result',
        'occurred_at',
        'created_at',
      ],
    },
  },

  /* -------------------------------------------- Équipes & recrutement --- */
  {
    table: 'free_players',
    columns: ['auth_user_id'],
    // La FK est ON DELETE SET NULL : sans suppression explicite, l'annonce de
    // joueuse libre — pseudo, contact email et Discord — resterait publique,
    // simplement détachée du compte.
    policy: { kind: 'delete' },
    why: 'Son annonce de joueuse libre contient ses contacts. La base ne ferait que la détacher du compte (SET NULL) et l’annonce resterait visible : elle est supprimée.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'display_name',
        'contact_email',
        'contact_discord',
        'discord_username',
        'roles',
        'level',
        'availability',
        'note',
        'share_across_tenants',
        'source',
        'marked_at',
        'expires_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'broadcast_recipients',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'File et journal d’envoi d’emails : une ligne `pending` enverrait encore un email à une adresse dont le compte n’existe plus.',
    export: {
      columns: [
        'campaign_id',
        'email',
        'label',
        'status',
        'sent_at',
        'error',
        'created_at',
      ],
    },
  },
  {
    table: 'scrim_planning_availabilities',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Ses disponibilités (avec son pseudo recopié) : une disponibilité d’une personne partie n’informe plus personne.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'planning_id',
        'party',
        'display_name',
        'slots',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'team_availability',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Ses disponibilités hebdomadaires n’appartiennent qu’à elle.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'team_id',
        'timezone',
        'slots',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'team_member_permissions',
    columns: ['user_id'],
    policy: { kind: 'delete' },
    why: 'Les droits d’un membre qui n’existe plus : ils n’ont plus d’objet.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'team_id',
        'permission',
        'created_at',
        'revoked_at',
      ],
    },
  },
  {
    table: 'team_members',
    columns: ['user_id'],
    // Sur TOUS les tenants, délibérément : si elle a joué dans deux espaces,
    // les deux sont nettoyés. Vaut pour toutes les suppressions de ce registre.
    policy: { kind: 'delete' },
    why: 'Son appartenance aux équipes et son profil de membre (pseudo, BattleTag, réseaux).',
    export: {
      columns: [
        'id',
        'tenant_id',
        'team_id',
        'role',
        'display_name',
        'battle_tag',
        'avatar_url',
        'pronouns',
        'tagline',
        'specialty',
        'skill_rating',
        'twitch',
        'twitter',
        'is_substitute',
        'accepted_at',
        'created_at',
      ],
      embeds: ['team:teams(id, name, short_name)'],
    },
  },
  {
    table: 'demandes',
    // `auth_user_id` porte les candidatures caster, `user_id` le reste : les
    // deux désignent la joueuse, les deux sont traitées.
    columns: ['user_id', 'auth_user_id'],
    policy: { kind: 'delete' },
    why: 'Ses demandes (adhésion d’équipe, invitations, candidatures).',
    export: {
      columns: [
        'id',
        'tenant_id',
        'type',
        'status',
        'source',
        'team_id',
        'tournament_id',
        'message',
        'comment',
        'payload',
        'metadata',
        'staff_note',
        'created_at',
        'updated_at',
        'handled_at',
        'processed_at',
      ],
    },
  },
  {
    table: 'staff',
    columns: ['auth_user_id'],
    policy: { kind: 'delete' },
    why: 'Son accès staff n’a plus de titulaire. Un compte owner ne peut pas se supprimer lui-même.',
    export: {
      columns: [
        'id',
        'role',
        'display_name',
        'email',
        'avatar_url',
        'is_active',
        'is_pole_admin',
        'created_at',
      ],
    },
  },

  /* --------------------------------------- Histoire partagée, conservée --- */
  {
    table: 'team_audit_logs',
    columns: ['user_id'],
    policy: { kind: 'keep' },
    why: 'Journal des modifications d’une équipe : il appartient à l’équipe, et le vider effacerait qui a changé quoi sur la page d’autres joueuses. Il ne reste qu’un identifiant qui ne renvoie plus à aucun compte.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'team_id',
        'action',
        'payload',
        'created_at',
      ],
    },
  },
  {
    table: 'match_evidence',
    columns: ['submitted_by_auth_user_id'],
    policy: { kind: 'keep' },
    why: 'Preuves déposées dans un litige de match : elles fondent une décision qui concerne l’équipe adverse.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'match_id',
        'team_side',
        'kind',
        'note',
        'external_url',
        'storage_path',
        'mime_type',
        'created_at',
      ],
    },
  },
  {
    table: 'match_score_reports',
    columns: ['reported_by_auth_user_id'],
    policy: { kind: 'keep' },
    why: 'Score déclaré pour un match : il fonde le résultat des deux équipes.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'match_id',
        'team_side',
        'team1_score',
        'team2_score',
        'reported_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'scrim_score_reports',
    columns: ['reported_by_auth_user_id'],
    policy: { kind: 'keep' },
    why: 'Score déclaré pour un scrim : il fonde le résultat des deux équipes.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'scrim_id',
        'team_side',
        'team1_score',
        'team2_score',
        'reported_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'tenant_requests',
    columns: ['requester_auth_user_id'],
    policy: { kind: 'keep' },
    why: 'Demande d’ouverture d’un espace : preuve de l’acceptation des CGV par la personne qui l’a ouvert, et lien vers l’espace créé.',
    export: {
      columns: [
        'id',
        'requested_name',
        'requested_slug',
        'description',
        'requester_email',
        'requester_discord_display_name',
        'status',
        'rejection_reason',
        'cgv_version',
        'cgv_accepted_at',
        'email_verified_at',
        'ip_address',
        'user_agent',
        'created_at',
        'updated_at',
      ],
      note: 'Les jetons de vérification et de révélation des secrets de l’espace sont volontairement omis.',
    },
  },

  /* ---------------------------------------- Gérées par la clé étrangère --- */
  {
    table: 'support_tickets',
    columns: ['reporter_user_id'],
    policy: { kind: 'cascade', onDelete: { reporter_user_id: 'SET NULL' } },
    why: 'Ses signalements au support (dont les signalements de harcèlement) sont des dossiers de modération que l’association doit pouvoir rouvrir. La base les détache du compte ; leur contenu est conservé.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'category',
        'subject',
        'message',
        'status',
        'is_anonymous',
        'reporter_name',
        'reporter_email',
        'created_at',
        'resolved_at',
      ],
    },
  },
  {
    table: 'adherents',
    columns: ['auth_user_id'],
    policy: { kind: 'cascade', onDelete: { auth_user_id: 'SET NULL' } },
    why: 'Registre des membres de l’association et de leurs cotisations : l’association doit le tenir. La base le détache du compte ; une radiation se demande au bureau.',
    export: {
      columns: [
        'id',
        'member_number',
        'first_name',
        'last_name',
        'email',
        'phone',
        'address',
        'postal_code',
        'city',
        'country',
        'birth_date',
        'join_date',
        'current_year',
        'role',
        'is_active',
        'payment_status',
        'payment_date',
        'payment_amount',
        'created_at',
      ],
    },
  },
  {
    table: 'cast_members',
    columns: ['auth_user_id'],
    policy: { kind: 'cascade', onDelete: { auth_user_id: 'SET NULL' } },
    why: 'Fiche publique de caster rédigée par le staff : la base la détache du compte. Son retrait se demande au staff.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'name',
        'title',
        'description',
        'image_url',
        'twitch_url',
        'city',
        'is_active',
        'created_at',
      ],
    },
  },
  {
    table: 'bot_player_actions',
    columns: ['actor_auth_user_id', 'target_auth_user_id'],
    policy: {
      kind: 'cascade',
      onDelete: {
        actor_auth_user_id: 'CASCADE',
        target_auth_user_id: 'SET NULL',
      },
    },
    why: 'Actions faites via le bot Discord : celles qu’elle a faites sont supprimées par la base, celles qui la visaient en sont détachées.',
    export: {
      columns: [
        'id',
        'tenant_id',
        'action',
        'entity_type',
        'entity_id',
        'payload',
        'created_at',
      ],
    },
  },
  {
    table: 'email_deliveries',
    columns: ['user_id'],
    policy: { kind: 'cascade', onDelete: { user_id: 'CASCADE' } },
    why: 'Journal des emails qui lui ont été envoyés.',
    export: {
      columns: ['id', 'tenant_id', 'outbox_event_id', 'status', 'created_at'],
    },
  },
  {
    table: 'notification_prefs',
    columns: ['user_id'],
    policy: { kind: 'cascade', onDelete: { user_id: 'CASCADE' } },
    why: 'Ses préférences de notification.',
    export: { columns: ['event_type', 'channel', 'enabled', 'updated_at'] },
  },
  {
    table: 'push_subscriptions',
    columns: ['user_id'],
    policy: { kind: 'cascade', onDelete: { user_id: 'CASCADE' } },
    why: 'Ses abonnements aux notifications push.',
    export: {
      columns: ['id', 'tenant_id', 'user_agent', 'created_at', 'last_seen_at'],
      note: 'L’adresse d’envoi et les clés de chiffrement de chaque abonnement sont volontairement omises : ce sont des secrets.',
    },
  },
  {
    table: 'player_discovery_profiles',
    columns: ['auth_user_id'],
    policy: { kind: 'cascade', onDelete: { auth_user_id: 'CASCADE' } },
    why: 'Son profil de découverte.',
    export: {
      columns: [
        'display_name',
        'avatar_url',
        'tagline',
        'discoverable',
        'show_ratings',
        'show_teams',
        'opted_in_at',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'player_follows',
    columns: ['follower_id', 'followee_id'],
    policy: {
      kind: 'cascade',
      onDelete: { follower_id: 'CASCADE', followee_id: 'CASCADE' },
    },
    why: 'Les joueuses qu’elle suit et celles qui la suivent.',
    export: { columns: ['follower_id', 'followee_id', 'created_at'] },
  },
  {
    table: 'player_hero_preferences',
    columns: ['auth_user_id'],
    policy: { kind: 'cascade', onDelete: { auth_user_id: 'CASCADE' } },
    why: 'Ses héros préférés.',
    export: { columns: ['picks', 'bans', 'created_at', 'updated_at'] },
  },
  {
    table: 'user_discord_links',
    columns: ['auth_user_id'],
    policy: { kind: 'cascade', onDelete: { auth_user_id: 'CASCADE' } },
    why: 'Le lien entre son compte et son compte Discord.',
    export: {
      columns: [
        'discord_user_id',
        'discord_username',
        'linked_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'user_battlenet_links',
    columns: ['auth_user_id'],
    policy: { kind: 'cascade', onDelete: { auth_user_id: 'CASCADE' } },
    why: 'Le lien entre son compte et son compte Battle.net.',
    export: {
      columns: [
        'battle_net_id',
        'battle_tag',
        'region',
        'verified_at',
        'created_at',
        'updated_at',
      ],
    },
  },
  {
    table: 'user_twitch_links',
    columns: ['auth_user_id'],
    policy: { kind: 'cascade', onDelete: { auth_user_id: 'CASCADE' } },
    why: 'Le lien entre son compte et son compte Twitch.',
    export: {
      columns: ['twitch_user_id', 'twitch_login', 'linked_at', 'updated_at'],
    },
  },
];

/**
 * Colonnes qui désignent une personne SANS que la ligne soit ses données.
 * Clé `table.colonne`, jamais un motif : chaque exception se justifie seule.
 * Le test de dérive échoue si une entrée ne correspond plus au schéma.
 */
export const NOT_PERSONAL_DATA_COLUMNS: Readonly<Record<string, string>> = {
  // Actions de staff : la personne AGIT sur une ligne qui ne la concerne pas.
  'broadcast_schedules.created_by':
    'Membre du staff qui a programmé une campagne (FK SET NULL).',
  'email_campaigns.created_by':
    'Membre du staff qui a créé une campagne (FK SET NULL).',
  'entity_blacklist.banned_by':
    'Membre du staff qui a prononcé un bannissement (FK SET NULL).',
  'player_blacklist.banned_by':
    'Membre du staff qui a prononcé un bannissement (FK SET NULL).',
  'match_lineups.validated_by':
    'Personne qui a validé la composition d’une équipe (FK SET NULL).',
  'match_mvp_polls.winner_imported_by':
    'Membre du staff qui a importé le résultat d’un vote (FK SET NULL).',
  'support_tickets.resolved_by':
    'Membre du staff qui a clos un ticket (FK SET NULL).',
  'event_cues.created_by_user_id':
    'Membre du staff auteur d’une consigne de régie.',
  'event_cues.retracted_by_user_id':
    'Membre du staff qui a retiré une consigne de régie.',
  'twitch_broadcaster_connections.connected_by_user_id':
    'Membre du staff qui a connecté la chaîne Twitch d’un espace.',
  'team_invite_links.created_by':
    'Lien d’invitation d’une ÉQUIPE : il appartient à l’équipe (FK SET NULL).',
  'teams.captain_id':
    'Attribut de l’équipe. Le capitanat se transfère avant de partir ; il n’est pas une donnée de la capitaine.',

  // Identifiants Discord / Twitch : un compte TIERS, pas le compte du site.
  'user_discord_links.discord_user_id':
    'Même ligne que user_discord_links.auth_user_id, déjà au registre.',
  'user_twitch_links.twitch_user_id':
    'Même ligne que user_twitch_links.auth_user_id, déjà au registre.',
  'free_players.discord_user_id':
    'Même ligne que free_players.auth_user_id, déjà au registre. Une annonce créée depuis Discord sans compte n’est pas rattachée au compte du site.',
  'bot_player_actions.actor_discord_user_id':
    'Même ligne que bot_player_actions.actor_auth_user_id, déjà au registre.',
  'bot_player_actions.target_discord_user_id':
    'Même ligne que bot_player_actions.target_auth_user_id, déjà au registre.',
  'match_evidence.discord_user_id':
    'Même ligne que match_evidence.submitted_by_auth_user_id, déjà au registre.',
  'match_score_reports.discord_user_id':
    'Même ligne que match_score_reports.reported_by_auth_user_id, déjà au registre.',
  'support_tickets.discord_user_id':
    'Même ligne que support_tickets.reporter_user_id, déjà au registre.',
  'tenant_requests.requester_discord_user_id':
    'Même ligne que tenant_requests.requester_auth_user_id, déjà au registre.',
  'discord_guild_presence.discord_user_id':
    'Miroir de la présence d’un compte Discord sur un serveur, tenu par le bot : il reflète Discord, pas le compte du site.',
  'player_action_snoozes.discord_user_id':
    'Rappels du bot mis en sourdine par un compte Discord ; expirent d’eux-mêmes (snoozed_until).',
  'player_blacklist.discord_user_id':
    'Bannissement prononcé par le staff : supprimer un compte ne doit pas lever une sanction.',
  'blacklist_alerts.discord_user_id':
    'Alerte de modération sur une personne bannie : même raison que player_blacklist.',
};
