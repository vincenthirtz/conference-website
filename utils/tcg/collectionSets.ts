// utils/tcg/collectionSets.ts
//
// Les SÉRIES du TCG : des ensembles de cartes à compléter. Module PUR (aucune
// I/O), comme `drawPack.ts` et `earnSources.ts` : il décrit, il n'écrit rien.
// La lecture des données vit dans `readCollectionSets.ts`, l'attribution de la
// récompense dans `grantCollectionSets.ts`.
//
// UNE SÉRIE SE DÉRIVE, ELLE NE SE SAISIT PAS. Aucune table « séries », aucun
// écran staff pour les composer : une série est une question posée aux données
// qui existent déjà (le registre des maps, les équipes engagées dans un
// tournoi, leurs rosters). Une liste saisie à la main finirait par diverger de
// ce que le tirage peut réellement donner — et c'est exactement le travers que
// le dépôt a déjà payé quatre fois sur des listes recopiées.
//
// TROIS TYPES, ET POURQUOI CEUX-LÀ.
//   - `map_mode` — toutes les maps d'un mode de jeu (contrôle, escorte…). Le
//     registre `config/maps/overwatch.ts` EST le vivier des cartes de map : la
//     série est complétable par construction et ne représente personne.
//   - `tournament_teams` — toutes les équipes engagées dans une édition
//     (`stage_teams`, la définition de « participante » du cadeau d'accueil).
//     Des sujets déjà publics, rattachés à un moment que la joueuse a vécu.
//   - `team_roster` — la carte d'une équipe et celles de ses joueuses POUR UNE
//     ÉDITION. C'est la plus parlante (« j'ai toute mon équipe ») et la seule
//     qui touche des personnes — d'où les règles ci-dessous.
//   Écartés : « toutes les joueuses d'un tournoi » (une chasse aux personnes à
//   grande échelle, sans le lien affectif du roster) et les séries par rareté
//   (la rareté se fige au tirage et varie d'un exemplaire à l'autre : la série
//   dirait deux choses selon la copie regardée).
//
// UNE SÉRIE N'EST JAMAIS INCOMPLÉTABLE. Chaque carte d'une série appartient au
// VIVIER DU TIRAGE (`drawablePlayerIds`, `drawableTeamIds`, le registre des
// maps) — l'intersection est faite ICI, pas laissée à l'appelant. Deux
// conséquences voulues :
//   - une joueuse qui refuse ou retire sa photo garde sa carte (avatar, aplat) :
//     le consentement photo ne touche PAS l'appartenance à une série, seulement
//     la face affichée ;
//   - le jour où une joueuse pourra demander à ne plus figurer dans le TCG
//     (mécanisme qui n'existe pas au 2026-09-15), la retirer du vivier du tirage
//     la retirera d'office de toutes les séries, qui rétréciront au lieu de
//     devenir incomplétables.
//
// ON NE NOMME JAMAIS UNE JOUEUSE MANQUANTE. Une équipe ou une map manquante est
// nommée (sujets publics, sans enjeu) ; pour les joueuses, seul le NOMBRE est
// rendu. Nommer « il te manque X » ferait de la série un avis de recherche : une
// incitation à chasser la carte d'une personne précise, dans un milieu où les
// joueuses subissent du harcèlement. Le type `SetProgress` le garantit par sa
// FORME — `missingNamed` n'admet que `team` et `map` — plutôt que par la
// prudence de l'appelant.

/** Taille minimale d'une série, en cartes. */
export const MIN_SET_SIZE = 3;

/**
 * Tournois lus au plus (les plus récents d'abord).
 *
 * Borne d'AFFICHAGE autant que de coût : au-delà de dix éditions, la liste des
 * séries deviendrait un inventaire. Une série d'une édition plus ancienne déjà
 * récompensée le reste — la clé du registre ne dépend pas de cette fenêtre.
 */
export const MAX_SET_TOURNAMENTS = 10;

export type CollectionSetKind = 'map_mode' | 'tournament_teams' | 'team_roster';

/**
 * Une série définie. `cards` porte des clés au format de `cardSubjectKey`
 * (`player:<uuid>`, `team:<uuid>`, `map:<slug>`), triées et dédoublonnées.
 */
