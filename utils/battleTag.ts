// Anonymat des joueuses sur les pages publiques.
//
// Un BattleTag Overwatch a la forme « Pseudo#1234 » : la partie après le « # »
// est l'identifiant numérique. On la masque sur tout affichage PUBLIC (roster
// de tournoi, page d'équipe publique, MVP…) pour ne pas exposer l'identité
// complète des joueuses. Les espaces privés (espace joueuse/capitaine, édition
// d'équipe, outils casters staff) gardent le tag complet — ils en ont besoin.
//
// À appliquer de préférence côté getStaticProps/getServerSideProps, pour que le
// numéro ne soit même pas sérialisé dans le HTML public (__NEXT_DATA__).

/**
 * Retire l'identifiant numérique d'un BattleTag (tout ce qui suit le premier
 * « # »). « Akira#4422 » → « Akira ». Conserve null/undefined et la valeur telle
 * quelle s'il n'y a pas de « # ». Le typage préserve l'entrée (string/null/undefined).
 */
export function maskBattleTag<T extends string | null | undefined>(tag: T): T {
  if (!tag) return tag;
  const hash = tag.indexOf('#');
  return (hash === -1 ? tag : tag.slice(0, hash)) as T;
}
