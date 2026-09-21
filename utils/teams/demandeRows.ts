// utils/teams/demandeRows.ts
//
// La forme d'une ligne `demandes` telle que les routes capitaine la LISENT.
//
// POURQUOI UN MODULE PARTAGÉ, ET PAS UN TYPE DANS CHAQUE ROUTE.
// `pages/api/teams/join-requests.ts` et `pages/api/teams/transfer-requests.ts`
// interrogent la même table, avec le même `select('*')`, et lisent le même
// sous-ensemble de colonnes. Elles portaient chacune leur `(d: any)` et leur
// `(demande.payload as any)?.champ`. Déclarer la forme deux fois aurait recréé
// le problème qu'on corrige : deux vérités qui peuvent diverger.
//
// CE QUE `payload` EST RÉELLEMENT. C'est une colonne JSONB, donc rien en base
// ne garantit ses clés : chaque champ est optionnel, et le rester est une
// information, pas une timidité. Les routes retombent déjà sur des valeurs par
// défaut (`|| 'Joueur'`, `|| 'une equipe'`) — le type dit désormais pourquoi
// ces replis existent, au lieu de les faire passer pour de la superstition.
//
// CE QUE `as any` COÛTAIT ICI. `demande.payload` étant `any`, une clé mal
// orthographiée (`user_displayname` au lieu de `user_display_name`) compilait,
// passait les tests — le mock Supabase ne valide pas les colonnes — et sortait
// en production sous la forme d'une actualité annonçant le transfert de
// « Joueur ». Aucune erreur, juste un nom perdu.

/**
 * Charge utile JSONB d'une demande d'adhésion ou de transfert.
 *
 * Tout est optionnel PAR CONSTRUCTION : la colonne est libre, et une demande
 * ancienne peut avoir été écrite par une version du formulaire qui ne posait
 * pas encore le champ.
 */
export type DemandePayload = {
  desired_role?: string | null;
  user_battle_tag?: string | null;
  user_display_name?: string | null;
  /** Équipe d'origine d'un transfert. Lue pour la news UNIQUEMENT : la mutation
   *  du roster passe par la RPC transactionnelle, qui résout l'appartenance
   *  réelle du joueur — cette valeur-ci peut être périmée. */
  from_team_id?: string | null;
  from_team_name?: string | null;

  // --- Champs lus par le tableau de bord des demandes (admin) --------------
  //
  // Le payload est POLYMORPHE : ce qu'il contient dépend du `type` de la
  // demande. Ces cinq-là n'apparaissent pas sur une adhésion ou un transfert,
  // et les routes capitaine ne les lisent jamais.
  //
  // Ils ont été découverts en typant `pages/admin/demandes/index.tsx`, qui les
  // lisait derrière `payload: any`. C'est précisément ce que le cast coûtait :
  // la liste des champs réellement portés par cette colonne n'existait nulle
  // part, et rien ne reliait ce que l'admin affiche à ce que l'API écrit.
  /** Équipe visée par une demande de scrim ou de rattachement. */
  target_team_name?: string | null;
  /** Créneau souhaité, tel que saisi — chaîne libre, pas une date validée. */
  preferred_date?: string | null;
  /** Discriminant du formulaire d'origine (création d'équipe, rattachement…). */
  request_type?: string | null;
  /** Équipe existante citée quand la demande n'en crée pas une nouvelle. */
  existing_team_name?: string | null;
  /** Nom d'équipe proposé à la création. */
  team_name?: string | null;

  /** Membres joints au dossier, affichés tels quels par la fiche admin. */
  members?: Array<{
    display_name?: string | null;
    email?: string | null;
    battle_tag?: string | null;
    role?: string | null;
  }>;
};

/**
 * Les colonnes réellement lues par les routes capitaine.
 *
 * Le `select('*')` en rapporte davantage ; ne déclarer que celles-ci garde le
 * type honnête sur ce dont le code dépend vraiment.
 */
export type DemandeRow = {
  id: string;
  user_id: string | null;
  status: string;
  comment: string | null;
  payload: DemandePayload | null;
  created_at: string;
};