export type CollectionSetDefinition = {
  /**
   * Identifiant STABLE de la série, recopié dans `tcg_wallet_entries.source_ref`
   * — c'est lui qui rend la récompense unique. Il ne contient que des
   * identifiants (mode, tournoi, équipe), jamais un nom : renommer une équipe
   * ne doit pas rouvrir une récompense déjà versée.
   */
  key: string;
  kind: CollectionSetKind;
  /** Faits bruts : l'interface formule le libellé dans la langue de la lectrice. */
  mode: string | null;
  tournamentId: string | null;
  tournamentName: string | null;
  teamId: string | null;
  teamName: string | null;
  cards: string[];
  /**
   * Noms des cartes PUBLIQUES de la série (équipes, maps), par clé de sujet.
   * AUCUNE entrée `player:` n'y figure, par construction.
   */
  publicNames: Record<string, string>;
};

/** Ce qu'il faut savoir pour définir les séries d'un espace. */
export type CollectionSetSources = {
  /** Le registre des maps, dans son ordre. `layout` = le mode de jeu. */
  maps: ReadonlyArray<{ slug: string; name: string; layout: string | null }>;
  /** Le vivier des joueuses tel que le tirage le lit. */
  drawablePlayerIds: ReadonlySet<string>;
  /** Le vivier des équipes tel que le tirage le lit. */
  drawableTeamIds: ReadonlySet<string>;
  tournaments: ReadonlyArray<{
    id: string;
    name: string | null;
    teams: ReadonlyArray<{
      id: string;
      name: string | null;
      /** Comptes de l'effectif de CETTE édition (cf. `readCollectionSets`). */
      rosterUserIds: readonly string[];
    }>;
  }>;
};

export function mapModeSetKey(mode: string): string {
  return `maps:${mode}`;
}

export function tournamentTeamsSetKey(tournamentId: string): string {
  return `tournament:${tournamentId}`;
}

export function teamRosterSetKey(tournamentId: string, teamId: string): string {
  return `roster:${tournamentId}:${teamId}`;
}

/** Les séries d'un espace. Ordre : maps, puis par tournoi (équipes, rosters). */
export function buildCollectionSets(
  sources: CollectionSetSources
): CollectionSetDefinition[] {
  const sets: CollectionSetDefinition[] = [];

  // 1) Les maps, par mode. L'ordre des modes est celui du registre, qui range
  //    déjà ses maps par mode : aucune seconde liste de modes à tenir à jour.
  const byMode = new Map<string, Array<{ slug: string; name: string }>>();
  for (const map of sources.maps) {
    if (!map.layout || !map.slug) continue;
    const list = byMode.get(map.layout) ?? [];
    list.push({ slug: map.slug, name: map.name });
    byMode.set(map.layout, list);
  }
  for (const [mode, maps] of byMode) {
    const publicNames: Record<string, string> = {};
    const cards = uniqueSorted(
      maps.map((m) => {
        const key = `map:${m.slug}`;
        publicNames[key] = m.name;
        return key;
      })
    );
    if (cards.length < MIN_SET_SIZE) continue;
    sets.push({
      key: mapModeSetKey(mode),
      kind: 'map_mode',
      mode,
      tournamentId: null,
      tournamentName: null,
      teamId: null,
      teamName: null,
      cards,
      publicNames,
    });
  }

  // 2) Par tournoi : ses équipes, puis le roster de chacune.
  for (const tournament of sources.tournaments) {
    // Une équipe hors du vivier (supprimée, inactive) n'a pas de carte
    // tirable : elle sort de la série plutôt que de la rendre incomplétable.
    const teams = dedupeById(tournament.teams).filter((team) =>
      sources.drawableTeamIds.has(team.id)
    );

    const teamNames: Record<string, string> = {};
    for (const team of teams) {
      if (team.name) teamNames[`team:${team.id}`] = team.name;
    }

    const teamCards = uniqueSorted(teams.map((team) => `team:${team.id}`));
    if (teamCards.length >= MIN_SET_SIZE) {
      sets.push({
        key: tournamentTeamsSetKey(tournament.id),
        kind: 'tournament_teams',
        mode: null,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        teamId: null,
        teamName: null,
        cards: teamCards,
        publicNames: { ...teamNames },
      });
    }

    for (const team of teams) {
      const playerCards = team.rosterUserIds
        .filter((userId) => sources.drawablePlayerIds.has(userId))
        .map((userId) => `player:${userId}`);
      const cards = uniqueSorted([`team:${team.id}`, ...playerCards]);
      if (cards.length < MIN_SET_SIZE) continue;
      const teamKey = `team:${team.id}`;
      sets.push({
        key: teamRosterSetKey(tournament.id, team.id),
        kind: 'team_roster',
        mode: null,
        tournamentId: tournament.id,
        tournamentName: tournament.name,
        teamId: team.id,
        teamName: team.name,
        cards,
        // Seul le nom de l'ÉQUIPE : cf. l'en-tête, on ne nomme pas les joueuses.
        publicNames: teamNames[teamKey]
          ? { [teamKey]: teamNames[teamKey] }
          : {},
      });
    }
  }

  return sets;
}

