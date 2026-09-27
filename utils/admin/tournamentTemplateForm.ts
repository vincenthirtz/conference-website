// utils/admin/tournamentTemplateForm.ts
//
// Ce qu'un gabarit de tournoi change dans le FORMULAIRE de création, et la
// couleur d'une phase dans son aperçu.
//
// EXTRAIT DE `pages/admin/tournaments/create.tsx`, qui fait partie des
// god-components gelés par `tests/unit/adminFileSizeGuard.test.ts` : la règle
// est « tout lot qui touche un de ces fichiers en sort quelque chose ». Ces
// deux fonctions sont PURES — elles ne lisent aucun état de React — donc elles
// n'avaient rien à faire dans l'écran, et elles se testent seules.

import type { TournamentTemplate } from '@/config/tournament-templates';

/**
 * Les seuls champs du formulaire qu'un gabarit peut poser. Les autres (nom,
 * dates, visuels) restent à l'organisatrice — le nom en particulier est la
 * seule chose qu'elle a déjà tapée quand elle choisit un gabarit.
 */
export type TemplateTargetForm = {
  solo_mode: boolean;
  min_players: string;
  max_players: string;
  max_teams: string;
  is_public: boolean;
};

/**
 * Applique les réglages qu'un gabarit emporte, et rend un formulaire neuf.
 *
 * POURQUOI UN GABARIT TOUCHE AUTRE CHOSE QUE SES PHASES. Une structure ne se
 * suffit pas toujours : un événement « chacune pour soi » laissé avec
 * `solo_mode` à false renvoie les participantes dans le wizard d'équipe, et un
 * `min_players` hérité de la Cup fait remonter « roster incomplet » à chaque
 * inscription. Deux réglages invisibles dans l'aperçu des phases, deux façons
 * de rater l'événement APRÈS avoir choisi le bon gabarit.
 *
 * Les valeurs sont écrites dans le formulaire, sous les yeux de
 * l'organisatrice, et restent modifiables : rien n'est imposé à l'envoi.
 *
 * Un gabarit sans `defaults` rend l'objet d'origine INCHANGÉ (même référence) :
 * désélectionner ne remet rien en arrière, et une valeur relue puis acceptée
 * est devenue celle de l'organisatrice — la lui reprendre surprendrait plus
 * que de la laisser.
 */
export function applyTemplateDefaults<F extends TemplateTargetForm>(
  form: F,
  template: TournamentTemplate | null
): F {
  const d = template?.defaults;
  if (!d) return form;
  return {
    ...form,
    ...(d.solo_mode !== undefined ? { solo_mode: d.solo_mode } : {}),
    ...(d.min_players !== undefined
      ? { min_players: String(d.min_players) }
      : {}),
    ...(d.max_players !== undefined
      ? { max_players: String(d.max_players) }
      : {}),
    ...(d.max_teams !== undefined ? { max_teams: String(d.max_teams) } : {}),
    ...(d.is_public !== undefined ? { is_public: d.is_public } : {}),
  };
}

/** Classes de la pastille d'une phase, par type. */
export function stageTypeBadgeClass(type: string): string {
  switch (type) {
    case 'bracket':
      return 'bg-purple-500/20 text-purple-300 border-purple-500/30';
    case 'swiss':
      return 'bg-amber-500/20 text-amber-300 border-amber-500/30';
    case 'group':
      return 'bg-blue-500/20 text-blue-300 border-blue-500/30';
    case 'round_robin':
      return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    case 'showmatch':
      return 'bg-pink-500/20 text-pink-300 border-pink-500/30';
    case 'ffa':
      return 'bg-orange-500/20 text-orange-300 border-orange-500/30';
    default:
      return 'bg-neutral-500/20 text-neutral-300 border-neutral-500/30';
  }
}
