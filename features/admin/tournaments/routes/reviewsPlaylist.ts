// features/admin/tournaments/routes/reviewsPlaylist.ts — …/[id]/reviews-playlist
// GET : playlist YouTube « Reviews » du tournoi (lecture défensive) ;
// PATCH : URL ou ID collé, extrait + validé ; vide = retrait ; 503 si la
// migration manque.

import { defineAdminRoute, mutate, read } from '@/utils/admin/defineAdminRoute';
import { audited } from '../../_shared/audited';
import { ReviewsPlaylistBody, TournamentDetailQuery } from '../schemas';
import {
  getReviewsPlaylist,
  updateReviewsPlaylist,
} from '../service/reviewsPlaylist';

export default defineAdminRoute({
  key: 'admin-tournament-reviews-playlist',
  guard: { permission: 'manage_tournaments' },
  GET: read({
    query: TournamentDetailQuery,
    handler: ({ query, ctx }) => getReviewsPlaylist(ctx, query.id),
  }),
  PATCH: mutate({
    query: TournamentDetailQuery,
    body: ReviewsPlaylistBody,
    audit: 'tournament_update',
    handler: ({ query, body, ctx }) =>
      audited(ctx, updateReviewsPlaylist(ctx, query.id, body)),
  }),
});
