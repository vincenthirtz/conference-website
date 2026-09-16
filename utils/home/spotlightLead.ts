// utils/home/spotlightLead.ts
//
// CE QUE LA CARTE « L'événement » ANNONCE EN PREMIER.
//
// LE PROBLÈME. La carte menait avec « Complet », puis « Toutes les places sont
// prises pour cette édition », puis trois liens introduits par « en attendant
// la suite ». Trois messages de porte fermée — alors que le tournoi commençait
// DANS DEUX JOURS, et que le pied de la même carte annonçait « vendredi
// 18 septembre, 3 matchs au programme ». Le haut disait « c'est fini pour toi »
// pendant que le bas disait « ça commence vendredi ».
//
// « Complet » est une vraie information, mais elle ne répond qu'à UNE question
// — « puis-je encore inscrire mon équipe ? » — et c'est la question d'une
// minorité de visiteuses, qui cesse d'ailleurs de se poser dès le coup d'envoi.
// La majorité vient voir ce qui se joue.
//
// LA RÈGLE. Dès qu'un début est en vue, c'est l'imminence qui mène ; « complet »
// redevient le titre quand il n'y a rien d'autre à annoncer (début lointain, ou
// date inconnue). Les trois portes de sortie ne disparaissent jamais — une
// visiteuse arrivée trop tard garde les scrims, la recherche d'équipe et la
// saison suivante — elles cessent seulement d'occuper le premier rang.
//
// PUR, `now` INJECTÉ : la carte est rendue au build (ISR 15 min), et un
// compte à rebours qui dépend de l'horloge doit pouvoir être testé sans elle.

/** Au-delà, un début n'est plus « imminent » : on ne va pas décompter un mois. */
export const SPOTLIGHT_IMMINENT_DAYS = 14;

export type SpotlightLead =
  /** Le tournoi se joue : rien ne passe avant. */
  | { kind: 'live' }
  /** Il commence bientôt — `days` vaut 0 le jour même. */
  | { kind: 'starting'; days: number }
  /** Plus de place, et pas de début en vue. */
  | { kind: 'full' }
  /** Les inscriptions sont ouvertes. */
  | { kind: 'open' };

/**
 * Jours pleins entre `now` et le début, en jours CALENDAIRES.
 *
 * On compare des dates, pas des instants : à 23 h la veille, il reste « 1 jour »
 * et non « 0,04 ». C'est ce que dirait quelqu'un qui regarde un calendrier.
 * `null` si la date est absente ou illisible — on ne décompte pas vers l'inconnu.
 */
export function daysUntilStart(
  startDate: string | null | undefined,
  now: Date
): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;

  const startDay = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate()
  );
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return Math.round((startDay - today) / 86_400_000);
}

/**
 * Ce que la carte met en avant.
 *
 * L'ordre des tests EST la décision : ce qui se joue passe avant ce qui va se
 * jouer, qui passe avant ce qu'on ne peut plus rejoindre.
 */
export function spotlightLead(
  input: {
    status?: string | null;
    startDate?: string | null;
    teamCount?: number | null;
    maxTeams?: number | null;
  },
  now: Date
): SpotlightLead {
  if (input.status === 'running') return { kind: 'live' };

  const days = daysUntilStart(input.startDate, now);
  if (days !== null && days >= 0 && days <= SPOTLIGHT_IMMINENT_DAYS) {
    return { kind: 'starting', days };
  }

  // « Complet » se DÉDUIT des places : le jour où une équipe se désiste, la
  // carte réinvite d'elle-même. Un drapeau posé à la main resterait levé.
  const isFull =
    input.maxTeams != null &&
    input.maxTeams > 0 &&
    (input.teamCount ?? 0) >= input.maxTeams;

  return isFull ? { kind: 'full' } : { kind: 'open' };
}
