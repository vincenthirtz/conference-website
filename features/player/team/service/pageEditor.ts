// features/player/team/service/pageEditor.ts — chargement de l'éditeur de
// page publique `/team/[slug]/edit` (lot P10). La page ne touche plus la
// base : son SSR (`defineSubjectPage`) appelle ce service.
//
// Droit : `edit_public_page` du SUJET sur l'équipe, résolu dans le tenant de
// l'équipe (`resolveSubjectTeamPermission`, comme PATCH public-page) ; sous
// act-as, l'équipe doit en plus appartenir au tenant actif du staff. Sans le
// droit : retour à la fiche publique (comportement historique).

import { resolveSubjectTeamPermission } from '@/utils/teams/permissions';
import { tcgTeamImageUrl } from '@/utils/tcg/teamCardImage';
import {
  findEditableTeam,
  listEditableMembers,
} from '../repository/pageEditor';
import type { EditableTeamDto, TeamPageEditorData } from '../schemas';
import type { TeamSubjectContext } from './context';

export type TeamPageEditorOutcome =
  | { kind: 'ok'; data: TeamPageEditorData }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export async function loadTeamPageEditor(
  ctx: TeamSubjectContext,
  slug: string
): Promise<TeamPageEditorOutcome> {
  const row = await findEditableTeam(ctx.db, ctx.tenantId, slug);
  if (!row) return { kind: 'not_found' };
  const team = row as unknown as EditableTeamDto;

  const grant = await resolveSubjectTeamPermission(
    ctx.subject,
    team.id,
    'edit_public_page'
  );
  if (!grant) return { kind: 'forbidden' };

  const members = await listEditableMembers(ctx.db, ctx.tenantId, team.id);
  return {
    kind: 'ok',
    data: {
      team,
      tcgImageUrl: tcgTeamImageUrl(ctx.db.storage, team.tcg_image_path),
      members: members.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        battle_tag: m.battle_tag ?? null,
        role: m.role ?? null,
        // Affichage seulement : la capitaine est signalée dans la liste.
        is_captain: m.user_id === team.captain_id,
        is_substitute: !!m.is_substitute,
        display_name: m.display_name ?? null,
        specialty: m.specialty ?? null,
        avatar_url: m.avatar_url ?? null,
        pronouns: m.pronouns ?? null,
        tagline: m.tagline ?? null,
        twitter: m.twitter ?? null,
        twitch: m.twitch ?? null,
      })),
    },
  };
}