/** Une carte manquante NOMMÉE — jamais une joueuse (cf. l'en-tête). */
export type NamedMissingCard = {
  kind: 'team' | 'map';
  id: string;
  name: string | null;
};

export type CollectionSetProgress = Omit<
  CollectionSetDefinition,
  'cards' | 'publicNames'
> & {
  total: number;
  owned: number;
  complete: boolean;
  /** Équipes et maps manquantes, nommées. */
  missingNamed: NamedMissingCard[];
  /** Joueuses manquantes : un NOMBRE, jamais une liste. */
  missingPlayers: number;
};

/**
 * La progression de chaque série au regard de ce que la joueuse possède.
 *
 * `ownedKeys` : clés de sujet des cartes ENCORE possédées (non recyclées). Une
 * série se lit donc sur l'état présent — une carte recyclée ou cédée fait
 * redescendre le compteur. La RÉCOMPENSE, elle, ne redescend pas : elle vit
 * dans le registre (cf. `grantCollectionSets.ts`).
 */
export function evaluateCollectionSets(
  sets: readonly CollectionSetDefinition[],
  ownedKeys: ReadonlySet<string>
): CollectionSetProgress[] {
  return sets.map(({ cards, publicNames, ...rest }) => {
    let owned = 0;
    let missingPlayers = 0;
    const missingNamed: NamedMissingCard[] = [];
    for (const key of cards) {
      if (ownedKeys.has(key)) {
        owned += 1;
        continue;
      }
      const separator = key.indexOf(':');
      const kind = key.slice(0, separator);
      const id = key.slice(separator + 1);
      if (kind === 'team' || kind === 'map') {
        missingNamed.push({ kind, id, name: publicNames[key] ?? null });
      } else {
        // `player` — et tout type inconnu, compté sans être nommé : dans le
        // doute, on ne nomme personne.
        missingPlayers += 1;
      }
    }
    return {
      ...rest,
      total: cards.length,
      owned,
      complete: cards.length > 0 && owned === cards.length,
      missingNamed,
      missingPlayers,
    };
  });
}

/** Noms français des modes, pour le seul libellé qui part en DM. */
const MODE_LABEL_FR: Record<string, string> = {
  control: 'Contrôle',
  escort: 'Escorte',
  hybrid: 'Hybride',
  push: 'Poussée',
  flashpoint: 'Point chaud',
};

/**
 * Le libellé d'une série pour l'annonce Discord (`tcg.set_completed`).
 *
 * EN FRANÇAIS, CÔTÉ SERVEUR, et c'est la seule exception au « l'API rend le
 * fait » : un DM n'a pas d'interface pour formuler, et les autres annonces TCG
 * portent déjà leurs noms en clair (`tournamentName`). Le vocabulaire est celui
 * de `mapsVoxelPage` (modes) — le même mot sur le site et dans le DM.
 *
 * AUCUN NOM DE JOUEUSE, PAR CONSTRUCTION : la définition n'en porte pas. Un DM
 * se lit par-dessus l'épaule ; il nomme l'équipe ou l'édition, jamais une
 * personne.
 */
export function collectionSetLabelFr(
  set: Pick<
    CollectionSetDefinition,
    'kind' | 'mode' | 'tournamentName' | 'teamName'
  >
): string {
  const edition = set.tournamentName?.trim() || 'édition';
  if (set.kind === 'map_mode') {
    const mode = set.mode ? (MODE_LABEL_FR[set.mode] ?? set.mode) : '';
    return `Maps — ${mode}`.trim();
  }
  if (set.kind === 'tournament_teams') {
    return `Équipes — ${edition}`;
  }
  const team = set.teamName?.trim() || 'équipe';
  return `Roster ${team} — ${edition}`;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function dedupeById<T extends { id: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}
