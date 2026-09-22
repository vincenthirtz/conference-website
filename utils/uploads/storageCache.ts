// utils/uploads/storageCache.ts
//
// Durée de cache des objets Storage envoyés en `upsert: false`.
//
// Sans option, Supabase pose `max-age=3600` : au-delà d'une heure, le CDN
// d'images de Netlify et les navigateurs retéléchargent l'original. En
// septembre 2026, c'est ce qui a fait dépasser le quota « Cached Egress » —
// deux logos de 1,4 Mo et 757 Ko, affichés en 64 px sur l'accueil, relus des
// centaines de fois par jour.
//
// Un an est sûr parce que ces objets sont IMMUABLES : `upsert: false` refuse
// d'écraser un chemin existant, et chaque route nomme ses fichiers de façon
// unique. Ne PAS l'employer avec `upsert: true` : un objet remplacé resterait
// servi périmé pendant un an.
export const IMMUTABLE_UPLOAD_CACHE_CONTROL = '31536000';
