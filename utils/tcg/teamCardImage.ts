// utils/tcg/teamCardImage.ts
//
// Où vit l'illustration de la carte TCG d'une équipe, et comment on en fait une
// URL.
//
// WHY un module pour si peu : le nom du bucket, la forme du chemin et la
// conversion chemin → URL sont utilisés par l'endpoint qui écrit, par le
// lecteur de faces qui alimente le jeu, et par la page publique de l'équipe.
// Trois copies de la même chaîne, c'est trois occasions de les désaccorder — et
// un désaccord ici ne casse rien : il affiche simplement une image morte.

/** Le bucket public commun à tous les médias d'équipe. */
export const TCG_BUCKET = 'teams-images';

/**
 * Préfixe de chemin d'une image de carte d'équipe, sans l'aléa ni l'extension.
 *
 * Rangée sous `tcg/`, comme les photos de joueuses : un préfixe par usage rend
 * le bucket lisible, et permet de retrouver les fichiers d'une équipe donnée
 * sans interroger la base.
 */
export function tcgTeamImagePrefix(teamId: string): string {
  return `tcg/team-${teamId}`;
}

/**
 * URL publique d'un chemin stocké. `null` reste `null` — c'est le signal que la
 * carte doit retomber sur le logo de l'équipe, et il ne doit pas se transformer
 * en URL vide quelque part en chemin.
 *
 * Le client Supabase est passé en argument plutôt qu'importé : ce module est
 * aussi utilisé côté rendu, où l'on ne veut pas tirer le client d'admin.
 */
export function tcgTeamImageUrl(
  storage: {
    from: (bucket: string) => {
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  },
  path: string | null | undefined
): string | null {
  if (!path) return null;
  return storage.from(TCG_BUCKET).getPublicUrl(path).data.publicUrl;
}
